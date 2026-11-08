import { beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => { throw new Error("no request"); } }));
vi.mock("web-push", () => ({ default: { sendNotification: (...args: unknown[]) => sendNotification(...args) } }));

const rows = [
  { id: "s1", employee_id: "a", endpoint: "https://push.example/1", p256dh: "p".repeat(20), auth: "a".repeat(10) },
  { id: "s2", employee_id: "a", endpoint: "https://push.example/2", p256dh: "p".repeat(20), auth: "a".repeat(10) },
  { id: "s3", employee_id: "b", endpoint: "https://push.example/3", p256dh: "p".repeat(20), auth: "a".repeat(10) },
];
const deleted: string[][] = [];
const updated: string[][] = [];
// pw_notification_prefs: the stored choices per person, or the table missing (before 202611080002).
let prefs: { employee_id: string; push: unknown }[] = [];
let prefsError: { code?: string; message: string } | null = null;
const prefsReads: string[][] = [];
const upserts: unknown[] = [];

// The few calls push.ts makes on its two tables.
function query(table: string) {
  if (table === "pw_notification_prefs") {
    return {
      select: () => ({
        in: (_: string, ids: string[]) => { prefsReads.push(ids); return Promise.resolve({ data: prefsError ? null : prefs.filter(row => ids.includes(row.employee_id)), error: prefsError }); },
        eq: (_: string, id: string) => ({ maybeSingle: () => Promise.resolve({ data: prefsError ? null : prefs.find(row => row.employee_id === id) ?? null, error: prefsError }) }),
      }),
      upsert: (row: { employee_id: string; push: unknown }) => {
        upserts.push(row);
        prefs = [...prefs.filter(item => item.employee_id !== row.employee_id), row];
        return Promise.resolve({ error: null });
      },
    };
  }
  return {
    select: () => ({ in: (_: string, ids: string[]) => Promise.resolve({ data: rows.filter(row => ids.includes(row.employee_id)), error: null }) }),
    delete: () => ({ in: (_: string, ids: string[]) => { deleted.push(ids); return Promise.resolve({ error: null }); } }),
    update: () => ({ in: (_: string, ids: string[]) => { updated.push(ids); return Promise.resolve({ error: null }); } }),
  };
}
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: query }) }));

const { sendPush, schedulePush, pushPublicKey, readPushPrefs, savePushPrefs } = await import("./push");

// 10.00 WIB and 22.00 WIB (quiet hours) on 9 Nov 2026.
const day = new Date("2026-11-09T03:00:00Z");
const night = new Date("2026-11-09T15:00:00Z");
const member = (id: string) => ({ id, name: id, nickname: id, department: "", position: "", mustChangePassword: false, roles: [], photo: null });
const endpoints = () => sendNotification.mock.calls.map(call => (call[0] as { endpoint: string }).endpoint);

beforeEach(() => {
  sendNotification.mockReset(); deleted.length = 0; updated.length = 0; prefsReads.length = 0; upserts.length = 0;
  prefs = []; prefsError = null;
  process.env.WAM_VAPID_PUBLIC_KEY = "public-key"; process.env.WAM_VAPID_PRIVATE_KEY = "private-key";
});

describe("sendPush", () => {
  it("sends nothing until the server has its VAPID keys", async () => {
    delete process.env.WAM_VAPID_PRIVATE_KEY;
    expect(pushPublicKey()).toBeNull();
    expect(await sendPush(["a"], { title: "T", body: "B", url: "/wam/notifications" }, "pengumuman", day)).toEqual({ sent: 0, failed: 0, removed: 0, phones: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("sends to every phone of the people, and drops the phones the push service no longer knows", async () => {
    sendNotification.mockImplementation(async (subscription: { endpoint: string }) => {
      if (subscription.endpoint.endsWith("/2")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      return { statusCode: 201 };
    });
    const result = await sendPush(["a", "b", "a"], { title: "Pengumuman", body: "Isi", url: "/wam/notifications", tag: "x" }, "pengumuman", day);
    expect(result).toEqual({ sent: 2, failed: 1, removed: 1, phones: 3 });
    expect(JSON.parse(sendNotification.mock.calls[0][1])).toEqual({ title: "Pengumuman", body: "Isi", url: "/wam/notifications", tag: "x" });
    expect(sendNotification.mock.calls[0][2]).toMatchObject({ vapidDetails: { publicKey: "public-key", privateKey: "private-key" } });
    expect(deleted).toEqual([["s2"]]);
    expect(updated).toEqual([["s1", "s3"]]);
  });

  it("keeps a phone that failed for another reason", async () => {
    sendNotification.mockRejectedValue(Object.assign(new Error("busy"), { statusCode: 503 }));
    expect((await sendPush(["b"], { title: "T", body: "B", url: "/wam" }, "pengumuman", day)).removed).toBe(0);
    expect(deleted).toEqual([]);
  });

  it("sends at once where there is no request to send after", async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    await schedulePush(["b"], { title: "T", body: "B", url: "/wam" }, "pengumuman");
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });
});

describe("which notifications reach the phone", () => {
  beforeEach(() => { sendNotification.mockResolvedValue({ statusCode: 201 }); });

  it("sends only to the people whose choices allow the topic", async () => {
    prefs = [{ employee_id: "a", push: { forum: false } }];
    await sendPush(["a", "b"], { title: "Sesi baru", body: "B", url: "/wam" }, "forum", day);
    expect(endpoints()).toEqual(["https://push.example/3"]);
  });

  it("follows the defaults for people without choices: a new booking stays in the bell unless switched on", async () => {
    prefs = [{ employee_id: "b", push: { booking_baru: true } }];
    await sendPush(["a", "b"], { title: "Booking", body: "B", url: "/wam" }, "booking_baru", day);
    expect(endpoints()).toEqual(["https://push.example/3"]);
  });

  it("always sends Pengumuman, even to someone who stored it off, without reading the choices", async () => {
    prefs = [{ employee_id: "a", push: { pengumuman: false } }];
    expect((await sendPush(["a", "b"], { title: "P", body: "B", url: "/wam" }, "pengumuman", night)).phones).toBe(3);
    expect(prefsReads).toEqual([]);
  });

  it("keeps the quiet topics for the bell at night, but not the urgent ones", async () => {
    expect((await sendPush(["a", "b"], { title: "Sesi", body: "B", url: "/wam" }, "forum", night)).phones).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
    expect(prefsReads).toEqual([]);
    expect((await sendPush(["b"], { title: "HOD", body: "B", url: "/wam" }, "hod", night)).phones).toBe(1);
    // 06.30 WIB: quiet hours are over.
    expect((await sendPush(["b"], { title: "Sesi", body: "B", url: "/wam" }, "forum", new Date("2026-11-09T23:30:00Z"))).phones).toBe(1);
  });

  it("sends nothing for a null topic (a booking change far ahead)", async () => {
    expect((await sendPush(["a", "b"], { title: "Booking", body: "B", url: "/wam" }, null, day)).phones).toBe(0);
    await schedulePush(["a"], { title: "Booking", body: "B", url: "/wam" }, null);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("gives everyone the defaults before the prefs migration", async () => {
    prefsError = { code: "PGRST205", message: "Could not find the table 'public.pw_notification_prefs' in the schema cache" };
    expect((await sendPush(["a", "b"], { title: "Sesi", body: "B", url: "/wam" }, "forum", day)).phones).toBe(3);
    expect((await sendPush(["a", "b"], { title: "Booking", body: "B", url: "/wam" }, "booking_baru", day)).phones).toBe(0);
  });

  it("sends nothing on another database error while reading choices", async () => {
    prefsError = { code: "57014", message: "canceling statement due to statement timeout" };
    expect((await sendPush(["a", "b"], { title: "Sesi", body: "B", url: "/wam" }, "forum", day)).phones).toBe(0);
  });

  it("reads the choices 500 people at a time", async () => {
    const many = Array.from({ length: 1201 }, (_, index) => `p${index}`);
    await sendPush(many, { title: "Sesi", body: "B", url: "/wam" }, "forum", day);
    expect(prefsReads.map(ids => ids.length)).toEqual([500, 500, 201]);
  });
});

describe("a person's choices", () => {
  it("reads what applies: their choice, else the default, Pengumuman always on", async () => {
    prefs = [{ employee_id: "a", push: { forum: false, pengumuman: false, unknown: true } }];
    expect(await readPushPrefs(member("a"))).toEqual({ pengumuman: true, hod: true, forum: false, booking_penting: true, booking_baru: false, permintaan: true, kuesioner: true });
  });

  it("reads the defaults before the migration", async () => {
    prefsError = { code: "42P01", message: 'relation "pw_notification_prefs" does not exist' };
    expect((await readPushPrefs(member("a"))).booking_baru).toBe(false);
  });

  it("saves on top of earlier choices, never storing a locked topic", async () => {
    prefs = [{ employee_id: "a", push: { forum: false } }];
    const applied = await savePushPrefs(member("a"), { booking_baru: true, pengumuman: false });
    expect(upserts).toEqual([expect.objectContaining({ employee_id: "a", push: { forum: false, booking_baru: true } })]);
    expect(applied).toMatchObject({ pengumuman: true, forum: false, booking_baru: true });
  });

  it("says the migration is missing when saving before it", async () => {
    prefsError = { code: "PGRST205", message: "Could not find the table 'public.pw_notification_prefs'" };
    await expect(savePushPrefs(member("a"), { forum: false })).rejects.toMatchObject({ status: 503, message: "Pilihan notifikasi menunggu migrasi 202611080002_pra_wam_notification_prefs.sql." });
  });
});
