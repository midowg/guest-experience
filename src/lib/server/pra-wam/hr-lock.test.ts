import { describe, expect, it } from "vitest";
import { HR_LOCKOUT_MINUTES, HR_MAX_FAILURES, hrPasswordProblem, hrPasswordStrength } from "@/lib/pra-wam/hr-password";
import {
  HR_COOKIE_TTL_SECONDS, SCRYPT_PARAMS, answerLines, hashHrPassword, lockStateOf, parseHrHash, passwordVersion, signHrToken, verifyHrPassword, verifyHrToken,
} from "./hr-lock";

// Obvious fakes only: no real password belongs in a test.
const FAKE = "contoh-password-palsu-1";
const SECRET = "s".repeat(40);
const ADMIN = "v2.a.1999999999.".concat("a".repeat(64));

describe("HR password hashing", () => {
  it("round-trips and stores scrypt$N$r$p$salt$hash with a fresh salt", async () => {
    const stored = await hashHrPassword(FAKE);
    expect(stored).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}$/);
    expect(stored).not.toContain(FAKE);
    expect(parseHrHash(stored)?.params).toEqual(SCRYPT_PARAMS);
    expect(await verifyHrPassword(FAKE, stored)).toBe(true);
    const again = await hashHrPassword(FAKE);
    expect(again).not.toBe(stored);
    expect(await verifyHrPassword(FAKE, again)).toBe(true);
  });

  it("rejects a wrong password, a missing hash and foreign or unsafe formats", async () => {
    const stored = await hashHrPassword(FAKE);
    expect(await verifyHrPassword("contoh-password-palsu-2", stored)).toBe(false);
    expect(await verifyHrPassword("", stored)).toBe(false);
    expect(await verifyHrPassword(FAKE, null)).toBe(false);
    expect(await verifyHrPassword(FAKE, "bcrypt$whatever")).toBe(false);
    // A tampered row asking for an enormous cost is refused, not computed.
    expect(parseHrHash(stored.replace("scrypt$32768$", "scrypt$33554432$"))).toBeNull();
    expect(parseHrHash(stored.replace("scrypt$32768$", "scrypt$30000$"))).toBeNull();
    expect(parseHrHash("scrypt$32768$8$1$c2hvcnQ=$c2hvcnQ=")).toBeNull();
  });

  it("gives every stored hash its own version", async () => {
    const [a, b] = await Promise.all([hashHrPassword(FAKE), hashHrPassword(FAKE)]);
    expect(passwordVersion(a)).toMatch(/^[0-9a-f]{32}$/);
    expect(passwordVersion(a)).toBe(passwordVersion(a));
    expect(passwordVersion(a)).not.toBe(passwordVersion(b));
  });
});

describe("HR password rules", () => {
  it("needs at least 10 characters and not only spaces", () => {
    expect(hrPasswordProblem("pendek-1")).toMatch(/minimal 10/);
    expect(hrPasswordProblem(" ".repeat(12))).toMatch(/spasi/);
    expect(hrPasswordProblem("x".repeat(201))).toMatch(/paling panjang/);
    expect(hrPasswordProblem(FAKE)).toBeNull();
  });

  it("hints at strength while typing", () => {
    expect(hrPasswordStrength("abc").level).toBe(0);
    expect(hrPasswordStrength("aaaaaaaaaaaa").level).toBe(1);
    expect(hrPasswordStrength("contohsaja").level).toBe(1);
    expect(hrPasswordStrength("contoh-saja1").level).toBe(3);
    expect(hrPasswordStrength("kopi gula meja lampu").level).toBe(3);
  });
});

describe("the unlock cookie", () => {
  const now = Date.UTC(2026, 10, 4, 3, 0, 0);
  const version = "v".repeat(32);

  it("opens for 30 minutes and no longer", () => {
    const token = signHrToken(SECRET, ADMIN, version, now);
    expect(token).toMatch(/^v1\.\d+\.[0-9a-f]{64}$/);
    expect(verifyHrToken(SECRET, token, ADMIN, version, now)).toBe(now + HR_COOKIE_TTL_SECONDS * 1000);
    expect(verifyHrToken(SECRET, token, ADMIN, version, now + 29 * 60_000)).not.toBeNull();
    expect(verifyHrToken(SECRET, token, ADMIN, version, now + 30 * 60_000)).toBeNull();
    expect(HR_COOKIE_TTL_SECONDS).toBe(30 * 60);
  });

  it("dies with the admin session and with the password", () => {
    const token = signHrToken(SECRET, ADMIN, version, now);
    expect(verifyHrToken(SECRET, token, ADMIN.replace(/a$/, "b"), version, now)).toBeNull();
    expect(verifyHrToken(SECRET, token, undefined, version, now)).toBeNull();
    expect(verifyHrToken(SECRET, token, ADMIN, "w".repeat(32), now)).toBeNull();
    expect(verifyHrToken("t".repeat(40), token, ADMIN, version, now)).toBeNull();
  });

  it("refuses forged, stretched or malformed tokens", () => {
    const token = signHrToken(SECRET, ADMIN, version, now);
    const [, expires, signature] = token.split(".");
    expect(verifyHrToken(SECRET, `v1.${Number(expires) - 60}.${signature}`, ADMIN, version, now)).toBeNull();
    expect(verifyHrToken(SECRET, `v1.${Number(expires) + 3600}.${signature}`, ADMIN, version, now)).toBeNull();
    expect(verifyHrToken(SECRET, `v1.${expires}.${"0".repeat(64)}`, ADMIN, version, now)).toBeNull();
    // A far-future expiry signed with the right key still fails: no unlock outlives 30 minutes.
    expect(verifyHrToken(SECRET, signHrToken(SECRET, ADMIN, version, now + 3_600_000), ADMIN, version, now)).toBeNull();
    expect(verifyHrToken(SECRET, "rubbish", ADMIN, version, now)).toBeNull();
    expect(verifyHrToken(SECRET, undefined, ADMIN, version, now)).toBeNull();
  });
});

describe("the lockout after wrong passwords", () => {
  const now = Date.UTC(2026, 10, 4, 3, 0, 0);
  const at = (minutesAgo: number, action = "gagal") => ({ action, created_at: new Date(now - minutesAgo * 60_000).toISOString() });

  it("counts down the tries left", () => {
    expect(lockStateOf([], now)).toEqual({ lockedUntil: null, attemptsLeft: HR_MAX_FAILURES });
    expect(lockStateOf([at(1), at(2), at(3)], now)).toEqual({ lockedUntil: null, attemptsLeft: 2 });
  });

  it("locks for 15 minutes after the fifth wrong one, then starts over", () => {
    const five = [at(1), at(2), at(3), at(4), at(5)];
    expect(lockStateOf(five, now)).toEqual({ lockedUntil: new Date(now + (HR_LOCKOUT_MINUTES - 1) * 60_000).toISOString(), attemptsLeft: 0 });
    expect(lockStateOf(five, now + HR_LOCKOUT_MINUTES * 60_000)).toEqual({ lockedUntil: null, attemptsLeft: HR_MAX_FAILURES });
  });

  it("forgets failures older than the window and those before a right password", () => {
    expect(lockStateOf([at(1), at(2), at(20), at(21), at(22)], now).lockedUntil).toBeNull();
    expect(lockStateOf([at(1), at(2), at(2.5, "buka"), at(3), at(4), at(5)], now)).toEqual({ lockedUntil: null, attemptsLeft: 3 });
  });
});

describe("answers as text", () => {
  const names = new Map([["p1", "Dewi"], ["p2", "Budi"]]);
  it("shows choices, people by name, consent and a matrix", () => {
    expect(answerLines("text", "Halo", names)).toEqual(["Halo"]);
    expect(answerLines("text", "  ", names)).toEqual([]);
    expect(answerLines("multi", ["Halal", "Vegan"], names)).toEqual(["Halal", "Vegan"]);
    expect(answerLines("person", ["p1", "p2", "p3"], names)).toEqual(["Dewi", "Budi", "Tanpa nama"]);
    expect(answerLines("consent", true, names)).toEqual(["Setuju"]);
    expect(answerLines("matrix", { Hospitality: "Terasa" }, names)).toEqual(["Hospitality: Terasa"]);
  });
});
