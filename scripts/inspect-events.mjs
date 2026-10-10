// Development-only: show which content keys each event has, to tell a partially applied
// migration from a failed one. Prints key names only, never guest data.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const { data, error } = await admin.from("events").select("id, slug, status, content");
if (error) { console.log("Gagal membaca:", error.message); process.exit(1); }

for (const row of data) {
  const keys = Object.keys(row.content ?? {}).sort();
  console.log(`\n${row.slug}  [${row.status}]`);
  console.log("  punya hero   :", keys.includes("hero"));
  console.log("  punya gallery:", keys.includes("gallery"));
  console.log("  kunci        :", keys.join(", "));
}
console.log(`\nTotal ${data.length} acara.`);
process.exit(0);
