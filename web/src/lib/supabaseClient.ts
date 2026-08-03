/**
 * Supabase browser client. Uses the publishable (anon) key only; every row
 * the app can touch is gated by the authenticated-role RLS policies from
 * migration 009, unlocked by signing in. Session persistence and refresh
 * are supabase-js defaults (localStorage-backed), so a phone stays signed
 * in between visits.
 */

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False when the deployment is missing its env vars; the app shows a
 * configuration notice instead of failing on the first query. */
export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(
  url ?? "https://not-configured.invalid",
  anonKey ?? "not-configured",
);
