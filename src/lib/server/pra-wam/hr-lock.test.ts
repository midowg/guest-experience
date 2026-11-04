import { describe, expect, it } from "vitest";
import { HR_LOCKOUT_MINUTES, HR_MAX_FAILURES, HR_NO_ACCESS, normalEmail } from "@/lib/pra-wam/hr-access";
import { HR_COOKIE_TTL_SECONDS, answerLines, combineLocks, lockStateOf, signHrToken, verifyHrToken } from "./hr-lock";

// Obvious fakes only: no real secret, email or session belongs in a test.
const SECRET = "s".repeat(40);
const ADMIN = "v2.a.1999999999.".concat("a".repeat(64));
const PERSON = "6f1c1e2a-3b4c-4d5e-8f60-718293a4b5c6";
const OTHER = "0b1c1e2a-3b4c-4d5e-8f60-718293a4b5c7";

describe("the unlock cookie", () => {
  const now = Date.UTC(2026, 10, 4, 3, 0, 0);

  it("names the person and opens for 30 minutes and no longer", () => {
    const token = signHrToken(SECRET, ADMIN, PERSON, now);
    expect(token).toMatch(new RegExp(`^v2\\.\\d+\\.${PERSON}\\.[0-9a-f]{64}$`));
    expect(verifyHrToken(SECRET, token, ADMIN, now)).toEqual({ employeeId: PERSON, expires: now + HR_COOKIE_TTL_SECONDS * 1000 });
    expect(verifyHrToken(SECRET, token, ADMIN, now + 29 * 60_000)).not.toBeNull();
    expect(verifyHrToken(SECRET, token, ADMIN, now + 30 * 60_000)).toBeNull();
    expect(HR_COOKIE_TTL_SECONDS).toBe(30 * 60);
  });

  it("dies with the admin session and cannot be moved to another person", () => {
    const token = signHrToken(SECRET, ADMIN, PERSON, now);
    expect(verifyHrToken(SECRET, token, ADMIN.replace(/a$/, "b"), now)).toBeNull();
    expect(verifyHrToken(SECRET, token, undefined, now)).toBeNull();
    expect(verifyHrToken("t".repeat(40), token, ADMIN, now)).toBeNull();
    // The same signature with someone else's id in it is refused.
    expect(verifyHrToken(SECRET, token.replace(PERSON, OTHER), ADMIN, now)).toBeNull();
  });

  it("refuses forged, stretched, malformed and old-format tokens", () => {
    const token = signHrToken(SECRET, ADMIN, PERSON, now);
    const [, expires, id, signature] = token.split(".");
    expect(verifyHrToken(SECRET, `v2.${Number(expires) - 60}.${id}.${signature}`, ADMIN, now)).toBeNull();
    expect(verifyHrToken(SECRET, `v2.${Number(expires) + 3600}.${id}.${signature}`, ADMIN, now)).toBeNull();
    expect(verifyHrToken(SECRET, `v2.${expires}.${id}.${"0".repeat(64)}`, ADMIN, now)).toBeNull();
    // A far-future expiry signed with the right key still fails: no unlock outlives 30 minutes.
    expect(verifyHrToken(SECRET, signHrToken(SECRET, ADMIN, PERSON, now + 3_600_000), ADMIN, now)).toBeNull();
    expect(verifyHrToken(SECRET, `v2.${expires}.not-a-uuid-not-a-uuid-not-a-uuid-xxxx.${signature}`, ADMIN, now)).toBeNull();
    // The shared-password cookie (v1) no longer opens anything.
    expect(verifyHrToken(SECRET, `v1.${expires}.${signature}`, ADMIN, now)).toBeNull();
    expect(verifyHrToken(SECRET, "rubbish", ADMIN, now)).toBeNull();
    expect(verifyHrToken(SECRET, undefined, ADMIN, now)).toBeNull();
  });
});

describe("the lockout after failed tries", () => {
  const now = Date.UTC(2026, 10, 4, 3, 0, 0);
  const at = (minutesAgo: number, action = "gagal") => ({ action, created_at: new Date(now - minutesAgo * 60_000).toISOString() });

  it("counts down the tries left", () => {
    expect(lockStateOf([], now)).toEqual({ lockedUntil: null, attemptsLeft: HR_MAX_FAILURES });
    expect(lockStateOf([at(1), at(2), at(3)], now)).toEqual({ lockedUntil: null, attemptsLeft: 2 });
  });

  it("locks for 15 minutes after the fifth failed one, then starts over", () => {
    const five = [at(1), at(2), at(3), at(4), at(5)];
    expect(lockStateOf(five, now)).toEqual({ lockedUntil: new Date(now + (HR_LOCKOUT_MINUTES - 1) * 60_000).toISOString(), attemptsLeft: 0 });
    expect(lockStateOf(five, now + HR_LOCKOUT_MINUTES * 60_000)).toEqual({ lockedUntil: null, attemptsLeft: HR_MAX_FAILURES });
  });

  it("forgets failures older than the window and those before a successful unlock", () => {
    expect(lockStateOf([at(1), at(2), at(20), at(21), at(22)], now).lockedUntil).toBeNull();
    expect(lockStateOf([at(1), at(2), at(2.5, "buka"), at(3), at(4), at(5)], now)).toEqual({ lockedUntil: null, attemptsLeft: 3 });
  });

  it("takes the stricter of the network count and the email count", () => {
    const later = new Date(now + 10 * 60_000).toISOString(), sooner = new Date(now + 5 * 60_000).toISOString();
    expect(combineLocks({ lockedUntil: null, attemptsLeft: 4 }, { lockedUntil: null, attemptsLeft: 2 })).toEqual({ lockedUntil: null, attemptsLeft: 2 });
    expect(combineLocks({ lockedUntil: null, attemptsLeft: 4 }, { lockedUntil: sooner, attemptsLeft: 0 })).toEqual({ lockedUntil: sooner, attemptsLeft: 0 });
    expect(combineLocks({ lockedUntil: later, attemptsLeft: 0 }, { lockedUntil: sooner, attemptsLeft: 0 }).lockedUntil).toBe(later);
    expect(combineLocks()).toEqual({ lockedUntil: null, attemptsLeft: HR_MAX_FAILURES });
  });
});

describe("the email", () => {
  it("is compared trimmed and in lower case", () => {
    expect(normalEmail("  HR.Satu@Contoh.TEST ")).toBe("hr.satu@contoh.test");
  });
  it("gets one answer that does not say whether the email exists or has access", () => {
    expect(HR_NO_ACCESS).toBe("Email ini tidak punya akses Data HR.");
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
