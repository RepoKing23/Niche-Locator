import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const USER_A = "00000000-0000-0000-0000-00000000000a";
const USER_B = "00000000-0000-0000-0000-00000000000b";

// Minimal stand-in for Supabase's auth schema and "authenticated" role.
const AUTH_STUB = `
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role authenticated;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
`;

let db: PGlite;

async function as(user: string, sql: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    return await db.query<Record<string, unknown>>(sql, params);
  } finally {
    await db.exec("reset role;");
  }
}

describe("supabase migration", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(AUTH_STUB);
    for (const f of readdirSync("supabase/migrations").sort()) {
      await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
    }
    await db.exec(`
      grant usage on schema public to authenticated;
      grant all on all tables in schema public to authenticated;
      insert into auth.users values ('${USER_A}'), ('${USER_B}');
    `);
  }, 30000);

  it("creates lists and items owned by the signed-in user", async () => {
    const list = await as(USER_A, "insert into keyword_lists (name) values ('Stairs TX') returning id, user_id");
    expect(list.rows[0].user_id).toBe(USER_A);
    const listId = list.rows[0].id;
    await as(USER_A,
      "insert into list_items (list_id, niche, city_id, keyword, row) values ($1, 'stair installer', 'austin-tx', 'stair installer', '{}')",
      [listId]);
    // Re-saving the same row upserts instead of duplicating.
    await as(USER_A,
      `insert into list_items (list_id, niche, city_id, keyword, row, note) values ($1, 'stair installer', 'austin-tx', 'stair installer', '{"score": 70}', 'x')
       on conflict (list_id, niche, city_id, keyword) do update set row = excluded.row`,
      [listId]);
    const items = await as(USER_A, "select row from list_items");
    expect(items.rows).toHaveLength(1);
    expect(items.rows[0].row).toEqual({ score: 70 });
  });

  it("hides one user's data from another", async () => {
    expect((await as(USER_B, "select * from keyword_lists")).rows).toHaveLength(0);
    expect((await as(USER_B, "select * from list_items")).rows).toHaveLength(0);
    const own = await as(USER_A, "select id from keyword_lists");
    await expect(
      as(USER_B, "insert into list_items (list_id, niche, city_id, keyword, row) values ($1, 'n', 'c', 'k', '{}')", [own.rows[0].id]),
    ).rejects.toThrow(/row-level security/);
    const del = await as(USER_B, "delete from keyword_lists");
    expect(del.affectedRows).toBe(0);
  });

  it("stores reports per user", async () => {
    await as(USER_B, "insert into reports (niche, mode, city_count, data) values ('plumber', 'demo', 3, '{}')");
    expect((await as(USER_A, "select * from reports")).rows).toHaveLength(0);
    expect((await as(USER_B, "select * from reports")).rows).toHaveLength(1);
  });

  it("cascades list deletes to items", async () => {
    await as(USER_A, "delete from keyword_lists");
    expect((await as(USER_A, "select * from list_items")).rows).toHaveLength(0);
  });
});
