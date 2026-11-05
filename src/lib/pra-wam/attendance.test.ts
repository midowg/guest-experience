import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  asMethod, checkInNow, checkInWindow, encodeProof, fitWithin, isOwnProofKey, MAX_PROOF_BYTES, methodCounts, methodLabels, newQrToken, ownMethodLabels,
  proofKeyFor, proofKeyPattern, proofStartSchema, selfCheckInRefusal, selfCheckInSchema, windowState,
} from "./attendance";

describe("check-in window", () => {
  // Senin 9 Nov 2026, 10.00–12.00 WIB.
  const window = checkInWindow("2026-11-09T03:00:00Z", "2026-11-09T05:00:00Z");
  it("opens 30 minutes before and closes 30 minutes after", () => {
    expect(window).toEqual({ opens: "2026-11-09T02:30:00.000Z", closes: "2026-11-09T05:30:00.000Z" });
  });
  it("is not open yet, open, then closed", () => {
    expect(windowState(window, new Date("2026-11-09T02:29:59Z"))).toBe("belum");
    expect(windowState(window, new Date("2026-11-09T02:30:00Z"))).toBe("buka");
    expect(windowState(window, new Date("2026-11-09T05:30:00Z"))).toBe("buka");
    expect(windowState(window, new Date("2026-11-09T05:30:01Z"))).toBe("tutup");
  });
});

describe("QR token", () => {
  it("is 24 URL-safe characters and different each time", () => {
    const token = newQrToken(size => randomBytes(size));
    expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(newQrToken(size => randomBytes(size))).not.toBe(token);
  });
});

describe("Saya hadir", () => {
  const session = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", person = "11111111-2222-4333-8444-555555555555", id = "cccccccc-dddd-4eee-8fff-000000000000";

  it("keeps a screenshot in the person's folder for the session, of the agreed type", () => {
    const key = proofKeyFor(session, person, id, "image/webp");
    expect(key).toBe(`pra-wam/absen/${session}/${person}/${id}.webp`);
    expect(proofKeyPattern.test(key)).toBe(true);
    expect(proofKeyPattern.test(key.replace(".webp", "xwebp"))).toBe(false);
    expect(isOwnProofKey(key, session, person, "image/webp")).toBe(true);
    expect(isOwnProofKey(key, session, person, "image/jpeg")).toBe(false);
    expect(isOwnProofKey(key, session, id, "image/webp")).toBe(false);
    expect(isOwnProofKey(key, id, person, "image/webp")).toBe(false);
    expect(isOwnProofKey(`pra-wam/foto/${person}/${id}.webp`, session, person, "image/webp")).toBe(false);
  });

  it("accepts offline alone, and online only with a confirmed upload within 1.5 MB", () => {
    expect(selfCheckInSchema.safeParse({ mode: "offline" }).success).toBe(true);
    expect(selfCheckInSchema.safeParse({ mode: "online" }).success).toBe(false);
    const proof = { key: proofKeyFor(session, person, id, "image/jpeg"), token: `1762650000.${"a".repeat(64)}`, size: 900_000, mime: "image/jpeg" };
    expect(selfCheckInSchema.safeParse({ mode: "online", proof }).success).toBe(true);
    expect(selfCheckInSchema.safeParse({ mode: "online", proof: { ...proof, size: MAX_PROOF_BYTES + 1 } }).success).toBe(false);
    expect(selfCheckInSchema.safeParse({ mode: "online", proof: { ...proof, mime: "image/png" } }).success).toBe(false);
    expect(proofStartSchema.safeParse({ mime: "image/webp", size: MAX_PROOF_BYTES }).success).toBe(true);
    expect(selfCheckInSchema.safeParse({ mode: "zoom" }).success).toBe(false);
  });

  it("draws a screenshot at most 2000 px, never larger than it was", () => {
    expect(fitWithin(2560, 1600)).toEqual({ width: 2000, height: 1250 });
    expect(fitWithin(1170, 2532)).toEqual({ width: 924, height: 2000 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("lowers the quality until the screenshot is within 1.5 MB, then tries JPEG", async () => {
    const blob = (type: string, size: number) => new Blob([new Uint8Array(size)], { type });
    const sizes = [2_000_000, 1_400_000];
    const out = await encodeProof(async mime => blob(mime, sizes.shift() ?? 1));
    expect(out.mime).toBe("image/webp");
    expect(out.blob.size).toBe(1_400_000);
    // A browser that cannot write WebP answers PNG: JPEG next.
    expect((await encodeProof(async (mime) => mime === "image/webp" ? blob("image/png", 10) : blob(mime, 10))).mime).toBe("image/jpeg");
    await expect(encodeProof(async mime => blob(mime, MAX_PROOF_BYTES + 1))).rejects.toThrow("1,5 MB");
  });

  it("says why it cannot be recorded, as the QR page does", () => {
    const window = checkInWindow("2026-11-09T03:00:00Z", "2026-11-09T05:00:00Z");
    const clock = (iso: string) => iso.slice(11, 16);
    expect(selfCheckInRefusal({ kind: "belum", window }, clock)).toBe("Absen belum dibuka. Absen sesi ini berlaku 02:30–05:30.");
    expect(selfCheckInRefusal({ kind: "tutup", window }, clock)).toMatch(/^Absen sudah ditutup 05:30\./);
    expect(selfCheckInRefusal({ kind: "sudah", checkedInAt: "2026-11-09T03:00:00Z" }, clock)).toBeNull();
    expect(selfCheckInRefusal({ kind: "bukan-peserta" }, clock)).toMatch(/bukan peserta/);
  });

  it("counts who is present by each way, with the labels panitia read", () => {
    const rows = [
      { checkedInAt: "x", method: "offline" as const }, { checkedInAt: "x", method: "offline" as const },
      { checkedInAt: "x", method: "online" as const }, { checkedInAt: null, method: null }, { checkedInAt: "x", method: "qr" as const },
    ];
    expect(methodCounts(rows)).toEqual({ offline: 2, online: 1, qr: 1, manual: 0 });
    expect(methodLabels).toEqual({ offline: "Saya hadir · di kantor", online: "Saya hadir · online", qr: "Scan QR", manual: "Dicatat panitia" });
    expect(ownMethodLabels.online).toBe("online (Zoom)");
    expect(asMethod("online")).toBe("online");
    expect(asMethod("zoom")).toBeNull();
  });
});

describe("Saya hadir in Aksi cepat", () => {
  const item = (key: string, kind: string, startsAt: string, endsAt: string, checkedInAt: string | null = null) => ({ key, kind, startsAt, endsAt, checkedInAt });
  const items = [
    item("b1", "appraisal", "2026-11-10T02:00:00Z", "2026-11-10T03:00:00Z"),
    item("s1", "sesi", "2026-11-10T02:00:00Z", "2026-11-10T03:00:00Z", "2026-11-10T02:05:00Z"),
    item("s2", "sesi", "2026-11-10T02:30:00Z", "2026-11-10T04:00:00Z"),
    item("s3", "sesi", "2026-11-10T06:00:00Z", "2026-11-10T07:00:00Z"),
  ];
  it("opens the first session whose check-in is open and not yet recorded, never a booking", () => {
    expect(checkInNow(items, new Date("2026-11-10T02:10:00Z"))?.key).toBe("s2");
    expect(checkInNow(items, new Date("2026-11-10T05:31:00Z"))?.key).toBe("s3");
  });
  it("has nothing before the window opens or after it closes", () => {
    expect(checkInNow(items, new Date("2026-11-10T01:00:00Z"))).toBeNull();
    expect(checkInNow(items, new Date("2026-11-10T08:00:00Z"))).toBeNull();
  });
});
