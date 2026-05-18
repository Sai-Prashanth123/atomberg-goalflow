import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL ?? "https://sgzboygiqtegxuhhdhmz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_mekni0RsCLI5S276IuxP3g_ypbDAgRI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    flowType: "pkce",
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

export const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
