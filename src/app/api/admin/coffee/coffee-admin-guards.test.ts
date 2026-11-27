import { beforeEach, expect, it, vi } from "vitest";
import { fakeDb, PEOPLE, seedPeople } from "@/lib/server/coffee/fake-db";
import { forgetMenu } from "@/lib/server/coffee/store";

/*
 * Every pengelola route of WG Coffee: no admin session 401, no grant 403, a foreign origin
 * 403, a wrong body 422 with the field named, and 503 with the migration's name before it runs.
 * The database is the in-memory stand-in; made-up people.
 */
const state = vi.hoisted(() => ({ admin: "person" as "none" | "nogrant" | "person" | "super" }));
let db = fakeDb();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/supabase/admin", () => ({ createPrivilegedClient: () => db.client }));
vi.mock("@/lib/server/pra-wam/session", () => ({ currentMember: async () => null, requireApiMember: async () => { throw new Error("not used"); } }));
vi.mock("@/lib/server/admin-session", async () => {
  const { ServiceError } = await import("@/lib/server/config");
  return {
    requireApiAdmin: async () => {
      if (state.admin === "none") throw new ServiceError(401, "Sesi berakhir. Masuk kembali sebelum melanjutkan.");
      if (state.admin === "nogrant") throw new ServiceError(403, "Akun Anda belum diberi akses ke bagian ini. Minta super admin.");
      return state.admin === "super" ? "super" : "admin";
    },
    currentAdmin: async () => state.admin === "super" ? { role: "super", kind: "super", name: "Super admin" }
      : state.admin === "person" ? { role: "admin", kind: "person", name: "Contoh Dewi Lestari", employeeId: "44444444-4444-4444-8444-444444444444" } : null,
  };
});

const SITE = "https://journey.test";
const NOBODY = "00000000-0000-4000-8000-999999999999";
const drink = { slug: "cafe-latte", temperature: "panas", sugar: "Normal", ice: "Normal" };
const KEY = "dddddddd-dddd-4ddd-8ddd-000000000001";
const manual = { kind: "klaim", employeeId: PEOPLE.rina, date: "2026-11-20", time: "09:30", ...drink, key: KEY };
const span = "dari=2026-11-01&sampai=2026-11-30";
const ALL = { suhu: true, gula: true, es: true }, NONE = { suhu: false, gula: false, es: false };
/** Pengaturan → Opsi minuman, changed from the defaults: claims are asked their sugar. */
const OPTIONS = { klaim: { suhu: false, gula: true, es: false }, tim: ALL, tamu: ALL };
/** Menu (F6): a new drink, and a real 1 × 1 PNG for its photo. */
const DRINK = { name: "Teh Tarik", description: "Teh susu yang ditarik.", group: "non-kopi", temperatures: ["panas"], active: true };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
/** The calls that belong to migration 202612020001: before it runs they wait for it by name. */
const MENU_WRITES = ["options", "addDrink", "changeDrink", "showDrink", "deleteDrink", "sortDrinks", "photo"];
const send = (path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) => new Request(`${SITE}${path}`, {
  method, headers: { ...(method === "GET" ? {} : { origin: SITE }), ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
});
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const body = async (response: Response) => await response.json() as { ok: boolean; message: string; data?: Record<string, unknown>; fieldErrors?: Record<string, string[]> };

const load = () => Promise.all([
  import("./queue/route"), import("./orders/[id]/selesai/route"), import("./orders/[id]/tolak/route"), import("./orders/[id]/urungkan/route"),
  import("./manual/route"), import("./people/route"), import("./rekap/route"), import("./rekap/export/route"), import("./settings/route"), import("./orders/[id]/batalkan/route"), import("./settings/pin/route"), import("./settings/opsi/route"),
  import("./menu/route"), import("./menu/[slug]/route"), import("./menu/[slug]/foto/route"), import("./menu/urutan/route"),
]);
const routes = async (headers: Record<string, string> = {}) => {
  const [queue, finish, reject, reopen, manualRoute, people, recap, exported, settings, cancel, pin, options, menu, oneDrink, photo, menuOrder] = await load();
  const slugOf = (slug: string) => ({ params: Promise.resolve({ slug }) });
  const order = (name: string, id: string) => `/api/admin/coffee/orders/${id}/${name}`;
  return {
    reads: {
      queue: () => queue.GET(),
      people: (query = "") => people.GET(send(`/api/admin/coffee/people${query}`)),
      recap: (query = `?${span}`) => recap.GET(send(`/api/admin/coffee/rekap${query}`)),
      exported: (query = `?format=csv&${span}`, extra: Record<string, string> = {}) => exported.GET(send(`/api/admin/coffee/rekap/export${query}`, "GET", undefined, extra)),
      settings: () => settings.GET(),
      menu: () => menu.GET(),
    },
    writes: {
      finish: (id = NOBODY) => finish.POST(send(order("selesai", id), "POST", undefined, headers), params(id)),
      reject: (id = NOBODY, input: unknown = { note: "Susu segar sedang habis." }) => reject.POST(send(order("tolak", id), "POST", input, headers), params(id)),
      reopen: (id = NOBODY) => reopen.POST(send(order("urungkan", id), "POST", undefined, headers), params(id)),
      cancel: (id = NOBODY) => cancel.POST(send(order("batalkan", id), "POST", undefined, headers), params(id)),
      manual: (input: unknown = manual) => manualRoute.POST(send("/api/admin/coffee/manual", "POST", input, headers)),
      settings: (input: unknown = { karyawan: 5, ga: 2, intern: 2 }) => settings.PUT(send("/api/admin/coffee/settings", "PUT", input, headers)),
      pin: (input: unknown = { pin: "4821" }) => pin.PUT(send("/api/admin/coffee/settings/pin", "PUT", input, headers)),
      options: (input: unknown = OPTIONS) => options.PUT(send("/api/admin/coffee/settings/opsi", "PUT", input, headers)),
      addDrink: (input: unknown = DRINK) => menu.POST(send("/api/admin/coffee/menu", "POST", input, headers)),
      changeDrink: (slug = "kopi-susu", input: unknown = DRINK) => oneDrink.PUT(send(`/api/admin/coffee/menu/${slug}`, "PUT", input, headers), slugOf(slug)),
      showDrink: (slug = "kopi-susu", input: unknown = { active: false }) => oneDrink.PATCH(send(`/api/admin/coffee/menu/${slug}`, "PATCH", input, headers), slugOf(slug)),
      deleteDrink: (slug = "classic-tea") => oneDrink.DELETE(send(`/api/admin/coffee/menu/${slug}`, "DELETE", undefined, headers), slugOf(slug)),
      sortDrinks: (input: unknown = { slugs: ["espresso", "kopi-susu"] }) => menuOrder.PUT(send("/api/admin/coffee/menu/urutan", "PUT", input, headers)),
      photo: (slug = "kopi-susu", file: File | null = new File([PNG], "foto.png", { type: "image/png" })) => {
        const form = new FormData();
        if (file) form.append("file", file);
        return photo.POST(new Request(`${SITE}/api/admin/coffee/menu/${slug}/foto`, { method: "POST", headers: { origin: SITE, ...headers }, body: form }), slugOf(slug));
      },
    },
  };
};
const everyCall = (all: Awaited<ReturnType<typeof routes>>) => [...Object.values(all.reads), ...Object.values(all.writes)] as (() => Promise<Response>)[];
const claim = async (employee: string = PEOPLE.rina) => (await db.client.rpc("coffee_submit_claim", { p_employee: employee, p_item: drink, p_at: new Date(Date.now() - 60_000 + db.rows("coffee_orders").length).toISOString(), p_manual: false, p_actor: employee, p_actor_label: "Contoh", p_key: KEY.replace(/1$/, String(db.rows("coffee_orders").length + 2)) })).data as string;

beforeEach(() => { forgetMenu(true); db = fakeDb(); seedPeople(db); db.state.now = new Date(); state.admin = "person"; process.env.RATE_LIMIT_SECRET = "x".repeat(40); });

it("answers 401 without an admin session and 403 without the grant, on every route", async () => {
  const all = await routes();
  const id = await claim();
  for (const [admin, status] of [["none", 401], ["nogrant", 403]] as const) {
    state.admin = admin;
    for (const call of everyCall(all)) expect((await call()).status).toBe(status);
    expect((await all.writes.finish(id)).status).toBe(status);
  }
  expect(db.rows("coffee_orders")).toMatchObject([{ status: "diproses" }]);
  expect(db.rows("coffee_settings")[0].quota_karyawan).toBe(4);
  expect(db.rows("coffee_settings")[0].opt_klaim_gula).toBe(false);
  expect(db.rows("coffee_drinks")).toHaveLength(15);
  expect(db.rows("coffee_drinks").every(drink => drink.active)).toBe(true);
});

it("refuses a write from another site, and a download asked for by another site", async () => {
  const id = await claim();
  const foreign = await routes({ origin: "https://evil.test" });
  for (const call of [() => foreign.writes.finish(id), () => foreign.writes.reject(id), () => foreign.writes.reopen(id), () => foreign.writes.cancel(id), foreign.writes.manual, foreign.writes.settings, foreign.writes.pin, foreign.writes.options,
    foreign.writes.addDrink, foreign.writes.changeDrink, foreign.writes.showDrink, foreign.writes.deleteDrink, foreign.writes.sortDrinks, foreign.writes.photo]) expect((await call()).status).toBe(403);
  expect(db.rows("coffee_drinks").map(drink => drink.slug)).toHaveLength(15);
  expect(db.rows("coffee_drinks")[0]).toMatchObject({ slug: "kopi-susu", name: "Kopi Susu", active: true });
  expect(db.state.files.size).toBe(0);
  expect(db.rows("coffee_settings")[0].opt_klaim_gula).toBe(false);
  expect(db.rows("coffee_settings")[0].ga_pin_hash).toBeUndefined();
  expect((await foreign.reads.exported(undefined, { "sec-fetch-site": "cross-site" })).status).toBe(403);
  expect(db.rows("coffee_orders")).toMatchObject([{ status: "diproses" }]);
});

it("names the field when the body or the address is wrong", async () => {
  const all = await routes();
  const id = await claim();
  const noNote = await all.writes.reject(id, { note: " " });
  expect(noNote.status).toBe(422);
  expect((await body(noNote)).fieldErrors).toEqual({ note: ["Tulis catatan untuk pemesan, minimal 3 huruf."] });
  expect(db.rows("coffee_orders")[0].status).toBe("diproses");
  for (const call of [() => all.writes.finish("bukan-uuid"), () => all.writes.reject("bukan-uuid"), () => all.writes.reopen("bukan-uuid"), () => all.writes.cancel("bukan-uuid")]) expect((await call()).status).toBe(422);
  // Audit V-1: an empty clock or an impossible date is the form's mistake (422 under its field), not a failing service (503).
  for (const [wrong, fieldErrors] of [
    [{ time: "" }, { time: ["Jam tidak dikenali."] }], [{ time: "aa:bb" }, { time: ["Jam tidak dikenali."] }],
    [{ date: "2026-13-45" }, { date: ["Tanggal tidak dikenali."] }], [{ date: "" }, { date: ["Tanggal tidak dikenali."] }],
  ] as const) {
    const response = await all.writes.manual({ ...manual, ...wrong });
    expect(response.status).toBe(422);
    expect((await body(response)).fieldErrors).toEqual(fieldErrors);
  }
  expect((await body(await all.writes.manual({ ...manual, key: undefined }))).fieldErrors).toHaveProperty("key");
  expect(db.rows("coffee_orders")).toHaveLength(1);
  expect((await body(await all.writes.manual({ ...manual, employeeId: "", slug: "lainnya" }))).fieldErrors).toEqual({ employeeId: ["Pilih nama karyawan."], other: ["Tulis nama minumannya."] });
  expect((await body(await all.writes.manual({ ...manual, date: "2999-01-01" }))).fieldErrors).toEqual({ date: ["Tanggal dan jam tidak boleh di masa depan."] });
  expect((await body(await all.writes.settings({ karyawan: 61, ga: 2, intern: 2 }))).fieldErrors).toHaveProperty("karyawan");
  expect((await all.reads.recap("")).status).toBe(422);
  expect((await all.reads.recap("?dari=2026-11-30&sampai=2026-11-01")).status).toBe(422);
  expect((await all.reads.exported(`?format=pdf&${span}`)).status).toBe(422);
  expect((await all.reads.people("?bulan=2026-13")).status).toBe(422);
});

// Audit F3-04: the pengelola sets the PIN GA; nothing but "sudah diatur" ever comes back.
it("sets the PIN GA as four digits, keeps only its hash, and never hands it out again", async () => {
  const all = await routes();
  expect((await body(await all.reads.settings())).data).toMatchObject({ gaPin: false });
  for (const wrong of [{ pin: "123" }, { pin: "12345" }, { pin: "12a4" }, { pin: 1234 }, { pin: "" }, {}]) {
    const response = await all.writes.pin(wrong);
    expect(response.status, JSON.stringify(wrong)).toBe(422);
    expect((await body(response)).fieldErrors).toHaveProperty("pin");
  }
  expect(db.rows("coffee_settings")[0].ga_pin_hash).toBeUndefined();
  const saved = await all.writes.pin({ pin: "0042" });
  expect(await body(saved)).toEqual({ ok: true, data: { gaPin: true }, message: "PIN GA disimpan. Beri tahu petugas GA." });
  expect(db.rows("coffee_settings")[0]).toMatchObject({ ga_pin_label: "Dewi", quota_karyawan: 4 });
  const { checkGaPin } = await import("@/lib/server/coffee/pin");
  expect(await checkGaPin("0042")).toEqual({ set: true, ok: true });
  // Reading the settings, saving the quotas: "sudah diatur", and neither the PIN nor its hash.
  const read = JSON.stringify(await body(await all.reads.settings())), written = JSON.stringify(await body(await all.writes.settings()));
  for (const answer of [read, written]) {
    expect(answer).toContain('"gaPin":true');
    expect(answer).not.toMatch(/0042|s1\$|ga_pin/);
  }
  expect(await checkGaPin("0042")).toEqual({ set: true, ok: true });
});

it("answers 503 with the migration's name before it runs", async () => {
  db.state.migrated = false;
  const all = await routes();
  const later = MENU_WRITES.map(name => all.writes[name as keyof typeof all.writes] as () => Promise<Response>);
  for (const call of everyCall(all)) {
    // Reading the menu never fails for the migration: it falls back to the code's menu (the page itself says what waits).
    if (call === all.reads.menu) continue;
    const response = await call();
    expect(response.status).toBe(503);
    // The option switches and the menu belong to the later migration, and say so.
    expect((await body(response)).message).toBe(later.includes(call) ? "Fitur ini menunggu migrasi 202612020001_coffee_menu.sql." : "WG Coffee menunggu migrasi 202612010001_coffee.sql.");
  }
  expect((await body(await all.reads.menu())).data).toMatchObject({ ready: false });
});

it("processes the queue: done once, refused with a note, put back by the processor only", async () => {
  const all = await routes();
  const [first, second] = [await claim(), await claim(PEOPLE.fajar)];
  expect((await body(await all.reads.queue())).data).toMatchObject({ waiting: [{ id: first, claimNo: 1, quota: 4 }, { id: second, quota: 2 }], today: { diproses: 2 } });
  expect(await body(await all.writes.finish(first))).toMatchObject({ ok: true, message: "Selesai diproses.", data: { order: { status: "selesai", processed: { label: "Dewi", employeeId: PEOPLE.dewi }, undoable: true } } });
  state.admin = "super";
  const late = await all.writes.finish(first);
  expect(late.status).toBe(409);
  expect((await body(late)).message).toBe("Pesanan ini sudah diproses orang lain. Antrean diperbarui.");
  expect((await all.writes.reopen(first)).status).toBe(409);
  expect(await body(await all.writes.reject(second))).toMatchObject({ message: "Ditolak. Pemesan diberi tahu beserta catatannya.", data: { order: { status: "ditolak", rejectNote: "Susu segar sedang habis.", processed: { label: "Super admin", employeeId: null } } } });
  state.admin = "person";
  expect(await body(await all.writes.reopen(first))).toMatchObject({ message: "Dikembalikan ke antrean.", data: { order: { status: "diproses", processed: null } } });
  expect((await all.writes.finish(NOBODY)).status).toBe(404);
});

it("records by hand, changes the quotas, lists the people, and hands out the recap as files", async () => {
  const all = await routes();
  const month = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(new Date()).slice(0, 7);
  const today = { ...manual, date: `${month}-01`, time: "00:00" };
  expect(await body(await all.writes.manual(today))).toMatchObject({ ok: true, message: "Contoh · Café Latte · klaim ke-1 dari 4.", data: { order: { manual: true, status: "selesai" } } });
  expect(await body(await all.writes.settings({ karyawan: 1, ga: 2, intern: 2 }))).toMatchObject({ message: "Jatah disimpan.", data: { settings: { karyawan: 1 }, holders: [{ id: PEOPLE.dewi }] } });
  const full = await all.writes.manual({ ...today, time: "00:01", key: KEY.replace(/1$/, "9") });
  expect(full.status).toBe(409);
  const read = (await body(await all.reads.settings())).data as { menu: { slug: string }[] } & Record<string, unknown>;
  expect(read).toMatchObject({ settings: { karyawan: 1, ga: 2, intern: 2 }, holders: [{ id: PEOPLE.dewi, name: "Contoh Dewi Lestari", position: "Contoh karyawan" }], gaPin: false, optionsReady: true, options: { klaim: NONE, tim: ALL, tamu: ALL } });
  expect(Object.keys(read).sort()).toEqual(["gaPin", "holders", "menu", "options", "optionsReady", "settings"]);
  expect(read.menu).toHaveLength(15);
  const people = (await body(await all.reads.people())).data as { month: string; people: { id: string; used: number }[] };
  expect(people.month).toBe(month);
  expect(people.people.find(person => person.id === PEOPLE.rina)?.used).toBe(1);
  const days = `dari=${month}-01&sampai=${month}-28`;
  expect((await body(await all.reads.recap(`?${days}`))).data).toMatchObject({ rows: [{ no: "K-418", manual: true, claimNo: 1 }], summary: { total: 1, klaim: 1 } });
  const csv = await all.reads.exported(`?format=csv&${days}`, { "sec-fetch-site": "same-origin" });
  expect(csv.headers.get("content-type")).toBe("text/csv; charset=utf-8");
  expect(csv.headers.get("content-disposition")).toBe(`attachment; filename="wg-coffee-rekap-${month}-01_${month}-28.csv"`);
  expect(csv.headers.get("cache-control")).toBe("no-store");
  expect((await csv.text()).split("\r\n")).toHaveLength(3);
  const xlsx = await all.reads.exported(`?format=xlsx&${days}`);
  expect(xlsx.headers.get("content-disposition")).toContain(".xlsx");
  expect(Buffer.from(await xlsx.arrayBuffer()).subarray(0, 2).toString()).toBe("PK");
});

it("cancels a record made by hand after it was saved twice with one key, and nothing else", async () => {
  const all = await routes();
  const month = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(new Date()).slice(0, 7);
  const record = { ...manual, employeeId: PEOPLE.fajar, date: `${month}-01`, time: "00:00" };
  const first = await body(await all.writes.manual(record));
  const again = await body(await all.writes.manual(record));
  const id = (first.data!.order as { id: string }).id;
  expect((again.data!.order as { id: string }).id).toBe(id);
  expect(again.message).toBe(first.message);
  expect(db.rows("coffee_orders")).toHaveLength(1);
  const mine = await claim(PEOPLE.rina);
  const refused = await all.writes.cancel(mine);
  expect(refused.status).toBe(409);
  expect((await body(refused)).message).toBe("Hanya catatan manual yang bisa dibatalkan.");
  state.admin = "super";
  expect(await body(await all.writes.cancel(id))).toMatchObject({ ok: true, message: "Catatan dibatalkan. Jatah Contoh dikembalikan.", data: { order: { id, status: "batal", manual: true, processed: { label: "Super admin", employeeId: null } } } });
  const twice = await all.writes.cancel(id);
  expect(twice.status).toBe(409);
  expect((await body(twice)).message).toBe("Catatan ini sudah dibatalkan.");
  expect((await all.writes.cancel(NOBODY)).status).toBe(404);
  const people = (await body(await all.reads.people())).data as { people: { id: string; used: number }[] };
  expect(people.people.find(person => person.id === PEOPLE.fajar)?.used).toBe(0);
  const recap = (await body(await all.reads.recap(`?dari=${month}-01&sampai=${month}-28&status=batal`))).data as { rows: object[]; summary: object };
  expect(recap).toMatchObject({ rows: [{ no: "K-418", orderId: id, status: "batal", manual: true, doneBy: "Super admin" }], summary: { total: 0, klaim: 0 } });
  expect(recap.rows).toHaveLength(1);
});

// F6: which options each audience is asked with a drink.
it("saves the option switches, names what is wrong with them, and hands them out with the settings", async () => {
  const all = await routes();
  for (const wrong of [{}, { klaim: NONE, tim: ALL }, { ...OPTIONS, tamu: { suhu: "ya", gula: true, es: true } }, { ...OPTIONS, klaim: { suhu: true } }]) {
    const response = await all.writes.options(wrong);
    expect(response.status, JSON.stringify(wrong)).toBe(422);
  }
  expect(db.rows("coffee_settings")[0].opt_klaim_gula).toBe(false);
  const saved = await all.writes.options({ ...OPTIONS, tamu: { suhu: false, gula: true, es: true } });
  expect(await body(saved)).toEqual({ ok: true, message: "Opsi minuman disimpan. Berlaku mulai pesanan berikutnya.", data: { options: { klaim: { suhu: false, gula: true, es: false }, tim: ALL, tamu: { suhu: false, gula: true, es: false } } } });
  expect(saved.headers.get("cache-control")).toBe("no-store");
  expect(db.rows("coffee_settings")[0]).toMatchObject({ opt_klaim_gula: true, opt_tamu_suhu: false, opt_tamu_es: false, options_label: "Dewi", quota_karyawan: 4 });
  expect((await body(await all.reads.settings())).data).toMatchObject({ options: { klaim: { gula: true }, tamu: { suhu: false, es: false } } });
  // Catat manual follows at once: a claim now carries its sugar, a guest's drink no temperature.
  const month = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(new Date()).slice(0, 7);
  await all.writes.manual({ ...manual, date: `${month}-01`, time: "00:00", sugar: "Tanpa" });
  expect(db.rows("coffee_order_items").at(-1)).toMatchObject({ temperature: null, sugar: "Tanpa", ice: null });
  await all.writes.manual({ ...manual, kind: "tamu", date: `${month}-01`, time: "00:00", key: KEY.replace(/1$/, "8") });
  expect(db.rows("coffee_order_items").at(-1)).toMatchObject({ for_whom: "tamu", temperature: null, sugar: "Normal", ice: null });
});

it("before migration 202612020001: the settings still read (everything asked, the code's menu), the switches answer 503, and the rest works", async () => {
  db.state.menuMigrated = false;
  db.state.tables.coffee_settings = [{ id: 1, quota_karyawan: 4, quota_ga: 2, quota_intern: 2 }];
  delete db.state.tables.coffee_drinks;
  const all = await routes();
  const read = (await body(await all.reads.settings())).data as { menu: unknown[] };
  expect(read).toMatchObject({ optionsReady: false, options: { klaim: ALL, tim: ALL, tamu: ALL }, settings: { karyawan: 4 } });
  expect(read.menu).toHaveLength(15);
  const refused = await all.writes.options();
  expect(refused.status).toBe(503);
  expect((await body(refused)).message).toBe("Fitur ini menunggu migrasi 202612020001_coffee_menu.sql.");
  const id = await claim();
  for (const call of [all.reads.queue, () => all.reads.recap(), () => all.writes.finish(id), all.writes.settings, () => all.reads.people()]) expect((await call()).status).toBe(200);
  const month = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(new Date()).slice(0, 7);
  expect((await all.writes.manual({ ...manual, employeeId: PEOPLE.fajar, date: `${month}-01`, time: "00:00" })).status).toBe(200);
  expect(db.rows("coffee_order_items").at(-1)).toMatchObject({ temperature: "panas", sugar: "Normal", ice: "Normal" });
});

// F6: the pengelola's Menu.
it("manages the menu: read, add, change, hide, order, delete, with the words the screen shows", async () => {
  const all = await routes();
  const read = async () => (await body(await all.reads.menu())).data as { ready: boolean; drinks: { slug: string; name: string; active: boolean; orders: number; sort: number }[] };
  expect(await read()).toMatchObject({ ready: true, drinks: { length: 15 } });
  const added = await all.writes.addDrink();
  expect(added.headers.get("cache-control")).toBe("no-store");
  expect(await body(added)).toMatchObject({ ok: true, message: "Teh Tarik ditambahkan ke menu.", data: { drink: { slug: "teh-tarik", name: "Teh Tarik", group: "non-kopi", temperatures: ["panas"], sort: 160, orders: 0, photo: null, updatedLabel: "Dewi" } } });
  expect(await body(await all.writes.changeDrink("teh-tarik", { ...DRINK, name: "Teh Tarik Aceh", temperatures: ["es", "panas"] }))).toMatchObject({ message: "Teh Tarik Aceh disimpan.", data: { drink: { slug: "teh-tarik", name: "Teh Tarik Aceh", temperatures: ["panas", "es"] } } });
  expect(await body(await all.writes.showDrink("teh-tarik"))).toMatchObject({ message: "Teh Tarik Aceh disembunyikan. Tidak bisa dipesan, riwayatnya tetap ada.", data: { drink: { active: false } } });
  expect(await body(await all.writes.showDrink("teh-tarik", { active: true }))).toMatchObject({ message: "Teh Tarik Aceh tampil lagi di menu." });
  // F7: the two ticks through the same PATCH, one at a time; the answer says where the drink shows now.
  expect(await body(await all.writes.showDrink("teh-tarik", { guestBook: false }))).toMatchObject({ message: "Teh Tarik Aceh kini hanya tampil di Menu biasa.", data: { drink: { guestBook: false, regular: true, active: true } } });
  expect(await body(await all.writes.showDrink("teh-tarik", { regular: false }))).toMatchObject({ message: "Teh Tarik Aceh kini tidak tampil di menu mana pun.", data: { drink: { guestBook: false, regular: false } } });
  expect(await body(await all.writes.showDrink("teh-tarik", { guestBook: true, regular: true }))).toMatchObject({ message: "Teh Tarik Aceh kini tampil di Buku tamu dan Menu biasa." });
  expect((await all.writes.showDrink("teh-tarik", {})).status).toBe(422);
  expect((await all.writes.showDrink("teh-tarik", { guestBook: "ya" })).status).toBe(422);
  const slugs = (await read()).drinks.map(drink => drink.slug).reverse();
  const sorted = await body(await all.writes.sortDrinks({ slugs }));
  expect(sorted).toMatchObject({ message: "Urutan menu disimpan.", data: { ready: true } });
  expect((sorted.data!.drinks as { slug: string; sort: number }[]).slice(0, 2)).toMatchObject([{ slug: "teh-tarik", sort: 10 }, { slug: "classic-tea", sort: 20 }]);
  // A drink that was ordered once stays: only hiding is left.
  await claim();
  const used = await all.writes.deleteDrink("cafe-latte");
  expect(used.status).toBe(409);
  expect((await body(used)).message).toBe("Minuman ini sudah pernah dipesan, jadi tidak bisa dihapus. Sembunyikan saja supaya tidak bisa dipesan lagi.");
  expect((await read()).drinks.find(drink => drink.slug === "cafe-latte")).toMatchObject({ orders: 1 });
  expect(await body(await all.writes.deleteDrink("teh-tarik"))).toEqual({ ok: true, data: { slug: "teh-tarik" }, message: "Minuman dihapus dari menu." });
  expect((await all.writes.deleteDrink("teh-tarik")).status).toBe(404);
  expect((await read()).drinks).toHaveLength(15);
});

it("names what is wrong with a drink, an order or an address of the menu", async () => {
  const all = await routes();
  for (const [wrong, field] of [
    [{ ...DRINK, name: "  " }, "name"], [{ ...DRINK, name: "x".repeat(61) }, "name"], [{ ...DRINK, description: "x".repeat(201) }, "description"],
    [{ ...DRINK, group: "jus" }, "group"], [{ ...DRINK, temperatures: [] }, "temperatures"], [{ ...DRINK, temperatures: ["hangat"] }, "temperatures.0"], [{ ...DRINK, active: "ya" }, "active"],
  ] as const) {
    for (const call of [() => all.writes.addDrink(wrong), () => all.writes.changeDrink("kopi-susu", wrong)]) {
      const response = await call();
      expect(response.status, JSON.stringify(wrong)).toBe(422);
      expect((await body(response)).fieldErrors).toHaveProperty(field);
    }
  }
  expect((await body(await all.writes.addDrink({ ...DRINK, name: "" }))).fieldErrors).toEqual({ name: ["Tulis nama minumannya."] });
  for (const bad of ["Kopi Susu", "kopi_susu", "..", "a".repeat(41)]) {
    for (const call of [() => all.writes.changeDrink(bad), () => all.writes.showDrink(bad), () => all.writes.deleteDrink(bad), () => all.writes.photo(bad)]) expect((await call()).status, bad).toBe(422);
  }
  expect((await all.writes.showDrink("kopi-susu", { active: "tidak" })).status).toBe(422);
  for (const wrong of [{}, { slugs: [] }, { slugs: ["kopi-susu", "kopi-susu"] }, { slugs: ["Kopi Susu"] }, { slugs: "kopi-susu" }]) expect((await all.writes.sortDrinks(wrong)).status, JSON.stringify(wrong)).toBe(422);
  expect((await all.writes.changeDrink("tidak-ada")).status).toBe(404);
  expect(db.rows("coffee_drinks")).toHaveLength(15);
  expect(db.rows("coffee_drinks")[0]).toMatchObject({ name: "Kopi Susu", sort: 10 });
});

it("takes a drink's photo as a real image only, and replaces the one before it", async () => {
  const all = await routes();
  const saved = await all.writes.photo();
  expect(saved.status).toBe(200);
  const first = await body(saved);
  expect(first).toMatchObject({ ok: true, message: "Foto Kopi Susu diganti.", data: { drink: { slug: "kopi-susu", uploaded: true } } });
  expect((first.data!.drink as { photo: string }).photo).toMatch(/^https:\/\/storage\.contoh\.test\/event-photos\/coffee\/drinks\/kopi-susu-[0-9a-f-]{36}\.webp$/);
  expect(db.state.files.size).toBe(1);
  await all.writes.photo();
  expect(db.state.files.size).toBe(1);
  // An SVG that calls itself a PNG, a text file, no file at all, an empty one.
  const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], "foto.png", { type: "image/png" });
  const refused = await all.writes.photo("kopi-susu", svg);
  expect(refused.status).toBe(415);
  expect((await body(refused)).fieldErrors).toEqual({ photo: ["Format foto tidak dikenali. Pakai JPG, PNG, atau WebP."] });
  expect((await all.writes.photo("kopi-susu", new File(["halo"], "catatan.txt", { type: "text/plain" }))).status).toBe(415);
  expect((await all.writes.photo("kopi-susu", null)).status).toBe(422);
  expect((await all.writes.photo("kopi-susu", new File([], "kosong.png", { type: "image/png" }))).status).toBe(422);
  const big = new Uint8Array(5 * 1024 * 1024 + 1);
  big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const tooBig = await all.writes.photo("kopi-susu", new File([big], "besar.png", { type: "image/png" }));
  expect(tooBig.status).toBe(413);
  expect((await body(tooBig)).message).toBe("Ukuran foto paling besar 5 MB.");
  expect((await all.writes.photo("tidak-ada")).status).toBe(404);
  expect(db.state.files.size).toBe(1);
});
