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
    // Run every migration twice: pasting a file into the SQL Editor again must not fail.
    for (let pass = 0; pass < 2; pass++) {
      for (const f of readdirSync("supabase/migrations").sort()) {
        await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
      }
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

  it("shares the result cache between signed-in users", async () => {
    await as(USER_A, "insert into api_cache (kind, key, data) values ('kd', 'plumber|austin-tx', '7')");
    await as(USER_A, "insert into api_cache (kind, key, data) values ('kd', 'plumber|tiny-vt', null)");
    const seen = await as(USER_B, "select key, data from api_cache order by key");
    expect(seen.rows).toEqual([{ key: "plumber|austin-tx", data: 7 }, { key: "plumber|tiny-vt", data: null }]);
    await as(USER_B, `insert into api_cache (kind, key, data) values ('kd', 'plumber|austin-tx', '9')
      on conflict (kind, key) do update set data = excluded.data, created_at = now()`);
    expect((await as(USER_A, "select data from api_cache where key = 'plumber|austin-tx'")).rows[0].data).toBe(9);
    await expect(as(USER_A, "insert into api_cache (kind, key, data) values ('bogus', 'x', '1')")).rejects.toThrow();
    await as(USER_A, "insert into api_cache (kind, key, data) values ('ads', 'plumber|tampa-fl', '{\"cpc\": 44.64}')");
  });
});
