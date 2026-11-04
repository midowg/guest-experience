import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { asksNewPassword } = await import("./session");

const account = (must: boolean, lastLogin: string | null, changed: string | null) => ({ must_change_password: must, last_login_at: lastLogin, password_changed_at: changed });

describe("the new-password screen after signing in", () => {
  it("shows at the very first sign-in", () => {
    expect(asksNewPassword(account(true, null, null))).toBe(true);
  });
  it("does not show again on later sign-ins with the first password", () => {
    expect(asksNewPassword(account(true, "2026-11-04T02:00:00Z", null))).toBe(false);
  });
  it("shows once more after the admin resets the password, then not again", () => {
    expect(asksNewPassword(account(true, "2026-11-04T02:00:00Z", "2026-11-05T08:00:00Z"))).toBe(true);
    expect(asksNewPassword(account(true, "2026-11-05T09:00:00Z", "2026-11-05T08:00:00Z"))).toBe(false);
  });
  it("never shows once the person has their own password", () => {
    expect(asksNewPassword(account(false, null, "2026-11-05T08:00:00Z"))).toBe(false);
  });
});
