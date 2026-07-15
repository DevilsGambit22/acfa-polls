import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { ACFA_CONFIG } from "./config.js";

const configured =
  ACFA_CONFIG.supabaseUrl.startsWith("https://") &&
  !ACFA_CONFIG.supabaseUrl.includes("PASTE_") &&
  ACFA_CONFIG.supabaseAnonKey.length > 30 &&
  !ACFA_CONFIG.supabaseAnonKey.includes("PASTE_");

export const supabaseConfigured = configured;
export const supabase = configured
  ? createClient(ACFA_CONFIG.supabaseUrl, ACFA_CONFIG.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "x-client-info": "acfa-community-suite-v2" } }
    })
  : null;
