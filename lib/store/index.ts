import { getBrowserSupabase } from "../supabase/client";
import { supabaseConfigured } from "../supabase/config";
import { LocalStore } from "./local";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

export type { Store } from "./types";

let store: Store | null = null;

/** Browser-side store: Supabase when configured, otherwise this browser's localStorage. */
export function getStore(): Store {
  store ??= supabaseConfigured ? new SupabaseStore(getBrowserSupabase()) : new LocalStore(window.localStorage);
  return store;
}
