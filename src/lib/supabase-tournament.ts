// src/lib/supabase-tournament.ts
// Client factories for Live Tournament Tracker pages.
// GM pages: authed client with user's session (RLS enforced).
// Marshal/participant pages: anon client (auth via token in SECURITY DEFINER RPCs).

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Anon client — for marshal app, participant scoring, public results
export function createAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Authed client — for GM dashboard (picks up session from Supabase Auth)
export function createAuthedClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, detectSessionInUrl: true },
  });
}
