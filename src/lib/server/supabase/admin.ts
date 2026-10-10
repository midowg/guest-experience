import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicConfig, requirePrivilegedConfig } from "../config";

export function createPrivilegedClient() {
  const { url, secret } = requirePrivilegedConfig();
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

export function createPublicClient() {
  const { url, key } = publicConfig();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}
