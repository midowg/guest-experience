import { beforeEach, expect, it, vi } from "vitest";
import { fakeDb, PEOPLE, seedPeople } from "@/lib/server/coffee/fake-db";

/*
 * Every pengelola route of Werkudara Coffee: no admin session 401, no grant 403, a foreign origin
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
const send = (path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) => new Request(`${SITE}${path}`, {
  method, headers: { ...(method === "GET" ? {} : { origin: SITE }), ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
});
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const body = async (response: Response) => await response.json() as { ok: boolean; message: string; data?: Record<string, unknown>; fieldErrors?: Record<string, string[]> };

const load = () => Promise.all([
  import("./queue/route"), import("./orders/[id]/selesai/route"), import("./orders/[id]/tolak/route"), import("./orders/[id]/urungkan/route"),
  import("./manual/route"), import("./people/route"), import("./rekap/route"), import("./rekap/export/route"), import("./settings/route"), import("./orders/[id]/batalkan/route"),
]);
const routes = async (headers: Record<string, string> = {}) => {
  const [queue, finish, reject, reopen, manualRoute, people, recap, exported, settings, cancel] = await load();
  const order = (name: string, id: string) => `/api/admin/coffee/orders/${id}/${name}`;
  return {
    reads: {
      queue: () => queue.GET(),
      people: (query = "") => people.GET(send(`/api/admin/coffee/people${query}`)),
      recap: (query = `?${span}`) => recap.GET(send(`/api/admin/coffee/rekap${query}`)),
      exported: (query = `?format=csv&${span}`, extra: Record<string, string> = {}) => exported.GET(send(`/api/admin/coffee/rekap/export${query}`, "GET", undefined, extra)),
      settings: () => settings.GET(),
    },
    writes: {
      finish: (id = NOBODY) => finish.POST(send(order("selesai", id), "POST", undefined, headers), params(id)),
      reject: (id = NOBODY, input: unknown = { note: "Susu segar sedang habis." }) => reject.POST(send(order("tolak", id), "POST", input, headers), params(id)),
      reopen: (id = NOBODY) => reopen.POST(send(order("urungkan", id), "POST", undefined, headers), params(id)),
      cancel: (id = NOBODY) => cancel.POST(send(order("batalkan", id), "POST", undefined, headers), params(id)),
      manual: (input: unknown = manual) => manualRoute.POST(send("/api/admin/coffee/manual", "POST", input, headers)),
      settings: (input: unknown = { karyawan: 5, ga: 2, intern: 2 }) => settings.PUT(send("/api/admin/coffee/settings", "PUT", input, headers)),
    },
  };
};
const everyCall = (all: Awaited<ReturnType<typeof routes>>) => [...Object.values(all.reads), ...Object.values(all.writes)] as (() => Promise<Response>)[];
const claim = async (employee: string = PEOPLE.rina) => (await db.client.rpc("coffee_submit_claim", { p_employee: employee, p_item: drink, p_at: new Date(Date.now() - 60_000 + db.rows("coffee_orders").length).toISOString(), p_manual: false, p_actor: employee, p_actor_label: "Contoh", p_key: KEY.replace(/1$/, String(db.rows("coffee_orders").length + 2)) })).data as string;

beforeEach(() => { db = fakeDb(); seedPeople(db); db.state.now = new Date(); state.admin = "person"; });

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
});

it("refuses a write from another site, and a download asked for by another site", async () => {
  const id = await claim();
  const foreign = await routes({ origin: "https://evil.test" });
  for (const call of [() => foreign.writes.finish(id), () => foreign.writes.reject(id), () => foreign.writes.reopen(id), () => foreign.writes.cancel(id), foreign.writes.manual, foreign.writes.settings]) expect((await call()).status).toBe(403);
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

it("answers 503 with the migration's name before it runs", async () => {
  db.state.migrated = false;
  for (const call of everyCall(await routes())) {
    const response = await call();
    expect(response.status).toBe(503);
    expect((await body(response)).message).toBe("Werkudara Coffee menunggu migrasi 202612010001_coffee.sql.");
  }
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
  expect((await body(await all.reads.settings())).data).toEqual({ settings: { karyawan: 1, ga: 2, intern: 2 }, holders: [{ id: PEOPLE.dewi, name: "Contoh Dewi Lestari", position: "Contoh karyawan" }] });
  const people = (await body(await all.reads.people())).data as { month: string; people: { id: string; used: number }[] };
  expect(people.month).toBe(month);
  expect(people.people.find(person => person.id === PEOPLE.rina)?.used).toBe(1);
  const days = `dari=${month}-01&sampai=${month}-28`;
  expect((await body(await all.reads.recap(`?${days}`))).data).toMatchObject({ rows: [{ no: "K-418", manual: true, claimNo: 1 }], summary: { total: 1, klaim: 1 } });
  const csv = await all.reads.exported(`?format=csv&${days}`, { "sec-fetch-site": "same-origin" });
  expect(csv.headers.get("content-type")).toBe("text/csv; charset=utf-8");
  expect(csv.headers.get("content-disposition")).toBe(`attachment; filename="werkudara-coffee-${month}-01_${month}-28.csv"`);
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
