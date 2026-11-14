import { createClient } from "@supabase/supabase-js";

export function getSupabaseServerClient(options: { privileged?: boolean; publicOnly?: boolean } = {}) {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ?? process.env.SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const key = options.privileged ? serverKey : options.publicOnly ? publicKey : serverKey ?? publicKey;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function supabaseConfigurationHelp() {
  return "Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and either SUPABASE_SERVICE_ROLE_KEY (server-only) or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local/Vercel, then restart or redeploy.";
}
