import { describe, expect, it } from "vitest";
import { isEmailLike, isNoEmailAddress, LOGIN_NAME, loginSlug, nextLoginName, noEmailAddress, normalizeLoginName } from "./login-name";

describe("login names", () => {
  it("comes from the nama panggilan, else the first name", () => {
    expect(loginSlug("Dewi", "Dewi Lestari")).toBe("dewi");
    expect(loginSlug("", "Budi Santoso")).toBe("budi");
    expect(loginSlug("  Réné ", "x")).toBe("rene");
    expect(loginSlug("A", "A")).toBe("ax");
    expect(loginSlug("!!", "")).toBe("pengguna");
  });

  it("numbers a name already taken", () => {
    expect(nextLoginName("dewi", new Set())).toBe("dewi");
    expect(nextLoginName("dewi", new Set(["dewi"]))).toBe("dewi2");
    expect(nextLoginName("dewi", new Set(["dewi", "dewi2"]))).toBe("dewi3");
  });

  it("tells an email from a name, and checks the shape", () => {
    expect(isEmailLike("dewi@werkudara.com")).toBe(true);
    expect(isEmailLike("dewi")).toBe(false);
    expect(LOGIN_NAME.test(normalizeLoginName("  Dewi2 "))).toBe(true);
    expect(LOGIN_NAME.test("d")).toBe(false);
    expect(LOGIN_NAME.test("dewi lestari")).toBe(false);
  });

  it("gives an address that never receives mail to someone without email", () => {
    expect(noEmailAddress("dewi")).toBe("dewi@tanpa-email.wam.invalid");
    expect(isNoEmailAddress("DEWI@TANPA-EMAIL.WAM.INVALID")).toBe(true);
    expect(isNoEmailAddress("dewi@werkudara.com")).toBe(false);
  });
});
