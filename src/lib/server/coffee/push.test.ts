import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, PEOPLE, seedPeople } from "./fake-db";

/*
 * Web push against the in-memory stand-in (fake-db.ts): who is told what, that the same news goes
 * out once, that a dead device is removed, and that nothing here ever stops or fails the action
 * that caused it. The push service is a stand-in too; nothing is sent. Made-up people.
 */
let db = fakeDb();
const web = vi.hoisted(() => ({
  sent: [] as { endpoint: string; body: { title: string; body: string; url: string; tag?: string }; options: Record<string, unknown> }[],
  /** endpoint → the status the push service answers with (anything else is delivered). */
  fails: new Map<string, number | "network">(),
  /** Work handed to after(): run by the test once the action has answered. null: after() is not available (no request). */
  later: [] as (() => Promise<void>)[] | null,
}));
vi.mock("server-only", () => ({}));
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => db.client }));
vi.mock("next/server", () => ({ after: (work: () => Promise<void>) => { if (!web.later) throw new Error("after() outside a request"); web.later.push(work); } }));
vi.mock("web-push", () => ({
  default: {
    sendNotification: async (to: { endpoint: string }, body: string, options: Record<string, unknown>) => {
      const fail = web.fails.get(to.endpoint);
      if (fail === "network") throw new Error("socket hang up");
      if (fail) throw Object.assign(new Error("push service"), { statusCode: fail });
      web.sent.push({ endpoint: to.endpoint, body: JSON.parse(body), options });
    },
  },
}));

const push = await import("./push");
const { submitClaim, cancelClaim } = await import("./claims");
const { submitMeeting } = await import("./meetings");
const { cancelManual, finishOrder, recordManual, rejectOrder, reopenOrder } = await import("./queue");
const { manualSchema } = await import("@/lib/coffee/schemas");

const now = new Date("2026-11-25T03:00:00Z");
const member = (id: string, nickname: string, category = "karyawan") => ({ id, name: `Contoh ${nickname}`, nickname, department: "", position: "", mustChangePassword: false, roles: [], category }) as never;
const rina = member(PEOPLE.rina, "Rina"), bagas = member(PEOPLE.bagas, "Bagas", "dw"), dewiMember = member(PEOPLE.dewi, "Dewi");
const dewi = { employeeId: PEOPLE.dewi, label: "Dewi" };
const superAdmin = { employeeId: null, label: "Super admin" };
const drink = { slug: "cafe-latte", temperature: "panas" as const, sugar: "Normal" as const, ice: "Normal" as const };
let n = 0;
const key = () => `eeeeeeee-eeee-4eee-8eee-${String(++n).padStart(12, "0")}`;
const device = (who: string, name: string) => db.rows("coffee_push_subscriptions").push({ id: `sub-${name}`, employee_id: who, endpoint: `https://push.example/${name}`, p256dh: "p".repeat(20), auth: "a".repeat(10), device: name, last_sent_at: null });
const endpoints = () => web.sent.map(item => item.endpoint.replace("https://push.example/", ""));
/** Everything that was handed to after() runs now, as Next does once the response has gone. */
async function afterResponse() { const work = web.later ?? []; web.later = []; for (const run of work) await run(); }
const meetingInput = (more: object = {}) => ({ room: "Vasuki Room", picId: PEOPLE.rina, items: [{ for: "tamu" as const, ...drink, qty: 2, guestName: "RAHASIA-TAMU" }], key: key(), ...more }) as never;
const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

beforeEach(() => {
  db = fakeDb(); seedPeople(db); db.state.now = now; n = 0;
  db.state.tables.admin_grants.push({ employee_id: PEOPLE.fajar, apps: ["coffee"] }, { employee_id: PEOPLE.keluar, apps: ["coffee"] }, { employee_id: PEOPLE.bagas, apps: ["hr"] });
  web.sent = []; web.fails = new Map(); web.later = [];
  errors.mockClear();
  process.env.WAM_VAPID_PUBLIC_KEY = "BContohKunciPublik"; process.env.WAM_VAPID_PRIVATE_KEY = "contoh-kunci-rahasia";
  delete process.env.WAM_VAPID_SUBJECT;
});
afterEach(() => { delete process.env.WAM_VAPID_PUBLIC_KEY; delete process.env.WAM_VAPID_PRIVATE_KEY; });

describe("a new order", () => {
  it("tells every holder of the Coffee grant who has a device, after the answer has gone", async () => {
    device(PEOPLE.dewi, "dewi-hp"); device(PEOPLE.dewi, "dewi-laptop"); device(PEOPLE.fajar, "fajar-hp");
    device(PEOPLE.bagas, "bagas-hp"); device(PEOPLE.rina, "rina-hp"); device(PEOPLE.keluar, "keluar-hp");
    const done = await submitClaim(rina, { ...drink, key: key() }, now);
    // The claim is answered before anything is sent.
    expect(done.order.status).toBe("diproses");
    expect(web.sent).toEqual([]);
    await afterResponse();
    // Holders only (Bagas holds another grant), and not the holder who is no longer an employee.
    expect(endpoints().sort()).toEqual(["dewi-hp", "dewi-laptop", "fajar-hp"]);
    expect(web.sent[0].body).toEqual({ title: "Klaim baru", body: "Contoh · Café Latte", url: "/admin/coffee", tag: done.order.no });
    expect(web.sent[0].options).toMatchObject({ urgency: "high", vapidDetails: { publicKey: "BContohKunciPublik", subject: "https://journey.werkudara.group/coffee" } });
    expect(db.rows("coffee_push_subscriptions").find(row => row.id === "sub-dewi-hp")?.last_sent_at).toBeTruthy();
  });

  it("does not tell the pengelola who sent it themself", async () => {
    device(PEOPLE.dewi, "dewi-hp"); device(PEOPLE.fajar, "fajar-hp");
    await submitClaim(dewiMember, { ...drink, key: key() }, now);
    await afterResponse();
    expect(endpoints()).toEqual(["fajar-hp"]);
  });

  it("tells about a meeting order with the room and the number of drinks only", async () => {
    device(PEOPLE.dewi, "dewi-hp");
    const { order } = await submitMeeting(bagas, meetingInput({ guest: "RAHASIA-INSTANSI" }), now);
    await afterResponse();
    expect(web.sent.map(item => item.body)).toEqual([{ title: "Pesanan rapat baru", body: "Vasuki Room · 2 minuman", url: "/admin/coffee", tag: order.no }]);
    expect(JSON.stringify(web.sent)).not.toMatch(/RAHASIA|Rina|Bagas/);
  });

  it("goes out once, however often the same key is sent", async () => {
    device(PEOPLE.dewi, "dewi-hp");
    const body = { ...drink, key: key() };
    const first = await submitClaim(rina, body, now);
    const again = await submitClaim(rina, body, now);
    expect(again.order.id).toBe(first.order.id);
    await afterResponse();
    expect(endpoints()).toEqual(["dewi-hp"]);
    expect(db.rows("coffee_push_sent")).toMatchObject([{ order_id: first.order.id, event: "klaim_baru", stamp: "" }]);
    // Two sendings that met at the unique index (the race): still one notification.
    db.state.race = true;
    const meeting = meetingInput();
    await submitMeeting(bagas, meeting, now);
    await submitMeeting(bagas, meeting, now);
    await afterResponse();
    expect(endpoints()).toEqual(["dewi-hp", "dewi-hp"]);
  });

  it("tells nobody about a record made by hand, a cancelled record, or a claim its owner cancelled", async () => {
    device(PEOPLE.dewi, "dewi-hp"); device(PEOPLE.fajar, "fajar-hp"); device(PEOPLE.rina, "rina-hp");
    const manual = await recordManual(manualSchema.parse({ kind: "klaim", employeeId: PEOPLE.rina, date: "2026-11-24", time: "10:00", ...drink, key: key() }), dewi, now);
    await cancelManual(manual.order.id, dewi, now);
    await afterResponse();
    expect(web.sent).toEqual([]);
    const claim = await submitClaim(rina, { ...drink, key: key() }, now);
    await afterResponse();
    web.sent = [];
    await cancelClaim(rina, claim.order.id, now);
    await afterResponse();
    expect(web.sent).toEqual([]);
  });
});

describe("a decision", () => {
  it("tells the claimant, with who processed it and never the note of a refusal", async () => {
    device(PEOPLE.rina, "rina-hp"); device(PEOPLE.dewi, "dewi-hp"); device(PEOPLE.fajar, "fajar-hp");
    const one = await submitClaim(rina, { ...drink, key: key() }, now);
    const two = await submitClaim(rina, { ...drink, slug: "americano", key: key() }, now);
    await afterResponse();
    web.sent = [];
    const done = await finishOrder(one.order.id, dewi, now);
    expect(done.status).toBe("selesai");
    expect(web.sent).toEqual([]);
    await rejectOrder(two.order.id, "RAHASIA: susu segar sedang habis.", superAdmin, now);
    await afterResponse();
    expect(endpoints()).toEqual(["rina-hp", "rina-hp"]);
    expect(web.sent.map(item => item.body)).toEqual([
      { title: "Silakan ambil di mesin", body: "Café Latte kamu selesai diproses oleh Dewi.", url: "/coffee/pesanan", tag: one.order.no },
      { title: "Pengajuan tidak bisa diproses", body: "Americano. Buka aplikasi untuk melihat catatan dari Super admin. Jatah kamu tidak berkurang.", url: "/coffee/pesanan", tag: two.order.no },
    ]);
    expect(JSON.stringify(web.sent)).not.toContain("RAHASIA");
  });

  it("tells the GA officer who sent a meeting order and its PIC, each with their own address", async () => {
    device(PEOPLE.bagas, "bagas-tablet"); device(PEOPLE.rina, "rina-hp"); device(PEOPLE.fajar, "fajar-hp");
    const { order } = await submitMeeting(bagas, meetingInput(), now);
    await afterResponse();
    web.sent = [];
    await finishOrder(order.id, dewi, now);
    await afterResponse();
    expect(web.sent.map(item => [item.endpoint.split("/").pop(), item.body.url])).toEqual([["bagas-tablet", `/coffee/ga?pesanan=${order.id}`], ["rina-hp", "/coffee"]]);
    expect(web.sent[0].body).toMatchObject({ title: "Pesanan rapat siap diambil", body: "Vasuki Room · 2 minuman. Selesai diproses oleh Dewi.", tag: order.no });
    expect(JSON.stringify(web.sent)).not.toMatch(/RAHASIA/);
  });

  it("tells a GA officer who is the PIC once, at the tablet's address", async () => {
    device(PEOPLE.bagas, "bagas-tablet");
    const { order } = await submitMeeting(bagas, meetingInput({ picId: PEOPLE.bagas }), now);
    await finishOrder(order.id, dewi, now);
    await afterResponse();
    expect(web.sent.map(item => item.body.url)).toEqual([`/coffee/ga?pesanan=${order.id}`]);
  });

  it("does not tell the pengelola about what they processed themself", async () => {
    device(PEOPLE.dewi, "dewi-hp");
    const claim = await submitClaim(dewiMember, { ...drink, key: key() }, now);
    await finishOrder(claim.order.id, dewi, now);
    await afterResponse();
    expect(web.sent).toEqual([]);
    // Nothing was told, so nothing is marked as told.
    expect(db.rows("coffee_push_sent")).toEqual([]);
  });

  it("is told again after Urungkan and a new decision, and not at all when it was undone before the sending ran", async () => {
    device(PEOPLE.rina, "rina-hp");
    const claim = await submitClaim(rina, { ...drink, key: key() }, now);
    await finishOrder(claim.order.id, dewi, now);
    // Urungkan lands before the phones were told: the order waits again, so there is nothing to tell.
    await reopenOrder(claim.order.id, dewi, now);
    await afterResponse();
    expect(web.sent).toEqual([]);
    const later = new Date(now.getTime() + 60_000);
    db.state.now = later;
    await rejectOrder(claim.order.id, "Mesin sedang diservis.", dewi, later);
    await afterResponse();
    await reopenOrder(claim.order.id, dewi, later);
    const last = new Date(later.getTime() + 60_000);
    db.state.now = last;
    await finishOrder(claim.order.id, dewi, last);
    await afterResponse();
    expect(web.sent.map(item => item.body.title)).toEqual(["Pengajuan tidak bisa diproses", "Silakan ambil di mesin"]);
    expect(db.rows("coffee_push_sent").filter(row => row.event !== "klaim_baru").map(row => [row.event, row.stamp])).toEqual([["ditolak", later.toISOString()], ["selesai", last.toISOString()]]);
  });

  it("goes out once for the same decision", async () => {
    device(PEOPLE.rina, "rina-hp");
    const claim = await submitClaim(rina, { ...drink, key: key() }, now);
    await finishOrder(claim.order.id, dewi, now);
    await push.notifyDecided(claim.order.id, dewi.employeeId);
    await push.notifyDecided(claim.order.id, null);
    await afterResponse();
    expect(endpoints()).toEqual(["rina-hp"]);
  });
});

describe("sending never stops what caused it", () => {
  it("removes a device the push service no longer knows (404, 410) and keeps the others", async () => {
    device(PEOPLE.dewi, "mati-410"); device(PEOPLE.dewi, "mati-404"); device(PEOPLE.dewi, "sibuk-500"); device(PEOPLE.fajar, "putus"); device(PEOPLE.fajar, "hidup");
    web.fails = new Map<string, number | "network">([["https://push.example/mati-410", 410], ["https://push.example/mati-404", 404], ["https://push.example/sibuk-500", 500], ["https://push.example/putus", "network"]]);
    const result = await push.sendCoffeePush([PEOPLE.dewi, PEOPLE.fajar, PEOPLE.dewi, null], { title: "t", body: "b", url: "/coffee" });
    expect(result).toEqual({ sent: 1, failed: 4, removed: 2, devices: 5 });
    expect(db.rows("coffee_push_subscriptions").map(row => row.device).sort()).toEqual(["hidup", "putus", "sibuk-500"]);
    // What failed is logged with its status, never with an address or a key.
    expect(errors.mock.calls.flat().join(" ")).toMatch(/2 perangkat gagal dikirimi \(500, tanpa jawaban\)/);
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/push\.example|pppp/);
  });

  it("saves the order all the same when every device fails, the table is missing, or the keys are not set", async () => {
    device(PEOPLE.dewi, "dewi-hp");
    web.fails.set("https://push.example/dewi-hp", "network");
    await expect(submitClaim(rina, { ...drink, key: key() }, now)).resolves.toMatchObject({ order: { status: "diproses" } });
    await expect(afterResponse()).resolves.toBeUndefined();

    db.state.pushMigrated = false;
    const waiting = await submitClaim(rina, { ...drink, key: key() }, now);
    await expect(finishOrder(waiting.order.id, dewi, now)).resolves.toMatchObject({ status: "selesai" });
    await expect(afterResponse()).resolves.toBeUndefined();
    expect(web.sent).toEqual([]);

    db.state.pushMigrated = true;
    delete process.env.WAM_VAPID_PRIVATE_KEY;
    const calls = db.state.calls.length;
    await expect(submitMeeting(bagas, meetingInput(), now)).resolves.toMatchObject({ order: { status: "diproses" } });
    // Without the keys nothing is even scheduled, and the push tables are not touched.
    expect(web.later).toEqual([]);
    expect(db.state.calls.slice(calls).filter(call => call.includes("coffee_push"))).toEqual([]);
    expect(push.pushPublicKey()).toBeNull();
  });

  it("swallows a fault while sending: the caller never sees it", async () => {
    device(PEOPLE.dewi, "dewi-hp");
    const claim = await submitClaim(rina, { ...drink, key: key() }, now);
    const broken = db.client.from;
    db.client.from = ((table: string) => { if (table === "admin_grants") throw new Error("database gone"); return broken(table); }) as typeof broken;
    await expect(afterResponse()).resolves.toBeUndefined();
    db.client.from = broken;
    expect(web.sent).toEqual([]);
    expect(errors.mock.calls.flat().join(" ")).toMatch(/coffee push: tidak terkirim.*database gone/);
    expect(claim.order.status).toBe("diproses");
  });

  it("sends at once where there is no request to wait after, still without throwing", async () => {
    device(PEOPLE.dewi, "dewi-hp");
    web.later = null;
    await submitClaim(rina, { ...drink, key: key() }, now);
    expect(endpoints()).toEqual(["dewi-hp"]);
  });
});

describe("a device", () => {
  const input = { endpoint: "https://push.example/hp", p256dh: "p".repeat(20), auth: "a".repeat(10), device: "Android · Chrome" };

  it("belongs to whoever saved it last, and only its owner removes it", async () => {
    await push.saveSubscription(PEOPLE.rina, input);
    await push.saveSubscription(PEOPLE.rina, input);
    expect(db.rows("coffee_push_subscriptions")).toMatchObject([{ employee_id: PEOPLE.rina, endpoint: input.endpoint }]);
    // The phone changed hands: one row, now the new person's.
    await push.saveSubscription(PEOPLE.fajar, input);
    expect(db.rows("coffee_push_subscriptions")).toMatchObject([{ employee_id: PEOPLE.fajar }]);
    await push.removeSubscription(PEOPLE.rina, input.endpoint);
    expect(db.rows("coffee_push_subscriptions")).toHaveLength(1);
    await push.removeSubscription(PEOPLE.fajar, input.endpoint);
    expect(db.rows("coffee_push_subscriptions")).toEqual([]);
  });

  it("says what the server waits for: the keys, or the migration", async () => {
    expect(await push.pushInfo()).toEqual({ publicKey: "BContohKunciPublik", waiting: null });
    db.state.pushMigrated = false;
    expect(await push.pushInfo()).toEqual({ publicKey: null, waiting: "migrasi" });
    await expect(push.saveSubscription(PEOPLE.rina, input)).rejects.toMatchObject({ status: 503, message: "Notifikasi menunggu migrasi 202612010002_coffee_push.sql." });
    await expect(push.removeSubscription(PEOPLE.rina, input.endpoint)).resolves.toBeUndefined();
    delete process.env.WAM_VAPID_PUBLIC_KEY;
    expect(await push.pushInfo()).toEqual({ publicKey: null, waiting: "kunci" });
    await expect(push.saveSubscription(PEOPLE.rina, input)).rejects.toMatchObject({ status: 503, message: "Notifikasi belum disiapkan di server." });
  });

  it("gets a test only when there is a device to send to", async () => {
    await expect(push.sendTestPush(PEOPLE.rina)).rejects.toMatchObject({ status: 409 });
    device(PEOPLE.rina, "rina-hp"); device(PEOPLE.dewi, "dewi-hp");
    await expect(push.sendTestPush(PEOPLE.rina)).resolves.toMatchObject({ sent: 1, devices: 1 });
    expect(web.sent.map(item => [item.endpoint, item.body.title, item.body.tag])).toEqual([["https://push.example/rina-hp", "Werkudara Coffee", "tes"]]);
    web.fails.set("https://push.example/rina-hp", 410);
    await expect(push.sendTestPush(PEOPLE.rina)).rejects.toMatchObject({ status: 502 });
    expect(db.rows("coffee_push_subscriptions").map(row => row.device)).toEqual(["dewi-hp"]);
  });
});
