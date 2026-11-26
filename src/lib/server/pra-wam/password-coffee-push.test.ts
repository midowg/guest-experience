import { beforeEach, expect, it, vi } from "vitest";

/*
 * A new password signs every other device out, so Werkudara Coffee's notifications stop on all of
 * the person's devices (Coffee audit F5-07). A stand-in database; made-up people. A database
 * without Coffee's push table must not stop the password change.
 */
const db = vi.hoisted(() => ({ devices: [] as { employee_id: string; endpoint: string }[], broken: false, cookie: "" }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: (_: string, value: string) => { db.cookie = value; }, get: () => undefined, delete: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));
vi.mock("../supabase/admin", () => {
  const from = (table: string) => {
    let removing = false;
    const builder = {
      select: () => builder, update: () => builder,
      delete: () => { if (table === "coffee_push_subscriptions" && db.broken) throw new Error("relation does not exist"); removing = true; return builder; },
      eq: (key: string, value: string) => { if (removing && table === "coffee_push_subscriptions") db.devices = db.devices.filter(row => row[key as "employee_id"] !== value); return builder; },
      maybeSingle: async () => ({ data: { auth_user_id: "auth-rina", employee_id: "rina", session_version: 3, active: true }, error: null }),
      then: (resolve: (value: { data: null; error: null }) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
    };
    return builder;
  };
  const auth = { getUser: async () => ({ data: { user: { id: "auth-rina" } }, error: null }), signInWithPassword: async () => ({ error: null }), admin: { getUserById: async () => ({ data: { user: { email: "rina@contoh.test" } } }), updateUserById: async () => ({ error: null }) } };
  return { createPrivilegedClient: () => ({ from, auth }), createPublicClient: () => ({ auth }) };
});

const { changePassword, completePasswordReset } = await import("./session");
const rina = { id: "rina" } as never;
beforeEach(() => {
  process.env.WAM_SESSION_SECRET = "y".repeat(40);
  db.devices = [{ employee_id: "rina", endpoint: "hp" }, { employee_id: "rina", endpoint: "tablet" }, { employee_id: "dewi", endpoint: "laptop" }];
  db.broken = false; db.cookie = "";
});

it("removes every Coffee device of the person when they change their password, and nobody else's", async () => {
  await changePassword(rina, "lama-12345", "baru-12345");
  expect(db.devices).toEqual([{ employee_id: "dewi", endpoint: "laptop" }]);
  expect(db.cookie).not.toBe("");
});

it("does the same when the password is reset from the emailed link", async () => {
  await completePasswordReset("token", "baru-12345");
  expect(db.devices).toEqual([{ employee_id: "dewi", endpoint: "laptop" }]);
});

it("changes the password all the same where Coffee's push table cannot be reached", async () => {
  db.broken = true;
  await expect(changePassword(rina, "lama-12345", "baru-12345")).resolves.toBeUndefined();
  expect(db.cookie).not.toBe("");
});
