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
// The few calls sendPush makes on pw_push_subscriptions.
function query() {
  return {
    select: () => ({ in: (_: string, ids: string[]) => Promise.resolve({ data: rows.filter(row => ids.includes(row.employee_id)), error: null }) }),
    delete: () => ({ in: (_: string, ids: string[]) => { deleted.push(ids); return Promise.resolve({ error: null }); } }),
    update: () => ({ in: (_: string, ids: string[]) => { updated.push(ids); return Promise.resolve({ error: null }); } }),
  };
}
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: query }) }));

const { sendPush, schedulePush, pushPublicKey } = await import("./push");

describe("sendPush", () => {
  beforeEach(() => {
    sendNotification.mockReset(); deleted.length = 0; updated.length = 0;
    process.env.WAM_VAPID_PUBLIC_KEY = "public-key"; process.env.WAM_VAPID_PRIVATE_KEY = "private-key";
  });

  it("sends nothing until the server has its VAPID keys", async () => {
    delete process.env.WAM_VAPID_PRIVATE_KEY;
    expect(pushPublicKey()).toBeNull();
    expect(await sendPush(["a"], { title: "T", body: "B", url: "/wam/notifications" })).toEqual({ sent: 0, failed: 0, removed: 0, phones: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("sends to every phone of the people, and drops the phones the push service no longer knows", async () => {
    sendNotification.mockImplementation(async (subscription: { endpoint: string }) => {
      if (subscription.endpoint.endsWith("/2")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      return { statusCode: 201 };
    });
    const result = await sendPush(["a", "b", "a"], { title: "Pengumuman", body: "Isi", url: "/wam/notifications", tag: "x" });
    expect(result).toEqual({ sent: 2, failed: 1, removed: 1, phones: 3 });
    expect(JSON.parse(sendNotification.mock.calls[0][1])).toEqual({ title: "Pengumuman", body: "Isi", url: "/wam/notifications", tag: "x" });
    expect(sendNotification.mock.calls[0][2]).toMatchObject({ vapidDetails: { publicKey: "public-key", privateKey: "private-key" } });
    expect(deleted).toEqual([["s2"]]);
    expect(updated).toEqual([["s1", "s3"]]);
  });

  it("keeps a phone that failed for another reason", async () => {
    sendNotification.mockRejectedValue(Object.assign(new Error("busy"), { statusCode: 503 }));
    expect((await sendPush(["b"], { title: "T", body: "B", url: "/wam" })).removed).toBe(0);
    expect(deleted).toEqual([]);
  });

  it("sends at once where there is no request to send after", async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    await schedulePush(["b"], { title: "T", body: "B", url: "/wam" });
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });
});
