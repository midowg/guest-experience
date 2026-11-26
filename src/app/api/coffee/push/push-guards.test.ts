import { beforeEach, expect, it, vi } from "vitest";
import { fakeDb, PEOPLE, seedPeople } from "@/lib/server/coffee/fake-db";
import { forgetMenu } from "@/lib/server/coffee/store";

/*
 * The push routes of the employee app and GA's tablet (F4): no session 401, a foreign origin 403, a
 * wrong body 422, a device saved for the signed-in person only, and a server without the keys or
 * the migration that says so instead of failing. The database and the push service are stand-ins.
 */
const state = vi.hoisted(() => ({ member: null as null | { id: string; name: string; nickname: string; category: string; roles: string[] }, sent: [] as string[], fail: 0 }));
let db = fakeDb();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/supabase/admin", () => ({ createPrivilegedClient: () => db.client }));
vi.mock("web-push", () => ({ default: { sendNotification: async (to: { endpoint: string }) => { if (state.fail) throw Object.assign(new Error("push service: RAHASIA-JAWABAN"), { statusCode: state.fail, body: "RAHASIA-JAWABAN" }); state.sent.push(to.endpoint); } } }));
vi.mock("@/lib/server/pra-wam/session", async () => {
  const { ServiceError } = await import("@/lib/server/config");
  return {
    currentMember: async () => state.member,
    requireApiMember: async () => { if (!state.member) throw new ServiceError(401, "Sesi berakhir. Masuk kembali sebelum melanjutkan."); return state.member; },
  };
});

const SITE = "https://journey.test";
const rina = { id: PEOPLE.rina, name: "Contoh Rina Putri", nickname: "Rina", category: "karyawan", roles: [] };
const fajar = { id: PEOPLE.fajar, name: "Contoh Fajar Nugroho", nickname: "Fajar", category: "intern", roles: [] };
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/hp-rina";
const device = { subscription: { endpoint: ENDPOINT, keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) } }, device: "Android · Chrome" };
const send = (path: string, method: string, body?: unknown, origin = SITE) => new Request(`${SITE}${path}`, {
  method, headers: { origin, ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body),
});
const routes = async () => {
  const [push, test] = await Promise.all([import("./route"), import("./test/route")]);
  return {
    info: () => push.GET(),
    save: (body: unknown = device, origin?: string) => push.POST(send("/api/coffee/push", "POST", body, origin)),
    remove: (body: unknown = { endpoint: ENDPOINT }, origin?: string) => push.DELETE(send("/api/coffee/push", "DELETE", body, origin)),
    test: (origin?: string) => test.POST(send("/api/coffee/push/test", "POST", undefined, origin)),
  };
};
const body = async (response: Response) => await response.json() as { ok: boolean; message: string; data?: Record<string, unknown>; fieldErrors?: Record<string, string[]> };
const devices = () => db.rows("coffee_push_subscriptions");

beforeEach(() => { forgetMenu(true);
  db = fakeDb(); seedPeople(db); db.state.now = new Date();
  state.member = rina; state.sent = []; state.fail = 0;
  process.env.RATE_LIMIT_SECRET = "x".repeat(40);
  process.env.WAM_VAPID_PUBLIC_KEY = "BContohKunciPublik"; process.env.WAM_VAPID_PRIVATE_KEY = "contoh-kunci-rahasia";
});

it("answers 401 without a session and 403 to a write from another site, on every route", async () => {
  const all = await routes();
  state.member = null;
  for (const call of Object.values(all)) expect((await call()).status).toBe(401);
  state.member = rina;
  for (const call of [() => all.save(device, "https://evil.test"), () => all.remove({ endpoint: ENDPOINT }, "https://evil.test"), () => all.test("https://evil.test")]) expect((await call()).status).toBe(403);
  expect(devices()).toEqual([]);
  expect(state.sent).toEqual([]);
});

it("refuses a device that is not a push subscription", async () => {
  const all = await routes();
  const wrong: unknown[] = [
    {}, { subscription: { endpoint: "bukan alamat", keys: device.subscription.keys } },
    // Only https: the server later posts to this address.
    { subscription: { ...device.subscription, endpoint: "http://10.0.0.1/internal" } },
    { subscription: { ...device.subscription, endpoint: "file:///etc/passwd" } },
    // Only a push service (audit F5-04): no other host, no address by number, no other port, no look-alike.
    { subscription: { ...device.subscription, endpoint: "https://push.example/hp-rina" } },
    { subscription: { ...device.subscription, endpoint: "https://169.254.169.254/latest/meta-data" } },
    { subscription: { ...device.subscription, endpoint: "https://[::1]/x" } },
    { subscription: { ...device.subscription, endpoint: "https://localhost/x" } },
    { subscription: { ...device.subscription, endpoint: "https://fcm.googleapis.com:8443/fcm/send/x" } },
    { subscription: { ...device.subscription, endpoint: "https://fcm.googleapis.com.evil.example/fcm/send/x" } },
    { subscription: { ...device.subscription, endpoint: "https://evil.example/?https://fcm.googleapis.com/" } },
    { subscription: { ...device.subscription, endpoint: "https://fcm.googleapis.com@evil.example/x" } },
    { subscription: { endpoint: ENDPOINT, keys: { p256dh: "x", auth: "y" } } },
    { ...device, device: "d".repeat(121) },
    { subscription: { ...device.subscription, endpoint: `https://fcm.googleapis.com/fcm/send/${"x".repeat(2000)}` } },
  ];
  for (const input of wrong) expect((await all.save(input)).status, JSON.stringify(input).slice(0, 80)).toBe(422);
  expect((await all.remove({})).status).toBe(422);
  expect((await all.remove({ endpoint: "bukan alamat" })).status).toBe(422);
  expect(devices()).toEqual([]);
});

it("takes the push services of Chrome, Firefox, Safari and Edge", async () => {
  const all = await routes();
  const known = ["https://fcm.googleapis.com/fcm/send/abc", "https://fcm.googleapis.com/wp/abc", "https://updates.push.services.mozilla.com/wpush/v2/abc", "https://web.push.apple.com/abc", "https://wns2-sg2p.notify.windows.com/w/?token=abc"];
  for (const endpoint of known) expect((await all.save({ ...device, subscription: { ...device.subscription, endpoint } })).status, endpoint).toBe(200);
  expect(devices().map(row => row.endpoint)).toEqual(known);
});

it("saves the device for the signed-in person, whatever the request says, and removes only their own", async () => {
  const all = await routes();
  expect(await body(await all.info())).toMatchObject({ ok: true, data: { publicKey: "BContohKunciPublik", waiting: null } });
  const saved = await all.save({ ...device, employeeId: PEOPLE.dewi, employee_id: PEOPLE.dewi });
  expect(await body(saved)).toMatchObject({ ok: true, message: "Notifikasi di perangkat ini aktif." });
  expect(devices()).toMatchObject([{ employee_id: PEOPLE.rina, endpoint: ENDPOINT, device: "Android · Chrome" }]);
  // Someone else cannot remove it by knowing its address…
  state.member = fajar;
  expect((await all.remove()).status).toBe(200);
  expect(devices()).toHaveLength(1);
  // …but signing in on the same device and turning it on takes it over.
  expect((await all.save()).status).toBe(200);
  expect(devices()).toMatchObject([{ employee_id: PEOPLE.fajar }]);
  expect((await all.remove()).status).toBe(200);
  expect(devices()).toEqual([]);
});

it("sends a test to the person's own devices only, ten times in ten minutes at most", async () => {
  const all = await routes();
  expect((await all.test()).status).toBe(409);
  await all.save();
  devices().push({ id: "lain", employee_id: PEOPLE.dewi, endpoint: "https://fcm.googleapis.com/fcm/send/hp-dewi", p256dh: "p".repeat(40), auth: "a".repeat(16) });
  expect(await body(await all.test())).toMatchObject({ ok: true, message: "Notifikasi tes dikirim." });
  expect(state.sent).toEqual([ENDPOINT]);
  for (let count = 0; count < 8; count++) expect((await all.test()).status).toBe(200);
  expect((await all.test()).status).toBe(429);
});

it("answers a test the same whatever the push service said (audit F5-04)", async () => {
  const all = await routes();
  await all.save();
  const fine = await body(await all.test());
  for (const fail of [500, 403, 404]) {
    state.fail = fail;
    const answer = await all.test();
    expect(answer.status, String(fail)).toBe(200);
    const said = await body(answer);
    expect(said).toEqual(fine);
    expect(JSON.stringify(said)).not.toMatch(/RAHASIA|500|403|404|gagal|belum terkirim/);
  }
});

it("says the feature is off instead of failing when the keys or the migration are missing", async () => {
  const all = await routes();
  db.state.pushMigrated = false;
  expect(await body(await all.info())).toMatchObject({ ok: true, data: { publicKey: null, waiting: "migrasi" } });
  const waiting = await all.save();
  expect(waiting.status).toBe(503);
  expect((await body(waiting)).message).toBe("Notifikasi menunggu migrasi 202612010002_coffee_push.sql.");
  expect((await all.remove()).status).toBe(200);
  delete process.env.WAM_VAPID_PRIVATE_KEY;
  expect(await body(await all.info())).toMatchObject({ ok: true, data: { publicKey: null, waiting: "kunci" } });
  expect((await all.save()).status).toBe(503);
  expect((await all.test()).status).toBe(503);
});
