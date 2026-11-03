import { describe, expect, it } from "vitest";
import { passwordChangeSchema, passwordProblems } from "./password";
import { cancelsAnyBooking, managesApp, roleSummary, seesAllParticipants } from "./roles";

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
