import { describe, expect, it } from "vitest";
import { passwordChangeSchema, passwordProblems, passwordResetSchema } from "./password";
import { blockedRoles, bodOnly, cancelsAnyBooking, checkRoleChange, managesApp, normalizeRoles, roleConflicts, roleProblem, roleSummary, seesAllParticipants, type PraWamRole } from "./roles";

describe("roles", () => {
  it("adds to peserta and allows only what the role needs", () => {
    const peserta = { roles: [] as const }, bod = { roles: ["bod"] as const }, panitia = { roles: ["panitia"] as const }, admin = { roles: ["admin"] as const };
    expect([seesAllParticipants(peserta), cancelsAnyBooking(peserta), managesApp(peserta)]).toEqual([false, false, false]);
    expect([seesAllParticipants(bod), cancelsAnyBooking(bod), managesApp(bod)]).toEqual([true, false, false]);
    expect([seesAllParticipants(panitia), cancelsAnyBooking(panitia), managesApp(panitia)]).toEqual([true, true, false]);
    expect(managesApp(admin)).toBe(true);
    expect(roleSummary({ roles: ["bod", "panitia"] })).toBe("Peserta · Panitia · BOD");
  });
});

describe("which roles combine", () => {
  const sets: PraWamRole[][] = [[], ["panitia"], ["admin"], ["bod"], ["panitia", "admin"], ["panitia", "bod"], ["bod", "admin"], ["panitia", "bod", "admin"]];
  it("allows every combination without BOD, with or without lead", () => {
    for (const roles of sets.filter(roles => !roles.includes("bod"))) {
      expect(roleConflicts(roles)).toEqual([]);
      expect(roleConflicts(roles, { isLead: true })).toEqual([]);
      expect(roleProblem(roles, { isLead: true })).toBeNull();
    }
  });
  it("lets BOD stand alone, as a peserta", () => {
    expect(roleConflicts(["bod"])).toEqual([]);
    expect(roleProblem(["bod"])).toBeNull();
  });
  it("refuses BOD with Panitia, Admin WAM or a department lead", () => {
    expect(roleConflicts(["panitia", "bod"]).map(item => item.with)).toEqual(["panitia"]);
    expect(roleConflicts(["bod", "admin"]).map(item => item.with)).toEqual(["admin"]);
    expect(roleConflicts(["panitia", "bod", "admin"], { isLead: true }).map(item => item.with)).toEqual(["panitia", "admin", "lead"]);
    expect(roleConflicts(["bod"], { isLead: true }).map(item => item.with)).toEqual(["lead"]);
    expect(roleProblem(["panitia", "bod"])).toBe("BOD tidak bisa digabung dengan Panitia atau Admin WAM.");
    expect(roleProblem(["bod"], { isLead: true })).toBe("BOD tidak bisa menjadi HOD departemen atau lead BU.");
    expect(roleProblem(["bod", "admin"], { isLead: true })).toBe("BOD tidak bisa digabung dengan Panitia atau Admin WAM. BOD tidak bisa menjadi HOD departemen atau lead BU.");
  });
  it("keeps known roles once, in order", () => {
    expect(normalizeRoles(["admin", "panitia", "admin", "super"])).toEqual(["panitia", "admin"]);
  });
  it("refuses a change that adds a conflict but allows one that only removes", () => {
    expect(checkRoleChange(["bod"], ["panitia", "bod"])).toBe("BOD tidak bisa digabung dengan Panitia atau Admin WAM.");
    expect(checkRoleChange(["admin"], ["bod", "admin"])).toBe("BOD tidak bisa digabung dengan Panitia atau Admin WAM.");
    expect(checkRoleChange([], ["bod"], { isLead: true })).toBe("BOD tidak bisa menjadi HOD departemen atau lead BU.");
    expect(checkRoleChange(["panitia"], ["panitia", "admin"], { isLead: true })).toBeNull();
    // A row saved before the rule: removing one role at a time is fine, adding back is not.
    expect(checkRoleChange(["panitia", "bod", "admin"], ["bod", "admin"])).toBeNull();
    expect(checkRoleChange(["bod", "admin"], ["panitia", "bod", "admin"])).not.toBeNull();
    expect(checkRoleChange(["panitia", "bod", "admin"], ["panitia", "admin"])).toBeNull();
  });
  it("blocks the checkbox that would make a conflict, never one already ticked", () => {
    expect(blockedRoles(["bod"])).toEqual({ panitia: expect.any(String), admin: expect.any(String) });
    expect(Object.keys(blockedRoles(["panitia"]))).toEqual(["bod"]);
    expect(Object.keys(blockedRoles(["admin"]))).toEqual(["bod"]);
    expect(Object.keys(blockedRoles([], { isLead: true }))).toEqual(["bod"]);
    expect(blockedRoles([])).toEqual({});
    expect(blockedRoles(["panitia", "bod"])).toEqual({ admin: expect.any(String) });
  });
  it("gives a BOD the BOD menu", () => {
    expect(bodOnly({ roles: ["bod"] })).toBe(true);
    expect(bodOnly({ roles: ["panitia"] })).toBe(false);
    expect(bodOnly({ roles: [] })).toBe(false);
  });
});

describe("new password", () => {
  it("needs 8 characters with a number or symbol", () => {
    expect(passwordProblems("pendek1")).toEqual(["Minimal 8 karakter"]);
    expect(passwordProblems("hurufsemua")).toEqual(["Ada angka atau simbol"]);
    expect(passwordProblems("Kopi-pagi")).toEqual([]);
  });
  it("must be typed twice the same and differ from the current one", () => {
    expect(passwordChangeSchema.safeParse({ current: "lama1234", next: "baru-1234", confirm: "baru-1234" }).success).toBe(true);
    expect(passwordChangeSchema.safeParse({ current: "lama1234", next: "baru-1234", confirm: "baru-123" }).success).toBe(false);
    expect(passwordChangeSchema.safeParse({ current: "sama-1234", next: "sama-1234", confirm: "sama-1234" }).success).toBe(false);
  });
});

describe("password from the emailed link", () => {
  it("needs the link's token, a valid new password, typed twice", () => {
    const token = "t".repeat(40);
    expect(passwordResetSchema.safeParse({ accessToken: token, next: "baru-1234", confirm: "baru-1234" }).success).toBe(true);
    expect(passwordResetSchema.safeParse({ accessToken: "", next: "baru-1234", confirm: "baru-1234" }).success).toBe(false);
    expect(passwordResetSchema.safeParse({ accessToken: token, next: "pendek", confirm: "pendek" }).success).toBe(false);
  });
});
