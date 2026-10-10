// Development-only: read the storage bucket's limits two ways. The management API and the
// underlying row can disagree, so a "missing" limit may simply be unreported.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });

console.log("--- melalui storage API ---");
const { data, error } = await admin.storage.getBucket("event-photos");
console.log(error ? `galat: ${error.message}` : JSON.stringify(data, null, 2));

console.log("\n--- melalui REST ke storage.buckets ---");
const response = await fetch(`${url}/rest/v1/buckets?id=eq.event-photos&select=id,public,file_size_limit,allowed_mime_types`, {
  headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Accept-Profile": "storage" },
});
console.log(response.status, await response.text());
process.exit(0);
