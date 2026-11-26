import { beforeEach, expect, it, vi } from "vitest";
import { fakeDb, PEOPLE, seedPeople } from "@/lib/server/coffee/fake-db";
import { forgetMenu } from "@/lib/server/coffee/store";

/*
 * The pengelola's push route (F4): no admin session 401, no grant 403, the super admin's and the
 * shared sign-in 409 (a notification goes to a person), a foreign origin 403, a wrong body 422, and
 * the device saved for the employee behind the admin session. The database is the stand-in.
 */
const state = vi.hoisted(() => ({ admin: "person" as "none" | "nogrant" | "person" | "super" | "shared" }));
let db = fakeDb();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/supabase/admin", () => ({ createPrivilegedClient: () => db.client }));
vi.mock("@/lib/server/admin-session", async () => {
  const { ServiceError } = await import("@/lib/server/config");
  return {
    requireApiAdmin: async () => {
      if (state.admin === "none") throw new ServiceError(401, "Sesi berakhir. Masuk kembali sebelum melanjutkan.");
      if (state.admin === "nogrant") throw new ServiceError(403, "Akun Anda belum diberi akses ke bagian ini. Minta super admin.");
      return state.admin === "super" ? "super" : "admin";
    },
    currentAdmin: async () => state.admin === "super" ? { role: "super", kind: "super", name: "Super admin" }
      : state.admin === "shared" ? { role: "admin", kind: "shared", name: "Admin" }
      : state.admin === "person" ? { role: "admin", kind: "person", name: "Contoh Dewi Lestari", employeeId: PEOPLE.dewi } : null,
  };
});

const SITE = "https://journey.test";
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/laptop-dewi";
const device = { subscription: { endpoint: ENDPOINT, keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) } }, device: "Windows · Chrome" };
const send = (method: string, body?: unknown, origin = SITE) => new Request(`${SITE}/api/admin/coffee/push`, {
  method, headers: { origin, ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body),
});
const routes = async () => {
  const push = await import("./route");
  return {
    info: () => push.GET(),
    save: (body: unknown = device, origin?: string) => push.POST(send("POST", body, origin)),
    remove: (body: unknown = { endpoint: ENDPOINT }, origin?: string) => push.DELETE(send("DELETE", body, origin)),
  };
};
const body = async (response: Response) => await response.json() as { ok: boolean; message: string; data?: Record<string, unknown> };
const devices = () => db.rows("coffee_push_subscriptions");

beforeEach(() => { forgetMenu(true);
  db = fakeDb(); seedPeople(db); db.state.now = new Date(); state.admin = "person";
  process.env.RATE_LIMIT_SECRET = "x".repeat(40);
  process.env.WAM_VAPID_PUBLIC_KEY = "BContohKunciPublik"; process.env.WAM_VAPID_PRIVATE_KEY = "contoh-kunci-rahasia";
});

it("answers 401 without an admin session and 403 without the grant, on every method", async () => {
  const all = await routes();
  for (const [admin, status] of [["none", 401], ["nogrant", 403]] as const) {
    state.admin = admin;
    for (const call of Object.values(all)) expect((await call()).status).toBe(status);
  }
  expect(devices()).toEqual([]);
});

it("answers 409 to a sign-in that belongs to nobody: the super admin and the shared password", async () => {
  const all = await routes();
  for (const admin of ["super", "shared"] as const) {
    state.admin = admin;
    for (const call of Object.values(all)) {
      const response = await call();
      expect(response.status).toBe(409);
      expect((await body(response)).message).toBe("Masuk dengan akun karyawan untuk menerima notifikasi.");
    }
  }
  expect(devices()).toEqual([]);
});

it("refuses a write from another site and a body that is not a push subscription", async () => {
  const all = await routes();
  expect((await all.save(device, "https://evil.test")).status).toBe(403);
  expect((await all.remove({ endpoint: ENDPOINT }, "https://evil.test")).status).toBe(403);
  expect((await all.save({ subscription: { ...device.subscription, endpoint: "http://push.example/x" } })).status).toBe(422);
  expect((await all.save({})).status).toBe(422);
  expect((await all.remove({})).status).toBe(422);
  expect(devices()).toEqual([]);
});

it("saves the device for the employee behind the admin session and removes it again", async () => {
  const all = await routes();
  expect(await body(await all.info())).toMatchObject({ ok: true, data: { publicKey: "BContohKunciPublik", waiting: null } });
  expect((await all.save({ ...device, employeeId: PEOPLE.rina })).status).toBe(200);
  expect(devices()).toMatchObject([{ employee_id: PEOPLE.dewi, endpoint: ENDPOINT }]);
  expect((await all.remove()).status).toBe(200);
  expect(devices()).toEqual([]);
});

it("tells the pengelola what the server waits for, without failing", async () => {
  const all = await routes();
  delete process.env.WAM_VAPID_PUBLIC_KEY;
  expect(await body(await all.info())).toMatchObject({ ok: true, data: { publicKey: null, waiting: "kunci" } });
  expect((await all.save()).status).toBe(503);
  process.env.WAM_VAPID_PUBLIC_KEY = "BContohKunciPublik";
  db.state.pushMigrated = false;
  expect(await body(await all.info())).toMatchObject({ ok: true, data: { publicKey: null, waiting: "migrasi" } });
  expect((await body(await all.save())).message).toContain("202612010002_coffee_push.sql");
});
