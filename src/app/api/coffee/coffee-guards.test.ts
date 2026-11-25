import { beforeEach, expect, it, vi } from "vitest";
import { fakeDb, PEOPLE, seedPeople } from "@/lib/server/coffee/fake-db";

/*
 * Every employee route of Werkudara Coffee: no session 401, a foreign origin 403, Mode GA only for
 * those who may 403, a wrong body 422 with the field named, and 503 with the migration's name
 * before it runs. The database is the in-memory stand-in; made-up people.
 */
const state = vi.hoisted(() => ({ member: null as null | { id: string; name: string; nickname: string; category: string; roles: string[] } }));
let db = fakeDb();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/supabase/admin", () => ({ createPrivilegedClient: () => db.client }));
vi.mock("@/lib/server/admin-session", () => ({ currentAdmin: async () => null }));
vi.mock("@/lib/server/pra-wam/session", async () => {
  const { ServiceError } = await import("@/lib/server/config");
  return {
    currentMember: async () => state.member,
    requireApiMember: async () => { if (!state.member) throw new ServiceError(401, "Sesi berakhir. Masuk kembali sebelum melanjutkan."); return state.member; },
  };
});

const SITE = "https://journey.test";
const KEY = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const rina = { id: PEOPLE.rina, name: "Contoh Rina Putri", nickname: "Rina", category: "karyawan", roles: [] };
const bagas = { id: PEOPLE.bagas, name: "Contoh Bagas Saputra", nickname: "Bagas", category: "dw", roles: [] };
const send = (path: string, method = "GET", body?: unknown, origin = SITE) => new Request(`${SITE}${path}`, {
  method, headers: { ...(method === "GET" ? {} : { origin }), ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body),
});
const claim = { slug: "cafe-latte", temperature: "es", sugar: "Sedikit", ice: "Normal", key: KEY };
const meeting = { room: "Vasuki Room", picId: PEOPLE.rina, items: [{ for: "tamu", slug: "kopi-susu", temperature: "panas", sugar: "Normal", ice: "Normal", qty: 2 }], key: KEY };
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const routes = async () => {
  const [stateRoute, claims, one, gaStateRoute, gaMeetings] = await Promise.all([import("./state/route"), import("./claims/route"), import("./claims/[id]/route"), import("./ga/state/route"), import("./ga/meetings/route")]);
  return {
    state: () => stateRoute.GET(),
    claim: (body: unknown = claim, origin?: string) => claims.POST(send("/api/coffee/claims", "POST", body, origin)),
    cancel: (id: string = KEY, origin?: string) => one.DELETE(send(`/api/coffee/claims/${id}`, "DELETE", undefined, origin), params(id)),
    gaState: () => gaStateRoute.GET(),
    gaMeeting: (body: unknown = meeting, origin?: string) => gaMeetings.POST(send("/api/coffee/ga/meetings", "POST", body, origin)),
  };
};
const body = async (response: Response) => await response.json() as { ok: boolean; message: string; data?: Record<string, unknown>; fieldErrors?: Record<string, string[]> };

beforeEach(() => {
  db = fakeDb(); seedPeople(db); db.state.now = new Date();
  state.member = rina;
  process.env.RATE_LIMIT_SECRET = "x".repeat(40);
  process.env.WAM_SESSION_SECRET = "y".repeat(40);
});

it("answers 401 as JSON without a session, on every route", async () => {
  state.member = null;
  const all = await routes();
  for (const call of Object.values(all)) {
    const response = await call();
    expect(response.status).toBe(401);
    expect(await body(response)).toMatchObject({ ok: false, message: "Sesi berakhir. Masuk kembali sebelum melanjutkan." });
  }
  expect(db.rows("coffee_orders")).toEqual([]);
});

it("refuses a write from another site", async () => {
  state.member = bagas;
  const all = await routes();
  for (const call of [() => all.claim(claim, "https://evil.test"), () => all.cancel(KEY, "https://evil.test"), () => all.gaMeeting(meeting, "https://evil.test")]) {
    expect((await call()).status).toBe(403);
  }
  expect(db.rows("coffee_orders")).toEqual([]);
});

it("keeps Mode GA for the GA group, Admin Booking and holders of the Coffee grant", async () => {
  const all = await routes();
  for (const call of [all.gaState, all.gaMeeting]) {
    const response = await call();
    expect(response.status).toBe(403);
    expect((await body(response)).message).toBe("Mode GA hanya untuk tim GA dan pengelola Werkudara Coffee.");
  }
  expect(db.rows("coffee_orders")).toEqual([]);
  for (const member of [bagas, { ...rina, roles: ["ga"] }, { ...rina, id: PEOPLE.dewi }]) {
    state.member = member;
    expect((await all.gaState()).status).toBe(200);
  }
});

it("names the field when the body is wrong", async () => {
  state.member = bagas;
  const all = await routes();
  const wrongDrink = await all.claim({ ...claim, slug: "espresso" });
  expect(wrongDrink.status).toBe(422);
  expect((await body(wrongDrink)).fieldErrors).toEqual({ temperature: ["Espresso hanya tersedia panas."] });
  expect((await body(await all.claim({ ...claim, key: undefined }))).fieldErrors).toHaveProperty("key");
  expect((await all.cancel("bukan-uuid")).status).toBe(422);
  const noPic = await all.gaMeeting({ ...meeting, picId: "", items: [{ ...meeting.items[0], for: "tim" }] });
  expect(noPic.status).toBe(422);
  expect((await body(noPic)).fieldErrors).toEqual({ picId: ["Pilih PIC tamu."], "items.0.personId": ["Pilih orangnya."] });
  const { POST } = await import("./claims/route");
  const form = new Request(`${SITE}/api/coffee/claims`, { method: "POST", headers: { origin: SITE, "content-type": "text/plain" }, body: "slug=espresso" });
  expect((await POST(form)).status).toBe(415);
  expect(db.rows("coffee_orders")).toEqual([]);
});
it("answers 503 with the migration's name before it runs", async () => {
  state.member = bagas;
  db.state.migrated = false;
  const all = await routes();
  for (const call of Object.values(all)) {
    const response = await call();
    expect(response.status).toBe(503);
    expect((await body(response)).message).toBe("Werkudara Coffee menunggu migrasi 202612010001_coffee.sql.");
  }
});

it("takes a claim, shows it, and lets its owner (only) cancel it", async () => {
  const all = await routes();
  const sent = await body(await all.claim());
  expect(sent).toMatchObject({ ok: true, message: "Pengajuan terkirim.", data: { order: { no: "K-418", status: "diproses" }, me: { used: 1, left: 3 } } });
  const id = (sent.data!.order as { id: string }).id;
  expect((await body(await all.state())).data).toMatchObject({ me: { name: "Rina", quota: 4, used: 1 }, orders: [{ id }], ga: false, pengelola: false });
  // The id in the address never says who "I" am: someone else gets 409 and the claim stays.
  state.member = bagas;
  expect((await all.cancel(id)).status).toBe(409);
  state.member = rina;
  expect(await body(await all.cancel(id))).toMatchObject({ ok: true, message: "Pengajuan dibatalkan. Jatah kamu dikembalikan.", data: { order: { status: "batal" }, me: { used: 0 } } });
});

it("answers 409 when the quota is full, and takes a meeting order from GA", async () => {
  state.member = bagas;
  const all = await routes();
  for (const n of [1, 2]) expect((await all.claim({ ...claim, key: KEY.replace(/1$/, String(n + 1)) })).status).toBe(200);
  const full = await all.claim({ ...claim, key: KEY.replace(/1$/, "9") });
  expect(full.status).toBe(409);
  expect((await body(full)).message).toBe("Jatah bulan ini sudah habis.");
  expect(await body(await all.gaMeeting())).toMatchObject({ ok: true, message: "Pesanan terkirim ke pengelola.", data: { order: { no: "T-0113", sentBy: "Bagas", pic: { id: PEOPLE.rina } } } });
  expect((await body(await all.gaState())).data).toMatchObject({ today: [{ no: "T-0113" }] });
});

// Audit L-1: the office shares one address, so each person is counted, not the address.
it("limits each person, not the office's one address", async () => {
  const all = await routes();
  const keyOf = (n: number) => KEY.replace(/000000000001$/, String(n).padStart(12, "0"));
  const fajar = { id: PEOPLE.fajar, name: "Contoh Fajar Nugroho", nickname: "Fajar", category: "intern", roles: [] };
  const dewi = { id: PEOPLE.dewi, name: "Contoh Dewi Lestari", nickname: "Dewi", category: "karyawan", roles: [] };
  // Forty-eight sendings from one address in ten minutes, twelve each: nobody is told to wait (a full quota answers 409).
  let n = 100;
  for (let round = 0; round < 12; round++) {
    for (const member of [rina, bagas, fajar, dewi]) {
      state.member = member;
      expect((await all.claim({ ...claim, key: keyOf(++n) })).status).not.toBe(429);
    }
  }
  // One person alone is stopped at twenty; the next person is not.
  state.member = rina;
  for (let more = 13; more <= 20; more++) expect((await all.claim({ ...claim, key: keyOf(++n) })).status).toBe(409);
  const stopped = await all.claim({ ...claim, key: keyOf(++n) });
  expect(stopped.status).toBe(429);
  expect((await body(stopped)).message).toBe("Terlalu sering dalam waktu singkat. Tunggu sepuluh menit lalu coba lagi.");
  state.member = dewi;
  expect((await all.claim({ ...claim, key: keyOf(++n) })).status).toBe(409);
  // The tablet's own count is apart from the claims'.
  state.member = bagas;
  expect((await all.gaMeeting({ ...meeting, key: keyOf(++n) })).status).toBe(200);
  for (let more = 2; more <= 60; more++) expect((await all.gaMeeting({ ...meeting, key: keyOf(++n) })).status).toBe(200);
  expect((await all.gaMeeting({ ...meeting, key: keyOf(++n) })).status).toBe(429);
});

it("is told when the whole address sends far more than an office does", async () => {
  const all = await routes();
  const { COFFEE_NETWORK_LIMIT } = await import("@/lib/server/coffee/rate");
  expect(COFFEE_NETWORK_LIMIT).toBeGreaterThanOrEqual(200);
  // The address's counter is already at its limit.
  const [addressKey] = await (async () => { await all.claim(); return [...db.state.rate.keys()]; })();
  db.state.rate.set(addressKey, COFFEE_NETWORK_LIMIT);
  state.member = bagas;
  const response = await all.claim({ ...claim, key: KEY.replace(/1$/, "7") });
  expect(response.status).toBe(429);
  expect((await body(response)).message).toBe("Terlalu banyak permintaan. Tunggu sepuluh menit sebelum mencoba kembali.");
});
