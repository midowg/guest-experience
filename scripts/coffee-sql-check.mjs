/*
 * WG Coffee: runs the Coffee migrations on a real Postgres engine that lives in memory (PGlite:
 * Postgres compiled to WASM), then proves the rules of the database functions and compares every
 * outcome with the JavaScript stand-in the server tests use (src/lib/server/coffee/fake-db.ts).
 *
 * Since F6 (26 Nov 2026) it plays what happens on the live database: migrations 1 and 2 first,
 * orders made under that OLD schema (steps 2 to 5, as before), then migration 3
 * (202612020001_coffee_menu.sql) on top of those orders, run again and again, and the new rules
 * (options stored as NULL, the menu in coffee_drinks, the drink's name kept with the order). A
 * second, fresh database then runs all three and the old rules once more, so the replaced
 * functions are shown to keep every rule they had.
 *
 *   npx --yes --package=@electric-sql/pglite node scripts/coffee-sql-check.mjs
 *
 * Nothing is installed in the project and NO real database is touched: there is no connection
 * string anywhere in this file, and .env is never read. Needs Node 22.18 or newer (it imports the
 * TypeScript stand-in directly).
 *
 * What it cannot prove: a true race. PGlite has ONE connection, so two transactions never overlap;
 * the advisory lock is only shown to be taken with the expected key. "20 claims at once for one
 * place left" must still be run on a real Postgres (docs/coffee/GO-LIVE.md, step 1).
 */
import { existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const VERBOSE = process.argv.includes("--verbose");

/** PGlite from wherever npx put it: a normal import first, then the node_modules next to npx's .bin on PATH. */
async function loadPglite() {
  try { return await import("@electric-sql/pglite"); } catch { /* not next to this file: look on PATH */ }
  const places = [process.env.COFFEE_PGLITE_DIR, ...(process.env.PATH ?? "").split(delimiter).filter(entry => /node_modules[\\/]\.bin[\\/]?$/.test(entry)).map(entry => join(entry, "..", "@electric-sql", "pglite"))];
  for (const place of places) {
    if (place && existsSync(join(place, "dist", "index.js"))) return import(pathToFileURL(join(place, "dist", "index.js")).href);
  }
  console.error("PGlite tidak ditemukan. Jalankan: npx --yes --package=@electric-sql/pglite node scripts/coffee-sql-check.mjs");
  process.exit(2);
}

/** Splits a migration into statements (with the line each starts on); knows comments, quotes and $$ bodies. */
function statements(sql) {
  const found = [];
  let start = 0, index = 0;
  const lineOf = at => sql.slice(0, at).split("\n").length;
  const push = end => {
    const text = sql.slice(start, end);
    const lead = text.match(/^(\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)*/)[0].length;
    if (text.slice(lead).trim()) found.push({ text: text.slice(lead).trim(), line: lineOf(start + lead) });
  };
  while (index < sql.length) {
    const two = sql.slice(index, index + 2);
    if (two === "--") { index = sql.indexOf("\n", index); if (index < 0) index = sql.length; continue; }
    if (two === "/*") { index = sql.indexOf("*/", index) + 2; continue; }
    if (two === "$$") { index = sql.indexOf("$$", index + 2) + 2; continue; }
    if (sql[index] === "'") { index++; while (index < sql.length && !(sql[index] === "'" && sql[index + 1] !== "'")) index += sql[index] === "'" ? 2 : 1; index++; continue; }
    if (sql[index] === ";") { push(index); start = index + 1; }
    index++;
  }
  push(sql.length);
  return found;
}

const results = { pass: 0, fail: [], notes: [] };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(label, got, want) {
  if (same(got, want)) { results.pass++; if (VERBOSE) console.log(`  ok    ${label}`); return true; }
  results.fail.push(label);
  console.log(`  GAGAL ${label}\n        dapat: ${JSON.stringify(got)}\n        harap: ${JSON.stringify(want)}`);
  return false;
}
const note = text => { results.notes.push(text); console.log(`  catatan: ${text}`); };

const PEOPLE = {
  rina: "11111111-1111-4111-8111-111111111111",
  bagas: "22222222-2222-4222-8222-222222222222",
  fajar: "33333333-3333-4333-8333-333333333333",
  dewi: "44444444-4444-4444-8444-444444444444",
  keluar: "55555555-5555-4555-8555-555555555555",
};
const UNKNOWN = "99999999-9999-4999-8999-999999999999";
let keyNo = 0;
const key = () => `aaaaaaaa-0000-4000-8000-${String(++keyNo).padStart(12, "0")}`;

/* ---------- Postgres (PGlite) ---------- */

const SIGNATURES = {
  coffee_submit_claim: { p_employee: "uuid", p_item: "jsonb", p_at: "timestamptz", p_manual: "boolean", p_actor: "uuid", p_actor_label: "text", p_key: "uuid" },
  coffee_submit_meeting: { p_order: "jsonb", p_items: "jsonb", p_key: "uuid" },
  coffee_reopen: { p_order: "uuid", p_actor: "uuid", p_actor_label: "text", p_window_seconds: "integer" },
  coffee_cancel_manual: { p_order: "uuid", p_actor: "uuid", p_actor_label: "text" },
  coffee_delete_drink: { p_slug: "text" },
  coffee_sort_drinks: { p_slugs: "text[]" },
};
/** A value as PostgREST hands it over: text, cast to the argument's type by the database. */
const asText = (value, type) => value == null ? null : type === "jsonb" ? JSON.stringify(value) : type === "text[]" ? `{${value.map(entry => `"${entry}"`).join(",")}}` : String(value);
const pgFail = error => ({ err: error.code === "P0001" ? error.message : error.code ?? String(error.message) });

function pgBackend(pg) {
  const run = async (sql, params = []) => (await pg.query(sql, params)).rows;
  /** Named arguments, as supabase-js `.rpc(name, args)` sends them through PostgREST. */
  const rpc = async (name, args) => {
    const names = Object.keys(args);
    const sql = `select public.${name}(${names.map((arg, index) => `${arg} => $${index + 1}::text::${SIGNATURES[name][arg]}`).join(", ")}) as result`;
    try { return { id: (await run(sql, names.map(arg => asText(args[arg], SIGNATURES[name][arg]))))[0].result ?? null }; } catch (error) { return pgFail(error); }
  };
  return {
    name: "Postgres",
    run,
    rpc,
    async order(id) {
      const [row] = await run("select * from public.coffee_orders where id = $1::text::uuid", [id]);
      if (!row) return null;
      const items = await run("select * from public.coffee_order_items where order_id = $1::text::uuid order by sort, id", [id]);
      return { ...row, items };
    },
    /** Selesai / Tolak as queue.ts issues it: one conditional update, first wins. */
    async decide(id, patch, actor, label, at) {
      try {
        return (await run(`update public.coffee_orders set status = $2, reject_note = $3, processed_by = $4::text::uuid, processed_label = $5, processed_at = $6::text::timestamptz
          where id = $1::text::uuid and status = 'diproses' returning id`, [id, patch.status, patch.reject_note, actor, label, at])).length;
      } catch (error) { return pgFail(error); }
    },
    /** The claimant's own cancel, as claims.ts issues it. */
    async cancelOwn(id, employee) {
      return (await run("update public.coffee_orders set status = 'batal' where id = $1::text::uuid and employee_id = $2::text::uuid and kind = 'klaim' and status = 'diproses' returning id", [id, employee])).length;
    },
    async used(employee, month) {
      return Number((await run("select count(*) as n from public.coffee_orders where employee_id = $1::text::uuid and kind = 'klaim' and quota_month = $2 and status in ('diproses', 'selesai')", [employee, month]))[0].n);
    },
    async orderCount() { return Number((await run("select count(*) as n from public.coffee_orders"))[0].n); },
    async setQuota(column, value) { await run(`update public.coffee_settings set ${column} = $1::text::smallint where id = 1`, [String(value)]); },
    /* The menu (migration 3), as menu.ts reads and writes it. */
    async drink(slug) { return (await run("select slug, name, drink_group, temperatures, photo_key, sort, active from public.coffee_drinks where slug = $1", [slug]))[0] ?? null; },
    async addDrink(row) {
      try {
        await run("insert into public.coffee_drinks (slug, name, drink_group, temperatures, photo_key, sort) values ($1, $2, $3, $4::text::text[], $5, $6)", [row.slug, row.name, row.group ?? "kopi", `{${(row.temperatures ?? ["panas", "es"]).join(",")}}`, row.photo_key ?? null, row.sort ?? 900]);
        return "ok";
      } catch (error) { return error.code; }
    },
    async patchDrink(slug, patch) {
      const keys = Object.keys(patch);
      return (await run(`update public.coffee_drinks set ${keys.map((key, index) => `${key} = $${index + 2}`).join(", ")} where slug = $1 returning slug`, [slug, ...keys.map(key => patch[key])])).length;
    },
    async menuOrder() { return (await run("select slug from public.coffee_drinks order by sort, name")).map(row => row.slug); },
    async usage() { return Object.fromEntries((await run("select slug, orders::int as orders from public.coffee_drink_usage()")).map(row => [row.slug, row.orders])); },
    async addPerson(id, name, category = "karyawan") {
      await pg.exec("reset role;");
      await pg.query("insert into public.employees (id, full_name, category, business_unit, position) values ($1, $2, $3, 'WNS', 'Contoh')", [id, name, category]);
      await pg.exec("set role service_role;");
    },
  };
}

/* ---------- the JavaScript stand-in ---------- */

function fakeBackend(fake) {
  const { client, state, rows } = fake;
  const failed = error => ({ err: error.code === "P0001" ? error.message : error.code ?? error.message });
  return {
    name: "fake-db.ts",
    async rpc(name, args) {
      state.now = new Date();
      const { data, error } = await client.rpc(name, args);
      return error ? failed(error) : { id: data ?? null };
    },
    async order(id) {
      const row = rows("coffee_orders").find(order => order.id === id);
      if (!row) return null;
      return { ...row, items: rows("coffee_order_items").filter(item => item.order_id === id).sort((a, b) => a.sort - b.sort) };
    },
    async decide(id, patch, actor, label, at) {
      const { data, error } = await client.from("coffee_orders").update({ ...patch, processed_by: actor, processed_label: label, processed_at: at }).eq("id", id).eq("status", "diproses").select("id");
      return error ? failed(error) : data.length;
    },
    async cancelOwn(id, employee) {
      const { data } = await client.from("coffee_orders").update({ status: "batal" }).eq("id", id).eq("employee_id", employee).eq("kind", "klaim").eq("status", "diproses").select("id");
      return data.length;
    },
    async used(employee, month) {
      return rows("coffee_orders").filter(row => row.employee_id === employee && row.kind === "klaim" && row.quota_month === month && ["diproses", "selesai"].includes(row.status)).length;
    },
    async orderCount() { return rows("coffee_orders").length; },
    async setQuota(column, value) { rows("coffee_settings")[0][column] = value; },
    async drink(slug) { const row = rows("coffee_drinks").find(drink => drink.slug === slug); return row ? { slug: row.slug, name: row.name, drink_group: row.drink_group, temperatures: row.temperatures, photo_key: row.photo_key ?? null, sort: row.sort, active: row.active } : null; },
    async addDrink(row) {
      const { error } = await client.from("coffee_drinks").insert({ slug: row.slug, name: row.name, drink_group: row.group ?? "kopi", temperatures: row.temperatures ?? ["panas", "es"], photo_key: row.photo_key ?? null, sort: row.sort ?? 900 });
      return error ? error.code : "ok";
    },
    async patchDrink(slug, patch) { const { data } = await client.from("coffee_drinks").update(patch).eq("slug", slug).select("slug"); return data.length; },
    async menuOrder() { return [...rows("coffee_drinks")].sort((a, b) => a.sort - b.sort || String(a.name).localeCompare(String(b.name))).map(row => row.slug); },
    async usage() { const { data } = await client.rpc("coffee_drink_usage", {}); return Object.fromEntries(data.map(row => [row.slug, row.orders])); },
    async addPerson(id, name, category = "karyawan") { rows("employees").push({ id, full_name: name, nickname: name, category, business_unit: "WNS", position: "Contoh", active: true }); },
  };
}

/* ---------- the rules, asked of either one ---------- */

const wibMonth = date => new Date(date.getTime() + 7 * 3_600_000).toISOString().slice(0, 7);
const DRINK = { slug: "kopi-susu", temperature: "es", sugar: "Normal", ice: "Normal" };

/** What of a row the rules are about (ids of people, never the row's own id or number). */
const orderView = row => row && {
  kind: row.kind, round: row.round, parent: row.parent_id ?? null, employee: row.employee_id, name: row.person_name, group: row.person_group ?? null,
  position: row.person_position ?? null, bu: row.person_bu ?? null, room: row.room ?? null, spot: row.room_spot ?? null, guest: row.guest ?? null,
  guests: row.guest_count ?? null, status: row.status, note: row.reject_note ?? null, by: row.processed_by ?? null, byLabel: row.processed_label ?? null,
  processed: row.processed_at != null, sender: row.created_by ?? null, senderLabel: row.created_label ?? null, manual: row.manual, month: row.quota_month,
  print: row.request_print ?? null,
  items: row.items.map(item => ({
    for: item.for_whom, employee: item.employee_id ?? null, name: item.person_name ?? null, group: item.person_group ?? null, guest: item.guest_name ?? null,
    slug: item.drink_slug, other: item.drink_other ?? null, temperature: item.temperature, sugar: item.sugar, ice: item.ice, qty: Number(item.qty), sort: Number(item.sort),
  })),
};

async function rules(b) {
  const tag = label => `[${b.name}] ${label}`;
  const now = new Date();
  const month = wibMonth(now);
  const claim = (who, more = {}) => b.rpc("coffee_submit_claim", {
    p_employee: who, p_item: more.item ?? DRINK, p_at: more.at ?? new Date().toISOString(), p_manual: more.manual ?? false,
    p_actor: "actor" in more ? more.actor : who, p_actor_label: more.label ?? "Contoh", p_key: "key" in more ? more.key : key(),
  });
  const ok = async (label, promise) => { const result = await promise; check(tag(label), "err" in result ? result : "ok", "ok"); return result.id; };
  const refused = async (label, promise, code) => { const result = await promise; check(tag(label), result.err ?? "ok", code); };
  const finish = (id, actor = PEOPLE.dewi, label = "Dewi", at = new Date().toISOString()) => b.decide(id, { status: "selesai", reject_note: null }, actor, label, at);
  const reject = (id, actor = PEOPLE.dewi, label = "Dewi", at = new Date().toISOString()) => b.decide(id, { status: "ditolak", reject_note: "Stok habis" }, actor, label, at);
  const reopen = (id, actor = PEOPLE.dewi, label = "Dewi") => b.rpc("coffee_reopen", { p_order: id, p_actor: actor, p_actor_label: label, p_window_seconds: 300 });
  const cancelManual = id => b.rpc("coffee_cancel_manual", { p_order: id, p_actor: PEOPLE.dewi, p_actor_label: "Dewi" });

  // --- Claims and the quota (karyawan 4, DW 2, intern 2) ---
  const rinaKeys = [key(), key(), key(), key()];
  const rina = [];
  for (const [index, k] of rinaKeys.entries()) rina.push(await ok(`karyawan: klaim ke-${index + 1} dari 4`, claim(PEOPLE.rina, { key: k, label: "Rina" })));
  check(tag("klaim: isi baris dan minumannya"), orderView(await b.order(rina[0])), {
    kind: "klaim", round: 1, parent: null, employee: PEOPLE.rina, name: "Contoh Rina Putri", group: "karyawan", position: "Contoh karyawan", bu: "WNS",
    room: null, spot: null, guest: null, guests: null, status: "diproses", note: null, by: null, byLabel: null, processed: false, sender: PEOPLE.rina, senderLabel: "Rina",
    manual: false, month, print: null,
    items: [{ for: "klaim", employee: PEOPLE.rina, name: null, group: null, guest: null, slug: "kopi-susu", other: null, temperature: "es", sugar: "Normal", ice: "Normal", qty: 1, sort: 0 }],
  });
  await refused("karyawan: klaim ke-5 ditolak", claim(PEOPLE.rina), "COFFEE_QUOTA_FULL");
  check(tag("kunci yang sama dikirim lagi = klaim yang sama (walau jatah penuh)"), (await claim(PEOPLE.rina, { key: rinaKeys[0] })).id, rina[0]);
  await refused("kunci milik orang lain", claim(PEOPLE.bagas, { key: rinaKeys[0] }), "COFFEE_KEY_REUSED");
  await refused("kunci klaim dipakai Catat manual", claim(PEOPLE.rina, { key: rinaKeys[0], manual: true, actor: PEOPLE.dewi }), "COFFEE_KEY_REUSED");
  await refused("kunci bukan uuid", claim(PEOPLE.dewi, { key: "bukan-uuid" }), "22P02");

  const bagas = [await ok("DW: klaim ke-1 dari 2", claim(PEOPLE.bagas)), await ok("DW: klaim ke-2 dari 2", claim(PEOPLE.bagas))];
  await refused("DW: klaim ke-3 ditolak", claim(PEOPLE.bagas), "COFFEE_QUOTA_FULL");
  check(tag("DW masuk kelompok ga"), (await b.order(bagas[0])).person_group, "ga");
  const fajar = [await ok("intern: klaim ke-1 dari 2", claim(PEOPLE.fajar)), await ok("intern: klaim ke-2 dari 2", claim(PEOPLE.fajar))];
  await refused("intern: klaim ke-3 ditolak", claim(PEOPLE.fajar), "COFFEE_QUOTA_FULL");
  check(tag("intern masuk kelompok intern"), (await b.order(fajar[0])).person_group, "intern");

  // Refused and cancelled claims give their place back.
  check(tag("Tolak: satu baris berubah"), await reject(rina[1]), 1);
  await ok("klaim yang ditolak tidak dihitung: boleh klaim lagi", claim(PEOPLE.rina));
  await refused("penuh lagi setelah itu", claim(PEOPLE.rina), "COFFEE_QUOTA_FULL");
  check(tag("pemesan membatalkan klaim yang menunggu"), await b.cancelOwn(rina[2], PEOPLE.rina), 1);
  check(tag("orang lain tidak bisa membatalkan klaim itu"), await b.cancelOwn(rina[3], PEOPLE.bagas), 0);
  await ok("klaim yang dibatalkan tidak dihitung: boleh klaim lagi", claim(PEOPLE.rina));
  await refused("kunci klaim yang sudah ditolak", claim(PEOPLE.rina, { key: rinaKeys[1] }), "COFFEE_KEY_REUSED");
  await refused("kunci klaim yang sudah dibatalkan", claim(PEOPLE.rina, { key: rinaKeys[2] }), "COFFEE_KEY_REUSED");
  check(tag("terpakai bulan ini tetap 4"), await b.used(PEOPLE.rina, month), 4);

  // Selesai / Tolak: the first one wins.
  check(tag("Selesai: yang pertama menang"), await finish(rina[0]), 1);
  check(tag("Selesai kedua pada pesanan yang sama: 0 baris"), await finish(rina[0], PEOPLE.rina, "Rina"), 0);
  check(tag("Tolak setelah Selesai: 0 baris"), await reject(rina[0]), 0);
  check(tag("pemesan tidak bisa membatalkan yang sudah selesai"), await b.cancelOwn(rina[0], PEOPLE.rina), 0);
  check(tag("Selesai: siapa dan kapan tercatat"), (({ status, by, byLabel, processed }) => ({ status, by, byLabel, processed }))(orderView(await b.order(rina[0]))), { status: "selesai", by: PEOPLE.dewi, byLabel: "Dewi", processed: true });

  await refused("karyawan nonaktif", claim(PEOPLE.keluar), "COFFEE_NOT_EMPLOYEE");
  await refused("karyawan tidak dikenal", claim(UNKNOWN), "COFFEE_NOT_EMPLOYEE");
  await refused("minuman 'lainnya' di luar Catat manual", claim(PEOPLE.dewi, { item: { ...DRINK, slug: "lainnya", other: "Teh" } }), "COFFEE_INVALID");
  await refused("waktu 10 menit di depan", claim(PEOPLE.dewi, { at: new Date(Date.now() + 10 * 60_000).toISOString() }), "COFFEE_INVALID");
  await ok("waktu 4 menit di depan masih diterima", claim(PEOPLE.dewi, { at: new Date(Date.now() + 4 * 60_000).toISOString() }));
  const noKey = [await ok("tanpa kunci: klaim pertama", claim(PEOPLE.dewi, { key: null })), await ok("tanpa kunci: klaim kedua", claim(PEOPLE.dewi, { key: null }))];
  check(tag("tanpa kunci: dua baris berbeda"), noKey[0] !== noKey[1], true);

  // Pengaturan changes the quota at once.
  await b.setQuota("quota_karyawan", 5);
  await ok("jatah karyawan dinaikkan ke 5: klaim ke-5 diterima", claim(PEOPLE.rina));
  await refused("klaim ke-6 ditolak", claim(PEOPLE.rina), "COFFEE_QUOTA_FULL");
  await b.setQuota("quota_karyawan", 4);
  await refused("jatah kembali 4: tetap ditolak", claim(PEOPLE.rina), "COFFEE_QUOTA_FULL");

  // The month is WIB's: 23:30 UTC on a month's last day is already the next month in Jakarta.
  const [year, monthNo] = month.split("-").map(Number);
  const lastMonthStart = new Date(Date.UTC(year, monthNo - 2, 1));
  const lastMonth = lastMonthStart.toISOString().slice(0, 7);
  const monthBefore = new Date(Date.UTC(year, monthNo - 3, 1)).toISOString().slice(0, 7);
  const lateNight = new Date(lastMonthStart.getTime() - 30 * 60_000).toISOString();
  const beforeMidnightWib = new Date(lastMonthStart.getTime() - 7 * 3_600_000 - 1000).toISOString();
  const midnightWib = new Date(lastMonthStart.getTime() - 7 * 3_600_000).toISOString();
  const manual = (who, at, more = {}) => claim(who, { manual: true, actor: PEOPLE.dewi, label: "Dewi", at, ...more });
  const manualKey = key();
  const late = await ok("Catat manual mundur: 23:30 UTC hari terakhir bulan", manual(PEOPLE.fajar, lateNight, { key: manualKey }));
  check(tag("23:30 UTC hari terakhir = bulan berikutnya di WIB"), (await b.order(late)).quota_month, lastMonth);
  check(tag("Catat manual: langsung selesai, pencatatnya tercatat"), (({ status, by, byLabel, processed, sender, manual: m }) => ({ status, by, byLabel, processed, sender, m }))(orderView(await b.order(late))),
    { status: "selesai", by: PEOPLE.dewi, byLabel: "Dewi", processed: true, sender: PEOPLE.dewi, m: true });
  const atMidnight = await ok("Catat manual: tepat 00:00 WIB tanggal 1", manual(PEOPLE.fajar, midnightWib));
  check(tag("00:00 WIB tanggal 1 = bulan itu"), (await b.order(atMidnight)).quota_month, lastMonth);
  await refused("Catat manual: jatah bulan lalu penuh (intern 2)", manual(PEOPLE.fajar, new Date(lastMonthStart.getTime() + 86_400_000).toISOString()), "COFFEE_QUOTA_FULL");
  const second = await ok("Catat manual: 23:59:59 WIB hari terakhir", manual(PEOPLE.fajar, beforeMidnightWib));
  check(tag("23:59:59 WIB hari terakhir = bulan sebelumnya"), (await b.order(second)).quota_month, monthBefore);
  await refused("Catat manual: jatah bulan ini penuh", manual(PEOPLE.rina, new Date().toISOString()), "COFFEE_QUOTA_FULL");
  const other = await ok("Catat manual: minuman lainnya", manual(PEOPLE.dewi, new Date().toISOString(), { item: { ...DRINK, slug: "lainnya", other: "  Teh tarik  " } }));
  check(tag("nama minuman lainnya dirapikan"), (await b.order(other)).items[0].drink_other, "Teh tarik");
  check(tag("kunci Catat manual dikirim lagi = catatan yang sama"), (await manual(PEOPLE.fajar, lateNight, { key: manualKey })).id, late);

  // Batalkan catatan.
  await ok("Batalkan catatan manual", cancelManual(late));
  check(tag("catatan batal: siapa yang membatalkan tercatat, pencatat tetap"), (({ status, by, byLabel, processed, sender }) => ({ status, by, byLabel, processed, sender }))(orderView(await b.order(late))),
    { status: "batal", by: PEOPLE.dewi, byLabel: "Dewi", processed: true, sender: PEOPLE.dewi });
  await ok("tempatnya di jatah kembali", manual(PEOPLE.fajar, lateNight));
  await refused("batalkan dua kali", cancelManual(late), "COFFEE_ALREADY_CANCELLED");
  await refused("batalkan pesanan dari aplikasi", cancelManual(bagas[0]), "COFFEE_NOT_MANUAL");
  await refused("batalkan pesanan yang tidak ada", cancelManual(UNKNOWN), "COFFEE_NOT_FOUND");
  await refused("kunci catatan yang sudah dibatalkan", manual(PEOPLE.fajar, lateNight, { key: manualKey }), "COFFEE_KEY_REUSED");

  // Urungkan.
  const ago = seconds => new Date(Date.now() - seconds * 1000).toISOString();
  await finish(bagas[0]);
  await ok("Urungkan oleh pemroses, dalam 5 menit", reopen(bagas[0]));
  check(tag("Urungkan: kembali menunggu, jejak proses dikosongkan"), (({ status, by, byLabel, processed, note: n }) => ({ status, by, byLabel, processed, n }))(orderView(await b.order(bagas[0]))),
    { status: "diproses", by: null, byLabel: null, processed: false, n: null });
  await refused("Urungkan pesanan yang masih menunggu", reopen(bagas[0]), "COFFEE_UNDO_EXPIRED");
  await finish(bagas[0]);
  await refused("Urungkan oleh orang lain", reopen(bagas[0], PEOPLE.rina, "Dewi"), "COFFEE_UNDO_EXPIRED");
  await refused("Urungkan dengan nama lain", reopen(bagas[0], PEOPLE.dewi, "Dewi L"), "COFFEE_UNDO_EXPIRED");
  await ok("Urungkan lagi oleh pemroses", reopen(bagas[0]));
  await finish(bagas[0], PEOPLE.dewi, "Dewi", ago(301));
  await refused("Urungkan setelah 5 menit lewat 1 detik", reopen(bagas[0]), "COFFEE_UNDO_EXPIRED");
  await finish(bagas[1], PEOPLE.dewi, "Dewi", ago(295));
  await ok("Urungkan pada 4 menit 55 detik", reopen(bagas[1]));
  await refused("Urungkan catatan manual", reopen(atMidnight), "COFFEE_UNDO_EXPIRED");
  await refused("Urungkan pesanan yang tidak ada", reopen(UNKNOWN), "COFFEE_NOT_FOUND");
  // A refused claim takes its place again: only while there is room.
  check(tag("Tolak klaim DW"), await reject(bagas[1]), 1);
  const third = await ok("DW klaim lagi (tempat dari yang ditolak)", claim(PEOPLE.bagas));
  await refused("Urungkan klaim yang ditolak saat jatah penuh", reopen(bagas[1]), "COFFEE_QUOTA_FULL");
  check(tag("yang gagal diurungkan tetap ditolak dengan catatannya"), (({ status, note: n }) => ({ status, n }))(orderView(await b.order(bagas[1]))), { status: "ditolak", n: "Stok habis" });
  check(tag("DW membatalkan klaim barunya"), await b.cancelOwn(third, PEOPLE.bagas), 1);
  await ok("Urungkan klaim yang ditolak setelah ada tempat", reopen(bagas[1]));
  check(tag("DW terpakai 1 (satu selesai lama, satu menunggu → 2)"), await b.used(PEOPLE.bagas, month), 2);
  // The super admin has no employee row.
  check(tag("Selesai oleh super admin (tanpa baris karyawan)"), await finish(fajar[0], null, "Super admin"), 1);
  await ok("Urungkan oleh super admin", reopen(fajar[0], null, "Super admin"));

  // --- Meeting orders (Mode GA) ---
  const fajarUsed = await b.used(PEOPLE.fajar, month);
  const meeting = (more = {}, items, k = key()) => b.rpc("coffee_submit_meeting", {
    p_order: {
      pic_id: PEOPLE.rina, room: "Ruang Arjuna", room_spot: "Lantai 2", guest: "  PT Contoh  ", guest_count: 3, parent_id: null,
      actor_id: PEOPLE.bagas, actor_label: "Bagas", ordered_at: new Date().toISOString(), manual: false, print: "cetak-1", ...more,
    },
    p_items: items ?? [
      { for: "tamu", person_id: null, guest_name: "  Budi  ", ...DRINK, qty: 1 },
      { for: "tamu", person_id: null, guest_name: null, ...DRINK, temperature: "panas", qty: 2 },
      { for: "tim", person_id: PEOPLE.fajar, guest_name: null, ...DRINK, sugar: "Sedikit", qty: 1 },
    ],
    p_key: k,
  });
  const guestItem = (name, more = {}) => ({ for: "tamu", person_id: null, guest_name: name, ...DRINK, qty: 1, ...more });
  const meetingKey = key();
  const first = await ok("pesanan rapat: tamu bernama, tamu tanpa nama, tim", meeting({}, undefined, meetingKey));
  const firstRow = await b.order(first);
  check(tag("rapat: isi baris dan minumannya"), orderView(firstRow), {
    kind: "rapat", round: 1, parent: null, employee: PEOPLE.rina, name: "Contoh Rina Putri", group: "karyawan", position: "Contoh karyawan", bu: "WNS",
    room: "Ruang Arjuna", spot: "Lantai 2", guest: "PT Contoh", guests: 3, status: "diproses", note: null, by: null, byLabel: null, processed: false,
    sender: PEOPLE.bagas, senderLabel: "Bagas", manual: false, month, print: "cetak-1",
    items: [
      { for: "tamu", employee: null, name: null, group: null, guest: "Budi", slug: "kopi-susu", other: null, temperature: "es", sugar: "Normal", ice: "Normal", qty: 1, sort: 1 },
      { for: "tamu", employee: null, name: null, group: null, guest: null, slug: "kopi-susu", other: null, temperature: "panas", sugar: "Normal", ice: "Normal", qty: 2, sort: 2 },
      { for: "tim", employee: PEOPLE.fajar, name: "Contoh Fajar Nugroho", group: "intern", guest: null, slug: "kopi-susu", other: null, temperature: "es", sugar: "Sedikit", ice: "Normal", qty: 1, sort: 3 },
    ],
  });
  check(tag("minuman tim di rapat tidak memakai jatah"), await b.used(PEOPLE.fajar, month), fajarUsed);
  const before = await b.orderCount();
  await refused("nama tamu 41 huruf", meeting({}, [guestItem("x".repeat(41))]), "COFFEE_INVALID");
  await refused("nama tamu 41 huruf di baris kedua", meeting({}, [guestItem("Budi"), guestItem("y".repeat(41))]), "COFFEE_INVALID");
  check(tag("pesanan yang ditolak tidak meninggalkan baris"), await b.orderCount(), before);
  await ok("nama tamu 40 huruf", meeting({}, [guestItem("x".repeat(40))]));
  await ok("nama tamu 40 huruf dengan spasi di tepinya", meeting({}, [guestItem(`  ${"x".repeat(40)}  `)]));
  await refused("tanpa minuman", meeting({}, []), "COFFEE_INVALID");
  await refused("41 minuman", meeting({}, Array.from({ length: 41 }, () => guestItem(null))), "COFFEE_INVALID");
  await ok("40 minuman", meeting({}, Array.from({ length: 40 }, () => guestItem(null))));
  await refused("p_items bukan daftar", meeting({}, { for: "tamu" }), "COFFEE_INVALID");
  await refused("minuman untuk 'klaim' di pesanan rapat", meeting({}, [guestItem(null, { for: "klaim" })]), "COFFEE_INVALID");
  await refused("anggota tim nonaktif", meeting({}, [{ for: "tim", person_id: PEOPLE.keluar, ...DRINK, qty: 1 }]), "COFFEE_NOT_EMPLOYEE");
  await refused("PIC nonaktif", meeting({ pic_id: PEOPLE.keluar }), "COFFEE_NOT_EMPLOYEE");
  await refused("waktu rapat 10 menit di depan", meeting({ ordered_at: new Date(Date.now() + 10 * 60_000).toISOString() }), "COFFEE_INVALID");
  check(tag("kunci rapat dikirim lagi dengan isi yang sama"), (await meeting({}, undefined, meetingKey)).id, first);
  await refused("kunci rapat dengan isi lain", meeting({ print: "cetak-2" }, undefined, meetingKey), "COFFEE_KEY_REUSED");
  await refused("kunci rapat dipakai klaim", claim(PEOPLE.rina, { key: meetingKey }), "COFFEE_KEY_REUSED");
  await refused("kunci klaim dipakai rapat", meeting({}, undefined, rinaKeys[3]), "COFFEE_KEY_REUSED");

  // Tambah lagi.
  const round2 = await ok("Tambah lagi pada pesanan hari ini", meeting({ parent_id: first, pic_id: PEOPLE.dewi, room: "Ruang Lain", guest: "Lain", guest_count: 9 }, [guestItem("Sari")]));
  const round2Row = await b.order(round2);
  check(tag("Tambah lagi: nomor sama, putaran 2, PIC dan ruang dari putaran pertama"),
    { number: round2Row.number === firstRow.number, round: round2Row.round, parent: round2Row.parent_id, employee: round2Row.employee_id, room: round2Row.room, guest: round2Row.guest, guests: round2Row.guest_count },
    { number: true, round: 2, parent: first, employee: PEOPLE.rina, room: "Ruang Arjuna", guest: "PT Contoh", guests: 3 });
  const round3 = await ok("Tambah lagi pada putaran kedua", meeting({ parent_id: round2 }, [guestItem(null)]));
  const round3Row = await b.order(round3);
  check(tag("putaran 3 menunjuk putaran pertama"), { number: round3Row.number === firstRow.number, round: round3Row.round, parent: round3Row.parent_id }, { number: true, round: 3, parent: first });
  check(tag("Selesai pada putaran pertama"), await finish(first), 1);
  await ok("Tambah lagi pada pesanan yang sudah selesai", meeting({ parent_id: first }, [guestItem(null)]));
  await ok("Urungkan pesanan rapat", reopen(first));
  check(tag("Tolak putaran pertama"), await reject(first), 1);
  await refused("Tambah lagi pada pesanan yang ditolak", meeting({ parent_id: first }, [guestItem(null)]), "COFFEE_PARENT_CLOSED");
  await refused("Tambah lagi lewat putaran 2 saat putaran pertama ditolak", meeting({ parent_id: round2 }, [guestItem(null)]), "COFFEE_PARENT_CLOSED");
  const old = await ok("pesanan rapat kemarin lusa", meeting({ ordered_at: ago(50 * 3600) }));
  await refused("Tambah lagi pada pesanan bukan hari ini", meeting({ parent_id: old }, [guestItem(null)]), "COFFEE_PARENT_CLOSED");
  await refused("Tambah lagi pada pesanan yang tidak ada", meeting({ parent_id: UNKNOWN }, [guestItem(null)]), "COFFEE_NOT_FOUND");
  await refused("Tambah lagi pada sebuah klaim", meeting({ parent_id: rina[0] }, [guestItem(null)]), "COFFEE_NOT_FOUND");
  // Catat manual for a meeting, as queue.ts sends it (no print, room and guest may be null).
  const manualMeeting = (kind, more = {}) => b.rpc("coffee_submit_meeting", {
    p_order: { pic_id: PEOPLE.rina, room: null, room_spot: null, guest: null, guest_count: null, parent_id: null, actor_id: PEOPLE.dewi, actor_label: "Dewi", ordered_at: ago(3600), manual: true, ...more },
    p_items: [{ ...DRINK, other: null, for: kind, person_id: kind === "tim" ? PEOPLE.rina : null, qty: 3 }],
    p_key: key(),
  });
  const handGuest = await ok("Catat manual: tamu", manualMeeting("tamu"));
  check(tag("Catat manual tamu: langsung selesai, tanpa ruang"), (({ status, by, manual: m, room, guests, items }) => ({ status, by, m, room, guests, qty: items[0].qty, for: items[0].for }))(orderView(await b.order(handGuest))),
    { status: "selesai", by: PEOPLE.dewi, m: true, room: null, guests: null, qty: 3, for: "tamu" });
  const handTeam = await ok("Catat manual: tim", manualMeeting("tim"));
  check(tag("Catat manual tim: orangnya tercatat di minuman"), (({ items }) => ({ employee: items[0].employee, group: items[0].group }))(orderView(await b.order(handTeam))), { employee: PEOPLE.rina, group: "karyawan" });
  check(tag("Catat manual tim tidak memakai jatah (tetap 5, dari saat jatah sempat dinaikkan)"), await b.used(PEOPLE.rina, month), 5);
  await refused("Tambah lagi pada catatan manual", meeting({ parent_id: handGuest }, [guestItem(null)]), "COFFEE_PARENT_CLOSED");
  await refused("Catat manual dengan parent_id", manualMeeting("tamu", { parent_id: first }), "COFFEE_INVALID");
  await ok("Batalkan catatan manual rapat", cancelManual(handGuest));
  check(tag("catatan rapat jadi batal"), (await b.order(handGuest)).status, "batal");
}

/* ---------- F6: the rules of migration 3 (options as NULL, the menu, the kept name), asked of either one ---------- */

const MENU_PEOPLE = { satu: "81111111-1111-4111-8111-111111111111", dua: "82222222-2222-4222-8222-222222222222", tiga: "83333333-3333-4333-8333-333333333333" };

async function menuRules(b) {
  const tag = label => `[${b.name}] ${label}`;
  for (const [name, id] of Object.entries(MENU_PEOPLE)) await b.addPerson(id, `Contoh Menu ${name}`);
  const claim = (who, item, more = {}) => b.rpc("coffee_submit_claim", {
    p_employee: who, p_item: item, p_at: new Date().toISOString(), p_manual: more.manual ?? false, p_actor: more.manual ? PEOPLE.dewi : who, p_actor_label: "Contoh", p_key: key(),
  });
  const ok = async (label, promise) => { const result = await promise; check(tag(label), "err" in result ? result : "ok", "ok"); return result.id; };
  const refused = async (label, promise, code) => { const result = await promise; check(tag(label), result.err ?? "ok", code); };
  const drinkOf = async id => (({ drink_slug, drink_name, drink_other, temperature, sugar, ice }) => ({ slug: drink_slug, name: drink_name ?? null, other: drink_other ?? null, temperature: temperature ?? null, sugar: sugar ?? null, ice: ice ?? null }))((await b.order(id)).items[0]);

  // Options that were not asked are stored as NULL, never as a made-up default.
  const bare = await ok("klaim tanpa opsi (karyawan, bawaan)", claim(MENU_PEOPLE.satu, { slug: "kopi-susu" }));
  check(tag("tanpa opsi: suhu, gula, es NULL; nama minuman disalin"), await drinkOf(bare), { slug: "kopi-susu", name: "Kopi Susu", other: null, temperature: null, sugar: null, ice: null });
  const hot = await ok("klaim panas tanpa takaran es", claim(MENU_PEOPLE.satu, { slug: "cafe-latte", temperature: "panas", sugar: "Sedikit" }));
  check(tag("panas: es NULL, bukan 'Normal' karangan"), await drinkOf(hot), { slug: "cafe-latte", name: "Café Latte", other: null, temperature: "panas", sugar: "Sedikit", ice: null });
  const cold = await ok("klaim es dengan takaran es", claim(MENU_PEOPLE.satu, { slug: "cafe-latte", temperature: "es", sugar: "Normal", ice: "Ekstra" }));
  check(tag("es: ketiganya tersimpan"), await drinkOf(cold), { slug: "cafe-latte", name: "Café Latte", other: null, temperature: "es", sugar: "Normal", ice: "Ekstra" });
  const sweet = await ok("klaim gula saja", claim(MENU_PEOPLE.satu, { slug: "classic-tea", sugar: "Tanpa" }));
  check(tag("gula saja: suhu dan es NULL"), await drinkOf(sweet), { slug: "classic-tea", name: "Classic Tea", other: null, temperature: null, sugar: "Tanpa", ice: null });

  // The drink must be on the menu, shown, and come in the temperature asked for.
  await refused("minuman tak dikenal", claim(MENU_PEOPLE.dua, { slug: "es-teh-manis" }), "COFFEE_DRINK_GONE");
  await refused("tanpa slug", claim(MENU_PEOPLE.dua, {}), "COFFEE_DRINK_GONE");
  await refused("Espresso es", claim(MENU_PEOPLE.dua, { slug: "espresso", temperature: "es", sugar: "Normal" }), "COFFEE_INVALID");
  await refused("Cucumber Ice panas", claim(MENU_PEOPLE.dua, { slug: "cucumber-ice", temperature: "panas", sugar: "Normal" }), "COFFEE_INVALID");
  await ok("Espresso tanpa suhu", claim(MENU_PEOPLE.dua, { slug: "espresso" }));
  check(tag("sembunyikan Americano"), await b.patchDrink("americano", { active: false }), 1);
  await refused("minuman tersembunyi tidak bisa dipesan", claim(MENU_PEOPLE.dua, { slug: "americano" }), "COFFEE_DRINK_GONE");
  const hidden = await ok("minuman tersembunyi masih bisa dicatat manual", claim(MENU_PEOPLE.dua, { slug: "americano" }, { manual: true }));
  check(tag("catatan manual minuman tersembunyi membawa namanya"), (await drinkOf(hidden)).name, "Americano");
  check(tag("tampilkan lagi Americano"), await b.patchDrink("americano", { active: true }), 1);
  await ok("setelah ditampilkan lagi bisa dipesan", claim(MENU_PEOPLE.dua, { slug: "americano" }));
  const other = await ok("'lainnya' di Catat manual", claim(MENU_PEOPLE.dua, { slug: "lainnya", other: " Teh tarik " }, { manual: true }));
  check(tag("'lainnya': nama di drink_other, drink_name kosong"), await drinkOf(other), { slug: "lainnya", name: null, other: "Teh tarik", temperature: null, sugar: null, ice: null });

  // A rename reaches new orders only: the old ones keep the name they were ordered under.
  check(tag("ganti nama Café Latte"), await b.patchDrink("cafe-latte", { name: "Latte Susu" }), 1);
  check(tag("pesanan lama tetap memakai nama lama"), (await drinkOf(hot)).name, "Café Latte");
  const renamed = await ok("klaim setelah ganti nama", claim(MENU_PEOPLE.tiga, { slug: "cafe-latte" }));
  check(tag("pesanan baru memakai nama baru"), (await drinkOf(renamed)).name, "Latte Susu");
  check(tag("kembalikan nama"), await b.patchDrink("cafe-latte", { name: "Café Latte" }), 1);

  // Meeting orders: each line carries what its own audience was asked.
  const meeting = (items, more = {}) => b.rpc("coffee_submit_meeting", {
    p_order: { pic_id: MENU_PEOPLE.tiga, room: "Ruang Contoh", room_spot: null, guest: null, guest_count: null, parent_id: null, actor_id: PEOPLE.bagas, actor_label: "Bagas", ordered_at: new Date().toISOString(), manual: false, ...more },
    p_items: items, p_key: key(),
  });
  const mixed = await ok("rapat: tamu dengan opsi, tim tanpa opsi", meeting([
    { for: "tamu", person_id: null, guest_name: "Budi", slug: "kopi-susu", temperature: "es", sugar: "Normal", ice: "Sedikit", qty: 2 },
    { for: "tamu", person_id: null, guest_name: null, slug: "classic-tea", temperature: "panas", sugar: "Tanpa", qty: 1 },
    { for: "tim", person_id: MENU_PEOPLE.tiga, guest_name: null, slug: "espresso", qty: 1 },
  ]));
  check(tag("rapat: opsi per baris, nama minuman di tiap baris"), (await b.order(mixed)).items.map(item => [item.for_whom, item.drink_name, item.temperature ?? null, item.sugar ?? null, item.ice ?? null, Number(item.qty)]),
    [["tamu", "Kopi Susu", "es", "Normal", "Sedikit", 2], ["tamu", "Classic Tea", "panas", "Tanpa", null, 1], ["tim", "Espresso", null, null, null, 1]]);
  const before = await b.orderCount();
  await refused("rapat dengan minuman tak dikenal di baris kedua", meeting([{ for: "tamu", slug: "kopi-susu", qty: 1 }, { for: "tamu", slug: "tidak-ada", qty: 1 }]), "COFFEE_DRINK_GONE");
  await refused("rapat: 'lainnya' di luar Catat manual", meeting([{ for: "tamu", slug: "lainnya", other: "Teh", qty: 1 }]), "COFFEE_INVALID");
  await refused("rapat: Espresso es", meeting([{ for: "tamu", slug: "espresso", temperature: "es", sugar: "Normal", qty: 1 }]), "COFFEE_INVALID");
  check(tag("pesanan rapat yang ditolak tidak meninggalkan baris"), await b.orderCount(), before);
  const hand = await ok("Catat manual rapat: 'lainnya'", meeting([{ for: "tamu", slug: "lainnya", other: "Wedang uwuh", qty: 2 }], { manual: true, actor_id: PEOPLE.dewi, actor_label: "Dewi" }));
  check(tag("Catat manual rapat 'lainnya': tanpa drink_name"), (({ drink_name, drink_other }) => ({ name: drink_name ?? null, other: drink_other }))((await b.order(hand)).items[0]), { name: null, other: "Wedang uwuh" });

  // Add, order, delete: a drink that was ordered once can only be hidden.
  check(tag("tambah minuman baru"), await b.addDrink({ slug: "teh-tarik", name: "Teh Tarik", group: "non-kopi", sort: 160 }), "ok");
  check(tag("slug yang sama ditolak"), await b.addDrink({ slug: "teh-tarik", name: "Teh Tarik 2" }), "23505");
  await ok("minuman baru bisa dipesan", claim(MENU_PEOPLE.tiga, { slug: "teh-tarik" }));
  await refused("hapus minuman yang pernah dipesan", b.rpc("coffee_delete_drink", { p_slug: "teh-tarik" }), "COFFEE_DRINK_USED");
  check(tag("minuman itu masih ada"), (await b.drink("teh-tarik"))?.name, "Teh Tarik");
  check(tag("tambah minuman lain, dengan foto unggahan"), await b.addDrink({ slug: "wedang-jahe", name: "Wedang Jahe", group: "non-kopi", photo_key: "coffee/drinks/contoh.webp", sort: 170 }), "ok");
  check(tag("hapus minuman yang belum pernah dipesan: menjawab alamat fotonya"), (await b.rpc("coffee_delete_drink", { p_slug: "wedang-jahe" })).id, "coffee/drinks/contoh.webp");
  check(tag("minuman itu hilang"), await b.drink("wedang-jahe"), null);
  await refused("hapus dua kali", b.rpc("coffee_delete_drink", { p_slug: "wedang-jahe" }), "COFFEE_DRINK_NOT_FOUND");
  await refused("minuman yang dihapus tidak bisa dipesan", claim(MENU_PEOPLE.tiga, { slug: "wedang-jahe" }), "COFFEE_DRINK_GONE");

  // Order and usage.
  check(tag("atur urutan: yang tak dikenal dilewati"), (await b.rpc("coffee_sort_drinks", { p_slugs: ["teh-tarik", "espresso", "tidak-ada", "kopi-susu"] })).id, 3);
  check(tag("urutan baru dipakai (di antara yang disebut)"), (await b.menuOrder()).filter(slug => ["teh-tarik", "espresso", "kopi-susu"].includes(slug)), ["teh-tarik", "espresso", "kopi-susu"]);
  const whole = [...(await b.menuOrder())].reverse();
  check(tag("seluruh menu dibalik: semua ditempatkan"), (await b.rpc("coffee_sort_drinks", { p_slugs: whole })).id, whole.length);
  check(tag("urutan seluruh menu persis seperti yang dikirim"), await b.menuOrder(), whole);
  const usage = await b.usage();
  check(tag("pemakaian: per pesanan, 'lainnya' tidak dihitung"), { tehTarik: usage["teh-tarik"], lainnya: usage.lainnya ?? null, espresso: usage.espresso >= 2 }, { tehTarik: 1, lainnya: null, espresso: true });
}

/* ---------- Postgres only: constraints, rights, the helper tables, the lock ---------- */

async function postgresOnly(pg, b) {
  const tag = label => `[Postgres] ${label}`;
  const code = async (sql, params) => { try { await pg.query(sql, params); return "ok"; } catch (error) { return error.code; } };
  const one = async (sql, params) => (await pg.query(sql, params)).rows[0];

  // Constraints the stand-in does not have (the forms and zod say the same before the database is asked).
  // A person of their own, so the quota used up in the rules above is not in the way.
  const extra = "77777777-7777-4777-8777-777777777777";
  await pg.exec("reset role;");
  await pg.query("insert into public.employees (id, full_name) values ($1, 'Contoh Uji Batasan')", [extra]);
  await pg.exec("set role service_role;");
  const waiting = (await b.rpc("coffee_submit_claim", { p_employee: extra, p_item: DRINK, p_at: new Date().toISOString(), p_manual: false, p_actor: extra, p_actor_label: "Uji", p_key: null })).id;
  check(tag("klaim untuk uji batasan tersimpan"), typeof waiting, "string");
  check(tag("Tolak tanpa catatan ditolak batasan"), await code("update public.coffee_orders set status = 'ditolak' where id = $1", [waiting]), "23514");
  check(tag("catatan tolak 2 huruf ditolak batasan"), await code("update public.coffee_orders set status = 'ditolak', reject_note = 'ya' where id = $1", [waiting]), "23514");
  check(tag("status tak dikenal ditolak"), await code("update public.coffee_orders set status = 'hilang' where id = $1", [waiting]), "23514");
  check(tag("klaim tidak boleh punya ruang"), await code("update public.coffee_orders set room = 'Ruang' where id = $1", [waiting]), "23514");
  check(tag("suhu tak dikenal ditolak"), (await b.rpc("coffee_submit_claim", { p_employee: extra, p_item: { ...DRINK, temperature: "hangat" }, p_at: null, p_manual: true, p_actor: PEOPLE.dewi, p_actor_label: "Dewi", p_key: null })).err, "23514");
  check(tag("'lainnya' tanpa nama ditolak batasan"), (await b.rpc("coffee_submit_claim", { p_employee: extra, p_item: { ...DRINK, slug: "lainnya" }, p_at: null, p_manual: true, p_actor: PEOPLE.dewi, p_actor_label: "Dewi", p_key: null })).err, "23514");
  check(tag("p_at kosong = sekarang"), (await b.rpc("coffee_submit_claim", { p_employee: extra, p_item: DRINK, p_at: null, p_manual: true, p_actor: PEOPLE.dewi, p_actor_label: "x".repeat(200), p_key: null })).err, undefined);
  check(tag("nama pelaku dipotong 120 huruf"), (await one("select max(char_length(created_label)) as n from public.coffee_orders")).n, 120);
  check(tag("jumlah tamu 501 ditolak batasan"), (await b.rpc("coffee_submit_meeting", { p_order: { pic_id: PEOPLE.rina, guest_count: 501 }, p_items: [{ for: "tamu", ...DRINK }], p_key: null })).err, "23514");
  check(tag("qty 51 ditolak batasan"), (await b.rpc("coffee_submit_meeting", { p_order: { pic_id: PEOPLE.rina }, p_items: [{ for: "tamu", ...DRINK, qty: 51 }], p_key: null })).err, "23514");
  check(tag("pic_id bukan uuid"), (await b.rpc("coffee_submit_meeting", { p_order: { pic_id: "bukan" }, p_items: [{ for: "tamu", ...DRINK }], p_key: null })).err, "22P02");
  check(tag("pengaturan: hanya satu baris"), await code("insert into public.coffee_settings (id) values (2)"), "23514");
  check(tag("pengaturan: jatah 61 ditolak"), await code("update public.coffee_settings set quota_ga = 61 where id = 1"), "23514");
  // Pengaturan as settings.ts and pin.ts save it (an upsert on id).
  const settings = await one(`insert into public.coffee_settings (id, quota_karyawan, quota_ga, quota_intern, updated_at, updated_label) values (1, 4, 2, 2, now(), 'Dewi')
    on conflict (id) do update set quota_karyawan = excluded.quota_karyawan, quota_ga = excluded.quota_ga, quota_intern = excluded.quota_intern, updated_at = excluded.updated_at, updated_label = excluded.updated_label
    returning quota_karyawan, quota_ga, quota_intern`);
  check(tag("pengaturan disimpan lewat upsert"), settings, { quota_karyawan: 4, quota_ga: 2, quota_intern: 2 });
  check(tag("hash PIN terlalu pendek ditolak"), await code("update public.coffee_settings set ga_pin_hash = 'pendek' where id = 1"), "23514");
  check(tag("hash PIN disimpan"), await code("insert into public.coffee_settings (id, ga_pin_hash, ga_pin_at, ga_pin_label) values (1, $1, now(), 'Dewi') on conflict (id) do update set ga_pin_hash = excluded.ga_pin_hash, ga_pin_at = excluded.ga_pin_at, ga_pin_label = excluded.ga_pin_label", [`s1$${"a".repeat(32)}$${"b".repeat(64)}`]), "ok");
  check(tag("jatah tidak berubah oleh simpan PIN"), (await one("select quota_karyawan from public.coffee_settings where id = 1")).quota_karyawan, 4);

  // PIN tries, as pin.ts writes them: insert first, then updates that name the seq they read.
  const tries = "public.coffee_pin_tries";
  const insertTry = () => code(`insert into ${tries} (employee_id, fails, level, locked_until, updated_at, seq) values ($1, 1, 0, null, now(), 1)`, [PEOPLE.bagas]);
  check(tag("PIN: percobaan pertama tersimpan"), await insertTry(), "ok");
  check(tag("PIN: dua percobaan pertama serentak, yang kedua kena 23505"), await insertTry(), "23505");
  const take = async (seq, next) => (await pg.query(`update ${tries} set fails = $3, level = $4, locked_until = $5::text::timestamptz, updated_at = now(), seq = $6 where employee_id = $1 and seq = $2 returning employee_id`, [PEOPLE.bagas, seq, next.fails, next.level, next.locked ?? null, seq + 1])).rows.length;
  for (let seq = 1; seq <= 3; seq++) check(tag(`PIN: salah ke-${seq + 1} tercatat`), await take(seq, { fails: seq + 1, level: 0 }), 1);
  check(tag("PIN: penulis dengan seq lama kalah"), await take(3, { fails: 4, level: 0 }), 0);
  check(tag("PIN: salah ke-5 mengunci"), await take(4, { fails: 0, level: 1, locked: new Date(Date.now() + 30_000).toISOString() }), 1);
  const lockedRow = await one(`select fails, level, seq::int as seq, locked_until > now() as locked from ${tries} where employee_id = $1`, [PEOPLE.bagas]);
  check(tag("PIN: baris terkunci terbaca"), lockedRow, { fails: 0, level: 1, seq: 5, locked: true });
  check(tag("PIN: akun bukan karyawan ditolak"), await code(`insert into ${tries} (employee_id) values ($1)`, [UNKNOWN]), "23503");
  check(tag("PIN: simpan PIN baru menghapus semua hitungan"), (await pg.query(`delete from ${tries} where fails >= 0 returning employee_id`)).rows.length, 1);

  // Web push tables, as push.ts uses them.
  const subs = "public.coffee_push_subscriptions";
  const save = (employee, endpoint, at) => code(`insert into ${subs} (employee_id, endpoint, p256dh, auth, device, updated_at) values ($1, $2, $3, $4, 'Chrome', $5::text::timestamptz)
    on conflict (endpoint) do update set employee_id = excluded.employee_id, p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device, updated_at = excluded.updated_at`,
  [employee, endpoint, "p".repeat(87), "a".repeat(22), at]);
  const trim = async employee => {
    const extra = (await pg.query(`select id from ${subs} where employee_id = $1 order by updated_at desc, id offset 5 limit 200`, [employee])).rows.map(row => row.id);
    if (extra.length) await pg.query(`delete from ${subs} where id = any($1::uuid[])`, [extra]);
  };
  const endpoint = n => `https://fcm.googleapis.com/fcm/send/perangkat-${n}`;
  for (let n = 1; n <= 7; n++) { check(tag(`push: perangkat ke-${n} tersimpan`), await save(PEOPLE.rina, endpoint(n), new Date(Date.now() - (8 - n) * 60_000).toISOString()), "ok"); await trim(PEOPLE.rina); }
  check(tag("push: lima perangkat terbaru yang tinggal"), (await pg.query(`select endpoint from ${subs} where employee_id = $1 order by updated_at desc, id`, [PEOPLE.rina])).rows.map(row => row.endpoint), [7, 6, 5, 4, 3].map(endpoint));
  check(tag("push: perangkat yang sama disimpan orang lain"), await save(PEOPLE.bagas, endpoint(7), new Date().toISOString()), "ok");
  check(tag("push: perangkat itu pindah, tetap satu baris"), (await pg.query(`select employee_id from ${subs} where endpoint = $1`, [endpoint(7)])).rows, [{ employee_id: PEOPLE.bagas }]);
  check(tag("push: alamat terlalu pendek ditolak"), await save(PEOPLE.rina, "https://", new Date().toISOString()), "23514");
  check(tag("push: last_sent_at bisa diisi"), await code(`update ${subs} set last_sent_at = now() where employee_id = $1`, [PEOPLE.rina]), "ok");
  check(tag("push: hapus per orang dan alamat"), (await pg.query(`delete from ${subs} where employee_id = $1 and endpoint = $2 returning id`, [PEOPLE.rina, endpoint(6)])).rows.length, 1);
  const sent = (event, stamp) => code("insert into public.coffee_push_sent (order_id, event, stamp) values ($1, $2, $3)", [waiting, event, stamp]);
  check(tag("push: kabar pertama tercatat"), await sent("klaim_baru", ""), "ok");
  check(tag("push: kabar yang sama kedua kali kena 23505"), await sent("klaim_baru", ""), "23505");
  check(tag("push: keputusan dengan cap waktu"), await sent("selesai", new Date().toISOString()), "ok");
  check(tag("push: keputusan ulang (cap lain) tercatat lagi"), await sent("selesai", new Date(Date.now() + 1000).toISOString()), "ok");
  check(tag("push: peristiwa tak dikenal ditolak"), await sent("batal", ""), "23514");
  check(tag("push: kabar untuk pesanan yang tidak ada ditolak"), await code("insert into public.coffee_push_sent (order_id, event, stamp) values ($1, 'selesai', '')", [UNKNOWN]), "23503");
  check(tag("push: bersih-bersih kabar lama"), await code("delete from public.coffee_push_sent where sent_at < $1::text::timestamptz", [new Date(Date.now() - 30 * 86_400_000).toISOString()]), "ok");
  // service_role may not update coffee_push_sent (insert, select, delete only): the server never does.
  check(tag("push: service_role tidak boleh mengubah kabar terkirim"), await code("update public.coffee_push_sent set stamp = 'x'"), "42501");

  // admin_grants.
  check(tag("akses admin: 'coffee' diterima"), await code("insert into public.admin_grants (employee_id, apps) values ($1, array['coffee', 'hr'])", [PEOPLE.dewi]), "ok");
  check(tag("akses admin: semua aplikasi lama tetap diterima"), await code("insert into public.admin_grants (employee_id, apps) values ($1, array['acara', 'friday_sharing', 'your_visit', 'wam', 'kuesioner', 'tv', 'wellbeing', 'wam_acara', 'hr', 'coffee'])", [PEOPLE.rina]), "ok");
  check(tag("akses admin: nama asal ditolak"), await code("insert into public.admin_grants (employee_id, apps) values ($1, array['coffee', 'kopi'])", [PEOPLE.bagas]), "23514");
  check(tag("akses admin: mengubah ke nama asal ditolak"), await code("update public.admin_grants set apps = array['pantry'] where employee_id = $1", [PEOPLE.dewi]), "23514");
  check(tag("pemegang akses coffee terbaca (apps @> {coffee})"), (await pg.query("select employee_id from public.admin_grants where apps @> array['coffee'] order by employee_id")).rows.map(row => row.employee_id), [PEOPLE.rina, PEOPLE.dewi]);

  // Rights: the browser's roles get nothing, tables and functions alike.
  for (const role of ["anon", "authenticated"]) {
    await pg.exec(`reset role; set role ${role};`);
    check(tag(`${role}: tabel pesanan tertutup`), await code("select 1 from public.coffee_orders limit 1"), "42501");
    check(tag(`${role}: tabel push tertutup`), await code("select 1 from public.coffee_push_subscriptions limit 1"), "42501");
    check(tag(`${role}: fungsi klaim tertutup`), await code("select public.coffee_submit_claim($1::uuid, '{}'::jsonb, now(), false, null, 'x', null)", [PEOPLE.rina]), "42501");
    check(tag(`${role}: fungsi urungkan tertutup`), await code("select public.coffee_reopen($1::uuid, null, 'x', 300)", [waiting]), "42501");
    check(tag(`${role}: nomor urut tertutup`), await code("select nextval('public.coffee_claim_no')"), "42501");
  }
  await pg.exec("reset role;");
  const open = (await pg.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname like 'coffee\\_%' and c.relkind = 'r' and not c.relrowsecurity`)).rows;
  check(tag("RLS nyala di semua tabel coffee_"), open, []);
  check(tag("tidak ada policy di tabel coffee_"), (await pg.query("select tablename from pg_policies where tablename like 'coffee\\_%'")).rows, []);
  await pg.exec("set role service_role;");

  // The quota's lock: taken inside the function, on the key that coffee_reopen takes too.
  await pg.exec("reset role;");
  const lockOf = async call => {
    await pg.exec("begin;");
    try {
      await call();
      return (await pg.query("select ((classid::bigint << 32) | objid::bigint)::text as key from pg_locks where locktype = 'advisory' and granted")).rows.map(row => row.key);
    } finally { await pg.exec("rollback;"); }
  };
  // A month with room in it (70 days back), so the function gets as far as the lock and the insert.
  const lockKeys = await lockOf(() => pg.query("select public.coffee_submit_claim($1::uuid, $2::jsonb, now() - interval '70 days', true, null, 'kunci', null)", [PEOPLE.dewi, JSON.stringify(DRINK)]));
  const lockMonth = wibMonth(new Date(Date.now() - 70 * 86_400_000));
  const want = await one("select (hashtext($1)::bigint & 4294967295)::text as low", [`coffee:${PEOPLE.dewi}:${lockMonth}`]);
  check(tag("kunci jatah diambil di dalam transaksi klaim (1 kunci, per orang dan bulan WIB)"), lockKeys.map(k => (BigInt(k) & 0xffffffffn).toString()), [want.low]);
  const locksAfter = (await pg.query("select 1 from pg_locks where locktype = 'advisory'")).rows.length;
  check(tag("kunci dilepas saat transaksi selesai"), locksAfter, 0);
  await pg.exec("set role service_role;");

  // Twenty sendings for one place left, ONE AFTER ANOTHER (not a race: PGlite has one connection).
  await pg.exec("reset role;");
  await pg.query("insert into public.employees (id, full_name, category) values ($1, 'Contoh Satu Sisa', 'intern')", ["66666666-6666-4666-8666-666666666666"]);
  await pg.exec("set role service_role;");
  const lone = "66666666-6666-4666-8666-666666666666";
  const claimOnce = k => b.rpc("coffee_submit_claim", { p_employee: lone, p_item: DRINK, p_at: new Date().toISOString(), p_manual: false, p_actor: lone, p_actor_label: "Satu", p_key: k });
  await claimOnce(key());
  const twenty = await Promise.all(Array.from({ length: 20 }, () => claimOnce(key())));
  check(tag("20 kiriman untuk sisa 1 (berurutan, bukan balapan): tepat 1 diterima"), { ok: twenty.filter(r => r.id).length, full: twenty.filter(r => r.err === "COFFEE_QUOTA_FULL").length }, { ok: 1, full: 19 });
  const oneKey = key();
  const sameKey = await Promise.all(Array.from({ length: 20 }, () => b.rpc("coffee_submit_claim", { p_employee: PEOPLE.dewi, p_item: DRINK, p_at: new Date(Date.now() - 100 * 86_400_000).toISOString(), p_manual: true, p_actor: PEOPLE.dewi, p_actor_label: "Dewi", p_key: oneKey })));
  check(tag("20 kiriman dengan satu kunci (berurutan): satu baris"), new Set(sameKey.map(r => r.id)).size, 1);
  // What the server falls back on when two sendings of one key meet at the unique index.
  check(tag("kunci ganda di tingkat tabel = 23505"), await code("insert into public.coffee_orders (kind, number, employee_id, person_name, person_group, quota_month, idempotency_key) values ('klaim', 999999, $1, 'x', 'karyawan', '2026-01', $2)", [PEOPLE.dewi, oneKey]), "23505");
  check(tag("nomor + putaran ganda di tingkat tabel = 23505"), await code("insert into public.coffee_orders (kind, number, round, employee_id, person_name, quota_month) select kind, number, round, employee_id, person_name, quota_month from public.coffee_orders where kind = 'rapat' limit 1"), "23505");

  // A refused meeting order still uses up a number (a sequence never rolls back): numbers may skip.
  const seqBefore = Number((await one("select last_value from public.coffee_meeting_no")).last_value);
  await b.rpc("coffee_submit_meeting", { p_order: { pic_id: PEOPLE.rina }, p_items: [{ for: "tamu", guest_name: "z".repeat(41), ...DRINK }], p_key: null });
  const seqAfter = Number((await one("select last_value from public.coffee_meeting_no")).last_value);
  if (seqAfter !== seqBefore) note("Nomor rapat (T-xxxx) bisa melompat: pesanan yang ditolak di tengah jalan tetap memakai satu nomor urut (sifat sequence Postgres, bukan salah).");
}

/* ---------- Postgres only, after migration 3: the menu's constraints and rights ---------- */

async function menuPostgresOnly(pg) {
  const tag = label => `[Postgres] ${label}`;
  const code = async (sql, params) => { try { await pg.query(sql, params); return "ok"; } catch (error) { return error.code; } };
  await pg.exec("reset role;");
  const drink = (slug, more = {}) => code("insert into public.coffee_drinks (slug, name, drink_group, temperatures) values ($1, $2, $3, $4::text::text[])", [slug, more.name ?? "Contoh", more.group ?? "kopi", more.temperatures ?? "{panas,es}"]);
  check(tag("menu: slug 'lainnya' ditolak"), await drink("lainnya"), "23514");
  check(tag("menu: slug berhuruf besar, bergaris bawah, atau diawali tanda hubung ditolak"), [await drink("Teh Manis"), await drink("teh_manis"), await drink("-teh")], ["23514", "23514", "23514"]);
  check(tag("menu: slug 41 huruf ditolak"), await drink("a".repeat(41)), "23514");
  check(tag("menu: nama kosong ditolak"), await drink("contoh-kosong", { name: "   " }), "23514");
  check(tag("menu: kelompok tak dikenal ditolak"), await drink("contoh-kelompok", { group: "jus" }), "23514");
  check(tag("menu: suhu tak dikenal, kosong, atau ganda ditolak"), [await drink("contoh-suhu", { temperatures: "{hangat}" }), await drink("contoh-suhu", { temperatures: "{}" }), await drink("contoh-suhu", { temperatures: "{es,es}" })], ["23514", "23514", "23514"]);
  check(tag("menu: satu suhu diterima"), await drink("contoh-satu-suhu", { temperatures: "{es}" }), "ok");
  check(tag("menu: hapus langsung minuman contoh"), await code("delete from public.coffee_drinks where slug = 'contoh-satu-suhu'"), "ok");
  check(tag("opsi: gula tak dikenal tetap ditolak, walau NULL boleh"), await code("update public.coffee_order_items set sugar = 'Banyak' where id = (select id from public.coffee_order_items limit 1)"), "23514");
  check(tag("opsi: suhu, gula, es boleh NULL di tabel"), (await pg.query("select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'coffee_order_items' and column_name in ('temperature', 'sugar', 'ice') order by column_name")).rows.map(row => `${row.column_name}:${row.is_nullable}`), ["ice:YES", "sugar:YES", "temperature:YES"]);
  check(tag("opsi: nama pengubah opsi paling panjang 120 huruf"), await code("update public.coffee_settings set options_label = $1 where id = 1", ["x".repeat(121)]), "23514");
  // Pengaturan → Opsi minuman as settings.ts saves it (an upsert on id); the quotas are not touched.
  check(tag("opsi disimpan lewat upsert"), await code(`insert into public.coffee_settings (id, opt_klaim_gula, options_at, options_label) values (1, true, now(), 'Dewi')
    on conflict (id) do update set opt_klaim_gula = excluded.opt_klaim_gula, options_at = excluded.options_at, options_label = excluded.options_label`), "ok");
  check(tag("opsi tersimpan, jatah tetap"), (await pg.query("select opt_klaim_gula, quota_karyawan from public.coffee_settings where id = 1")).rows[0], { opt_klaim_gula: true, quota_karyawan: 4 });
  await pg.query("update public.coffee_settings set opt_klaim_gula = false where id = 1");
  for (const role of ["anon", "authenticated"]) {
    await pg.exec(`reset role; set role ${role};`);
    check(tag(`${role}: tabel menu tertutup`), await code("select 1 from public.coffee_drinks limit 1"), "42501");
    check(tag(`${role}: fungsi hapus minuman tertutup`), await code("select public.coffee_delete_drink('kopi-susu')"), "42501");
    check(tag(`${role}: fungsi urutan tertutup`), await code("select public.coffee_sort_drinks(array['kopi-susu'])"), "42501");
    check(tag(`${role}: fungsi pemakaian tertutup`), await code("select * from public.coffee_drink_usage()"), "42501");
    check(tag(`${role}: fungsi klaim tetap tertutup setelah diganti`), await code("select public.coffee_submit_claim($1::uuid, '{}'::jsonb, now(), false, null, 'x', null)", [PEOPLE.rina]), "42501");
    check(tag(`${role}: fungsi rapat tetap tertutup setelah diganti`), await code("select public.coffee_submit_meeting('{}'::jsonb, '[]'::jsonb, null)"), "42501");
  }
  await pg.exec("reset role;");
  check(tag("RLS nyala di semua tabel coffee_, termasuk menu"), (await pg.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname like 'coffee\\_%' and c.relkind = 'r' and not c.relrowsecurity`)).rows, []);
  check(tag("tidak ada policy di tabel coffee_"), (await pg.query("select tablename from pg_policies where tablename like 'coffee\\_%'")).rows, []);
  // The shared lock a claim takes on its drink is what coffee_delete_drink waits for (one connection here: only shown to be taken).
  await pg.exec("begin;");
  let locks = [];
  try {
    await pg.query("select public.coffee_submit_claim($1::uuid, $2::jsonb, now() - interval '200 days', true, null, 'kunci', null)", [PEOPLE.dewi, JSON.stringify({ slug: "kopi-hitam" })]);
    locks = (await pg.query("select l.mode from pg_locks l join pg_class c on c.oid = l.relation where c.relname = 'coffee_drinks' and l.locktype = 'relation' and l.granted")).rows.map(row => row.mode);
  } finally { await pg.exec("rollback;"); }
  check(tag("klaim mengunci baris minumannya (RowShareLock pada coffee_drinks)"), locks.includes("RowShareLock"), true);
  await pg.exec("set role service_role;");
}

/* ---------- run ---------- */

const { PGlite } = await loadPglite();
const pg = new PGlite();
const version = (await pg.query("select version() as v")).rows[0].v;
console.log(`Mesin: ${version.split(" on ")[0]} (PGlite, WASM, di memori; satu koneksi)\n`);

// 1. What the Coffee migrations assume is already there.
console.log("1. Persiapan (peran Supabase, employees, admin_grants dari migrasi aslinya)");
const WHOLE = ["202611030001_employees.sql"];
const PARTS = ["202611040002_pra_wam_roles.sql", "202611060002_pra_wam_departments_bu.sql", "202611060004_employees_bu_codes.sql", "202611060006_employees_reports_to.sql", "202611060007_employees_gender.sql", "202611130006_employee_category_dw.sql", "202611130012_admin_grants.sql", "202611200703_admin_grants_hr.sql"];
/** Roles, employees, admin_grants and the five made-up people, on a database that has nothing yet. */
async function prepare(db, say = true) {
  await db.exec("create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; grant usage on schema public to anon, authenticated, service_role;");
  for (const file of WHOLE) await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  for (const file of PARTS) {
    // Only the statements about employees and admin_grants: the other tables these files touch are not needed here.
    const kept = statements(readFileSync(join(MIGRATIONS, file), "utf8")).filter(s => /\bpublic\.(employees|admin_grants)\b/.test(s.text) && !/\bpw_|staff_members|admin_access_log/.test(s.text));
    for (const statement of kept) await db.exec(statement.text);
    if (say) console.log(`  ${file}: ${kept.length} pernyataan`);
  }
  const person = (id, name, nickname, category, bu, active = true) => db.query("insert into public.employees (id, full_name, nickname, category, business_unit, position, active) values ($1, $2, $3, $4, $5, $6, $7)", [id, name, nickname, category, bu, `Contoh ${category}`, active]);
  await person(PEOPLE.rina, "Contoh Rina Putri", "Rina", "karyawan", "WNS");
  await person(PEOPLE.bagas, "Contoh Bagas Saputra", "Bagas", "dw", "WNS");
  await person(PEOPLE.fajar, "Contoh Fajar Nugroho", "Fajar", "intern", "CoE");
  await person(PEOPLE.dewi, "Contoh Dewi Lestari", "Dewi", "karyawan", "TEE");
  await person(PEOPLE.keluar, "Contoh Sudah Keluar", "Keluar", "karyawan", "WNS", false);
}
await prepare(pg);
const constraintBefore = (await pg.query("select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'admin_grants_apps_check'")).rows[0].def;

// 2. The first two migrations (the ones applied on the live database), word for word, the way the SQL Editor runs a file.
console.log("\n2. Migrasi 1 dan 2 dijalankan apa adanya (skema LAMA, seperti database yang sedang dipakai)");
const COFFEE = ["202612010001_coffee.sql", "202612010002_coffee_push.sql"];
const MENU = "202612020001_coffee_menu.sql";
async function migrate(file, label, db = pg) {
  const sql = readFileSync(join(MIGRATIONS, file), "utf8");
  try { await db.exec(sql); console.log(`  ${label}: ${file} berjalan tanpa galat`); return true; } catch (error) {
    await db.exec("rollback;").catch(() => {});
    console.log(`  ${label}: ${file} GAGAL: ${error.code} ${error.message}`);
    // Again, statement by statement, to name the line.
    for (const statement of statements(sql)) {
      try { await db.exec(statement.text); } catch (inner) {
        const within = inner.position ? statement.text.slice(0, Number(inner.position)).split("\n").length - 1 : 0;
        console.log(`    baris ${statement.line + within}: ${inner.code} ${inner.message}`);
        await db.exec("rollback;").catch(() => {});
        break;
      }
    }
    results.fail.push(`${label}: ${file}`);
    return false;
  }
}
let clean = true;
for (const file of COFFEE) clean = await migrate(file, "pertama") && clean;
if (!clean) { console.log("\nMigrasi tidak berjalan; aturan tidak diuji."); process.exit(1); }
check("[Postgres] batasan admin_grants sebelum migrasi = daftar 202611200703", constraintBefore, "CHECK ((apps <@ ARRAY['acara'::text, 'friday_sharing'::text, 'your_visit'::text, 'wam'::text, 'kuesioner'::text, 'tv'::text, 'wellbeing'::text, 'wam_acara'::text, 'hr'::text]))");
const constraintAfter = (await pg.query("select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'admin_grants_apps_check'")).rows[0].def;
check("[Postgres] batasan admin_grants sesudah migrasi = daftar lama + coffee", constraintAfter, constraintBefore.replace("'hr'::text]", "'hr'::text, 'coffee'::text]"));

// 3. A second and a third run on the empty tables.
console.log("\n3. Dijalankan ulang dua kali (tabel masih kosong)");
const shape = async () => JSON.stringify((await pg.query(`select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name like 'coffee\\_%')::int as columns,
  (select count(*) from pg_constraint where conrelid::regclass::text like 'coffee\\_%' or conname = 'admin_grants_apps_check')::int as constraints,
  (select count(*) from pg_indexes where schemaname = 'public' and tablename like 'coffee\\_%')::int as indexes,
  (select count(*) from pg_proc where proname like 'coffee\\_%')::int as functions,
  (select count(*) from public.coffee_settings)::int as settings`)).rows[0]);
const shapeFirst = await shape();
for (const label of ["kedua", "ketiga"]) for (const file of COFFEE) await migrate(file, label);
check("[Postgres] bentuk skema sama setelah dijalankan ulang", await shape(), shapeFirst);
console.log(`  bentuk: ${shapeFirst}`);

// 4. The rules, on Postgres and on the stand-in.
await pg.exec("set role service_role;");
const postgres = pgBackend(pg);
console.log("\n4a. Aturan di Postgres (sebagai service_role, argumen bernama seperti .rpc)");
const failsBefore = results.fail.length;
await rules(postgres);
console.log(`  ${results.fail.length - failsBefore} gagal`);

console.log("\n4b. Aturan yang sama di tiruan JavaScript (fake-db.ts)");
let fakeModule = null;
try { fakeModule = await import(pathToFileURL(join(ROOT, "src", "lib", "server", "coffee", "fake-db.ts")).href); } catch (error) {
  note(`fake-db.ts tidak bisa dimuat (${error.code ?? error.message}); perbandingan dilewati. Perlu Node 22.18+.`);
  results.fail.push("fake-db.ts tidak dimuat");
}
if (fakeModule) {
  keyNo = 0;
  const fake = fakeModule.fakeDb();
  fakeModule.seedPeople(fake);
  // As the database is at this point: before migration 3.
  fake.state.menuMigrated = false;
  const failsFake = results.fail.length;
  await rules(fakeBackend(fake));
  console.log(`  ${results.fail.length - failsFake} gagal (setiap baris GAGAL [fake-db.ts] di atas = tiruan berbeda dari Postgres)`);
}

console.log("\n4c. Hanya di Postgres: batasan, hak akses, PIN, push, akses admin, kunci");
await postgresOnly(pg, postgres);

// 5. Once more with data in the tables: nothing is reset, nothing is lost.
console.log("\n5. Dijalankan ulang saat tabel sudah berisi");
await pg.exec("reset role;");
const content = async () => JSON.stringify((await pg.query(`select
  (select count(*) from public.coffee_orders)::int as orders, (select count(*) from public.coffee_order_items)::int as items,
  (select last_value from public.coffee_claim_no)::int as claim_no, (select last_value from public.coffee_meeting_no)::int as meeting_no,
  (select ga_pin_hash is not null from public.coffee_settings) as pin, (select updated_label from public.coffee_settings) as label,
  (select count(*) from public.coffee_push_subscriptions)::int as devices, (select count(*) from public.coffee_push_sent)::int as sent,
  (select count(*) from public.admin_grants where apps @> array['coffee'])::int as holders`)).rows[0]);
const contentBefore = await content();
for (const file of COFFEE) await migrate(file, "keempat");
check("[Postgres] isi tabel, nomor urut, PIN dan akses tidak berubah", await content(), contentBefore);
check("[Postgres] bentuk skema tetap sama", await shape(), shapeFirst);
console.log(`  isi: ${contentBefore}`);

// 6. Migration 3 on top of the orders made under the old schema (what happens on the live database).
console.log("\n6. Migrasi 3 di atas data lama (pesanan yang dibuat dengan skema lama)");
await pg.exec("reset role;");
const NAMES = { "kopi-susu": "Kopi Susu", cappuccino: "Cappuccino", "cafe-latte": "Café Latte", "cafe-mocha": "Café Mocha", "piccolo-latte": "Piccolo Latte", "cappuccino-double-shot": "Cappuccino Double Shot", "matcha-espresso": "Matcha Espresso", "kopi-hitam": "Kopi Hitam", americano: "Americano", espresso: "Espresso", "milk-chocolate": "Milk Chocolate", "matcha-latte": "Matcha Latte", "dark-chocolate": "Dark Chocolate", "cucumber-ice": "Cucumber Ice", "classic-tea": "Classic Tea" };
const oldItems = async () => JSON.stringify((await pg.query("select id, order_id, drink_slug, drink_other, temperature, sugar, ice, qty, sort from public.coffee_order_items order by id")).rows);
const itemsBefore = await oldItems();
const itemCount = JSON.parse(itemsBefore).length;
const contentOld = await content();
check("[Postgres] ada pesanan lama untuk diuji (dibuat sebelum migrasi 3)", itemCount > 50, true);
check("[Postgres] sebelum migrasi 3: tidak ada coffee_drinks", (await pg.query("select to_regclass('public.coffee_drinks') as t")).rows[0].t, null);
if (!(await migrate(MENU, "pertama"))) { console.log("\nMigrasi 3 tidak berjalan; sisanya tidak diuji."); process.exit(1); }
check("[Postgres] baris minuman lama tidak berubah (suhu, gula, es, jumlah, urutan)", await oldItems(), itemsBefore);
check("[Postgres] isi tabel lama, nomor urut, PIN, push dan akses tidak berubah", await content(), contentOld);
check("[Postgres] pesanan lama tidak punya opsi kosong", (await pg.query("select count(*)::int as n from public.coffee_order_items where temperature is null or sugar is null or ice is null")).rows[0].n, 0);
const named = (await pg.query("select drink_slug, drink_name from public.coffee_order_items")).rows;
check("[Postgres] nama minuman diisi untuk semua pesanan lama dari menu", named.filter(row => row.drink_slug !== "lainnya" && row.drink_name !== NAMES[row.drink_slug]).length, 0);
check("[Postgres] 'lainnya' tetap tanpa drink_name", named.filter(row => row.drink_slug === "lainnya" && row.drink_name !== null).length, 0);
check("[Postgres] ada baris 'lainnya' dan baris menu di data lama", [named.some(row => row.drink_slug === "lainnya"), named.some(row => row.drink_slug === "kopi-susu")], [true, true]);
const seeded = (await pg.query("select slug, name, drink_group, temperatures, photo_url, sort, active from public.coffee_drinks order by sort")).rows;
check("[Postgres] 15 minuman diisi, urut, semua tampil, foto statis", { n: seeded.length, slugs: seeded.map(row => row.slug).join(","), names: seeded.every(row => row.name === NAMES[row.slug]), shown: seeded.every(row => row.active), photos: seeded.every(row => row.photo_url === `/coffee/drinks/${row.slug}.jpg`) },
  { n: 15, slugs: Object.keys(NAMES).join(","), names: true, shown: true, photos: true });
check("[Postgres] Espresso hanya panas, Cucumber Ice hanya es", [seeded.find(row => row.slug === "espresso")?.temperatures, seeded.find(row => row.slug === "cucumber-ice")?.temperatures], [["panas"], ["es"]]);
const optionRow = async () => (await pg.query("select opt_klaim_suhu, opt_klaim_gula, opt_klaim_es, opt_tim_suhu, opt_tim_gula, opt_tim_es, opt_tamu_suhu, opt_tamu_gula, opt_tamu_es from public.coffee_settings where id = 1")).rows[0];
check("[Postgres] opsi bawaan: karyawan mati semua, tim dan tamu nyala semua", Object.values(await optionRow()), [false, false, false, true, true, true, true, true, true]);

console.log("\n7. Migrasi 3 dijalankan ulang (dua kali, lalu setelah pengelola mengubah menu dan opsi, lalu ketiganya berurutan)");
const shapeMenu = await shape();
const contentMenu = async () => JSON.stringify({ lama: JSON.parse(await content()), menu: (await pg.query("select slug, name, sort, active, photo_url from public.coffee_drinks order by slug")).rows, opsi: await optionRow(), nama: (await pg.query("select count(*)::int as n from public.coffee_order_items where drink_name is not null")).rows[0].n });
const menuBefore = await contentMenu();
for (const label of ["kedua", "ketiga"]) await migrate(MENU, label);
check("[Postgres] bentuk skema sama setelah migrasi 3 diulang", await shape(), shapeMenu);
check("[Postgres] menu, opsi, nama minuman dan data lama sama setelah diulang", await contentMenu(), menuBefore);
// What a pengelola did meanwhile must survive another run: a deleted drink stays deleted, a rename and a switch stay.
await pg.query("delete from public.coffee_drinks where slug = 'matcha-espresso'");
await pg.query("update public.coffee_drinks set name = 'Kopi Susu Gula Aren', sort = 5, active = false where slug = 'kopi-susu'");
await pg.query("update public.coffee_settings set opt_klaim_gula = true, opt_tamu_es = false where id = 1");
const changed = await contentMenu();
await migrate(MENU, "keempat (setelah menu dan opsi diubah)");
check("[Postgres] minuman yang dihapus tidak kembali; nama, urutan, sembunyi dan opsi yang diubah bertahan", await contentMenu(), changed);
check("[Postgres] pesanan lama tetap bernama 'Kopi Susu' walau minumannya berganti nama", (await pg.query("select distinct drink_name from public.coffee_order_items where drink_slug = 'kopi-susu'")).rows.map(row => row.drink_name), ["Kopi Susu"]);
for (const file of [...COFFEE, MENU]) await migrate(file, "kelima (1, 2, 3 berurutan)");
check("[Postgres] ketiganya berurutan lagi: bentuk dan isi tetap", [await shape(), await contentMenu()], [shapeMenu, changed]);
// Back to the seeded state for the rules below.
await pg.query("insert into public.coffee_drinks (slug, name, description, drink_group, temperatures, photo_url, sort) values ('matcha-espresso', 'Matcha Espresso', 'Matcha susu dengan espresso di atasnya.', 'kopi', array['panas', 'es'], '/coffee/drinks/matcha-espresso.jpg', 70)");
await pg.query("update public.coffee_drinks set name = 'Kopi Susu', sort = 10, active = true where slug = 'kopi-susu'");
await pg.query("update public.coffee_settings set opt_klaim_gula = false, opt_tamu_es = true where id = 1");
console.log(`  bentuk: ${shapeMenu}`);

console.log("\n8a. Aturan baru di Postgres (opsi NULL, menu, nama tersimpan)");
await pg.exec("set role service_role;");
const failsMenu = results.fail.length;
await menuRules(postgres);
console.log(`  ${results.fail.length - failsMenu} gagal`);
console.log("\n8b. Aturan baru yang sama di tiruan JavaScript (fake-db.ts, setelah migrasi 3)");
if (fakeModule) {
  const fake = fakeModule.fakeDb();
  fakeModule.seedPeople(fake);
  const failsFake = results.fail.length;
  await menuRules(fakeBackend(fake));
  console.log(`  ${results.fail.length - failsFake} gagal (setiap baris GAGAL [fake-db.ts] di atas = tiruan berbeda dari Postgres)`);
}
console.log("\n8c. Hanya di Postgres: batasan menu, hak akses, kunci baris minuman");
await menuPostgresOnly(pg);

// 9. A fresh database with all three migrations: every old rule still holds with the replaced functions.
console.log("\n9. Database baru dengan migrasi 1, 2, 3: aturan lama diuji lagi dengan fungsi yang diganti");
const pg2 = new PGlite();
await prepare(pg2, false);
let fresh = true;
for (const file of [...COFFEE, MENU]) fresh = await migrate(file, "database kedua", pg2) && fresh;
if (fresh) {
  await pg2.exec("set role service_role;");
  keyNo = 0;
  const failsFresh = results.fail.length;
  await rules({ ...pgBackend(pg2), name: "Postgres 1+2+3" });
  console.log(`  Postgres: ${results.fail.length - failsFresh} gagal`);
  if (fakeModule) {
    keyNo = 0;
    const fake = fakeModule.fakeDb();
    fakeModule.seedPeople(fake);
    const failsFake = results.fail.length;
    await rules({ ...fakeBackend(fake), name: "fake-db.ts 1+2+3" });
    console.log(`  fake-db.ts: ${results.fail.length - failsFake} gagal`);
  }
}

console.log(`\nHasil: ${results.pass} lulus, ${results.fail.length} gagal.`);
if (results.fail.length) { console.log(results.fail.map(label => `  - ${label}`).join("\n")); process.exit(1); }
console.log("Yang TIDAK diuji di sini: balapan sungguhan (dua transaksi bersamaan), PostgREST, dan database Supabase asli.");
