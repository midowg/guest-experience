import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, keptTakenAt, parsePhotoId, parseSession, parseView, photoConfirmSchema, photoStartSchema, reportSchema } from "./filters";
import { centerCrop, fitSide, halvingSteps, largeTries, squareCrop } from "./image";
import { cellBounds, cellLabel, cellOrder, gridGeometry, hashSeed, letterCells, mosaicPercent, mosaicText } from "./mosaic";
import { afterFailure, backoffDelay, nextDue, nextWake, outcomeOf, queueSummary, resetBackoff, type QueueItem } from "./queue";
import { sampleFeedSemua, sampleMosaic } from "./sample";
import { flushedText, newPhotosText, photoAlt, photoMeta, photoTime, pileTilt, queuedPill, sentText, stackCount, stackCountSpoken, swipeDecision, TILT_MAX, TILT_MIN } from "./stack";

const RANI = "00000000-0000-4000-8000-000000000001";
const now = new Date("2027-01-05T10:05:00+07:00");

describe("Momen filters", () => {
  it("read lihat, sesi and foto from the address, safely", () => {
    expect(parseView(undefined)).toBe("semua");
    // There is no Kelompokku any more: an old address falls back to Semua.
    expect(parseView("kelompok")).toBe("semua");
    expect(parseView("saya")).toBe("saya");
    expect(parseView("saya", false)).toBe("semua");
    expect(parseView(["saya", "semua"])).toBe("saya");
    expect(parseSession("umum")).toBe("umum");
    expect(parseSession(RANI.toUpperCase())).toBe(RANI);
    expect(parseSession("x' or 1=1")).toBeNull();
    expect(parsePhotoId("bukan-id")).toBeNull();
  });

  it("page with a cursor that keeps the database's own time (microseconds)", () => {
    const at = "2027-01-05T03:02:00.123456+00:00";
    const cursor = encodeCursor("baru", at, RANI);
    expect(decodeCursor(cursor)).toEqual({ mode: "baru", at, id: RANI, rest: false });
    // The stack's own run (the person's own unseen photo comes first) has a cursor of its own.
    expect(decodeCursor(encodeCursor("baru", at, RANI, true))).toEqual({ mode: "baru", at, id: RANI, rest: true });
    expect(encodeCursor("semua", at, RANI, true)).toBe(`s~${at}~${RANI}`);
    expect(decodeCursor("r~")).toBeNull();
    expect(decodeCursor(encodeCursor("semua", null, null))).toEqual({ mode: "semua", at: null, id: null, rest: false });
    expect(decodeCursor("b~")).toEqual({ mode: "baru", at: null, id: null, rest: false });
    expect(decodeCursor("x~2027~id")).toBeNull();
    expect(decodeCursor(`s~kemarin~${RANI}`)).toBeNull();
    expect(decodeCursor(`s~${at}~bukan`)).toBeNull();
    expect(decodeCursor("s~" + "9".repeat(200))).toBeNull();
  });

  const start = { clientId: RANI, sessionId: null, takenAt: "2027-01-05T08:20:00.000Z", width: 1280, height: 1600, size: 420_000, thumbSize: 40_000, tileSize: 9_000 };
  it("accept an upload only within the sizes the app makes", () => {
    expect(photoStartSchema.safeParse(start).success).toBe(true);
    expect(photoStartSchema.safeParse({ ...start, size: 3_000_000 }).success).toBe(false);
    expect(photoStartSchema.safeParse({ ...start, tileSize: 100_000 }).success).toBe(false);
    // The audience is not asked any more: whatever a phone still sends is dropped, never kept.
    expect(photoStartSchema.safeParse({ ...start, audience: "kelompok" })).toMatchObject({ success: true, data: expect.not.objectContaining({ audience: expect.anything() }) });
    expect(photoStartSchema.safeParse({ ...start, clientId: "1" }).success).toBe(false);
    expect(photoStartSchema.safeParse({ ...start, takenAt: "kemarin" }).success).toBe(false);
    expect(photoConfirmSchema.safeParse({ ...start, token: "123.abc" }).success).toBe(false);
    expect(photoConfirmSchema.safeParse({ ...start, token: `1700000000.${"a".repeat(64)}` }).success).toBe(true);
  });

  it("require a note for Lainnya, and a reason at all", () => {
    expect(reportSchema.safeParse({ reason: "tidak_setuju" }).success).toBe(true);
    expect(reportSchema.safeParse({ reason: "lainnya", note: "  " }).success).toBe(false);
    expect(reportSchema.safeParse({ reason: "lainnya", note: "Belum siap difoto." }).success).toBe(true);
    expect(reportSchema.safeParse({}).success).toBe(false);
    expect(reportSchema.safeParse({ reason: "tidak_pantas", note: "x".repeat(301) }).success).toBe(false);
  });

  it("keep the phone's time unless the clock is far off", () => {
    expect(keptTakenAt("2027-01-05T03:00:00.000Z", now)).toBe("2027-01-05T03:00:00.000Z");
    expect(keptTakenAt("2030-01-01T00:00:00.000Z", now)).toBe(now.toISOString());
    expect(keptTakenAt("2026-01-01T00:00:00.000Z", now)).toBe(now.toISOString());
  });
});

describe("Momen photo sizes", () => {
  it("cut the middle at 4:5, landscape or portrait", () => {
    expect(centerCrop(4000, 3000)).toEqual({ x: 800, y: 0, width: 2400, height: 3000 });
    expect(centerCrop(1080, 1920)).toEqual({ x: 0, y: 285, width: 1080, height: 1350 });
    expect(centerCrop(800, 1000)).toEqual({ x: 0, y: 0, width: 800, height: 1000 });
    expect(squareCrop(1280, 1600)).toEqual({ x: 0, y: 160, width: 1280, height: 1280 });
  });

  it("shrink to the long side, never enlarge, halving on the way", () => {
    expect(fitSide(2400, 3000, 1600)).toEqual({ width: 1280, height: 1600 });
    expect(fitSide(400, 500, 1600)).toEqual({ width: 400, height: 500 });
    expect(halvingSteps({ width: 4800, height: 6000 }, { width: 1280, height: 1600 })).toEqual([{ width: 2400, height: 3000 }, { width: 1280, height: 1600 }]);
    expect(halvingSteps({ width: 2000, height: 2500 }, { width: 1280, height: 1600 })).toEqual([{ width: 1280, height: 1600 }]);
    expect(largeTries()[0]).toEqual({ side: 1600, quality: 0.8 });
    expect(largeTries().at(-1)).toEqual({ side: 1280, quality: 0.6 });
  });
});

describe("Momen queue", () => {
  const item = (over: Partial<QueueItem> = {}): QueueItem => ({
    clientId: RANI, batch: "b1", sessionId: null, takenAt: now.toISOString(), createdAt: 1, width: 1280, height: 1600,
    besar: new ArrayBuffer(1), kecil: new ArrayBuffer(1), ubin: new ArrayBuffer(1), state: "antre", attempts: 0, nextAt: 0, error: null, offline: false, photoId: null, deferred: false, ...over,
  });

  it("back off with full jitter, capped at five minutes", () => {
    expect(backoffDelay(0, () => 0.999)).toBeLessThan(2000);
    expect(backoffDelay(3, () => 0.5)).toBe(8000);
    expect(backoffDelay(30, () => 0.999)).toBeLessThan(5 * 60_000);
    expect(backoffDelay(4, () => 0)).toBe(0);
  });

  it("try again on no network, 5xx and 429; a new address when storage refuses; stop on a refusal", () => {
    expect(outcomeOf(0, "server")).toBe("ulang");
    expect(outcomeOf(503, "server")).toBe("ulang");
    expect(outcomeOf(429, "server")).toBe("ulang");
    expect(outcomeOf(401, "server")).toBe("masuk");
    expect(outcomeOf(422, "server")).toBe("gagal");
    expect(outcomeOf(413, "server")).toBe("gagal");
    expect(outcomeOf(403, "storage")).toBe("url");
    expect(outcomeOf(0, "storage")).toBe("ulang");
  });

  it("send the oldest due first and wake at the earliest", () => {
    const items = [item({ clientId: "a", createdAt: 5 }), item({ clientId: "b", createdAt: 2, nextAt: 100 }), item({ clientId: "c", createdAt: 3, state: "gagal" })];
    expect(nextDue(items, 50)?.clientId).toBe("a");
    expect(nextDue(items, 150)?.clientId).toBe("b");
    expect(nextWake(items)).toBe(0);
    expect(nextWake([item({ state: "gagal" })])).toBeNull();
  });

  it("start over when the app opens or the signal returns, and say how many wait", () => {
    const waiting = [item({ nextAt: 9_999 }), item({ state: "masuk" }), item({ state: "gagal" })];
    expect(resetBackoff(waiting, 10).map(entry => [entry.state, entry.nextAt])).toEqual([["antre", 10], ["antre", 0], ["gagal", 0]]);
    expect(queueSummary(waiting, false)).toEqual({ waiting: 2, failed: 1, offline: true });
    expect(queueSummary([item()], true).offline).toBe(false);
    expect(queueSummary([item({ offline: true })], true).offline).toBe(true);
  });

  it("record a failure: backoff, a new address at once, or stopped", () => {
    expect(afterFailure(item(), "ulang", "x", 1000, () => 0.5, true)).toMatchObject({ attempts: 1, nextAt: 3000, offline: true, state: "antre" });
    expect(afterFailure(item(), "url", "x", 1000)).toMatchObject({ nextAt: 1000 });
    expect(afterFailure(item({ attempts: 3 }), "url", "x", 1000, () => 0.5).nextAt).toBeGreaterThan(1000);
    expect(afterFailure(item(), "gagal", "Bukan foto.", 1000)).toMatchObject({ state: "gagal", error: "Bukan foto." });
    expect(afterFailure(item(), "masuk", "Masuk lagi.", 1000).state).toBe("masuk");
  });
});

describe("Mozaik", () => {
  const rowsOf = (cells: string, columns: number) => Array.from({ length: cells.length / columns }, (_, row) => cells.slice(row * columns, (row + 1) * columns));

  it("write WAM 2026 on the prototype's 30 × 20 grid in two lines, crisp", () => {
    const cells = letterCells(30, 20, "WAM 2026");
    expect(cells).toHaveLength(600);
    const rows = rowsOf(cells, 30);
    // A margin all round; W, A, M on top, 2, 0, 2, 6 under them.
    expect(rows[0]).toBe(".".repeat(30));
    expect(rows.at(-1)).toBe(".".repeat(30));
    expect(new Set(cells.replace(/\./g, ""))).toEqual(new Set(["W", "A", "M", "2", "0", "6"]));
    const top = rows.findIndex(row => row.includes("W")), bottom = rows.findIndex(row => row.includes("2"));
    expect(top).toBeLessThan(bottom);
  });

  it("on the default 50 × 36 grid the letters are two cells thick and fill the width (the prototype's look)", () => {
    const rows = rowsOf(letterCells(50, 36, "WAM 2026"), 50);
    // "2026" is 23 pixels wide at scale 2 = 46 of 50 columns; the first letter row is two cells tall.
    const widest = Math.max(...rows.filter(row => /[^.]/.test(row)).map(row => row.replace(/\.+$/, "").length - row.search(/[^.]/)));
    expect(widest).toBeGreaterThanOrEqual(40);
    expect(rows.filter(row => row.includes("W")).length).toBe(14); // 7 pixel rows × scale 2
  });

  it("fit any grid, also the default 40 × 15, and draw something on a tiny one", () => {
    // 40 × 15 (the fondasi default) is too short for 7-row letters on one line: smaller, still drawn.
    expect(letterCells(40, 15).replace(/\./g, "").length).toBeGreaterThan(40);
    expect(letterCells(48, 18).replace(/\./g, "").length).toBeGreaterThan(80);
    expect(letterCells(8, 6).replace(/\./g, "").length).toBeGreaterThan(0);
    expect(mosaicText("WAM 2027 · Batu")).toBe("WAM 2027 BATU");
    expect(mosaicText("@@@")).toBe("WAM 2026");
  });

  it("fill cells in a fixed seeded order: every cell once, the same every time", () => {
    const order = cellOrder(30, 20, "WAM 2026");
    expect(order).toHaveLength(600);
    expect(new Set(order).size).toBe(600);
    expect(cellOrder(30, 20, "WAM 2026")).toEqual(order);
    expect(cellOrder(30, 20, "WAM 2027")).not.toEqual(order);
    expect(hashSeed("a")).toBe(hashSeed("a"));
  });

  it("label, measure and lay out cells", () => {
    expect(cellLabel("W")).toBe("huruf W");
    expect(cellLabel("6")).toBe("angka 6");
    expect(cellLabel(".")).toBe("latar");
    expect(mosaicPercent(312, 600)).toBe(52);
    expect(mosaicPercent(599, 600)).toBe(99);
    expect(mosaicPercent(0, 0)).toBe(0);
    expect(cellBounds([31, 65, 2], 30)).toEqual({ left: 1, top: 0, right: 5, bottom: 2 });
    expect(cellBounds([], 30)).toBeNull();
    const geometry = gridGeometry({ width: 358, height: 202 }, 30, 20);
    expect(geometry.cell).toBeCloseTo((202 - 19) / 20);
    expect(geometry.left).toBeGreaterThan(0);
  });

  it("sample a half-full mosaic with four of mine on letters", () => {
    const mosaic = sampleMosaic();
    expect(mosaic.filled).toBe(936);
    expect(mosaic.mine).toBe(4);
    expect(mosaic.tiles.filter(tile => tile.mine).every(tile => mosaic.cells[tile.cell] !== ".")).toBe(true);
    expect(sampleMosaic(1).complete).toBe(true);
  });
});

describe("Momen stack and words", () => {
  it("swipe on past a quarter of the card or with a flick", () => {
    expect(swipeDecision(-100, 342, 0.1)).toBe("next");
    expect(swipeDecision(100, 342, 0.1)).toBe("prev");
    expect(swipeDecision(-40, 342, 0.1)).toBe("stay");
    expect(swipeDecision(-40, 342, 0.9)).toBe("next");
    expect(swipeDecision(-5, 342, 2)).toBe("stay");
  });

  it("write the time and the card line as the prototype", () => {
    expect(photoTime("2027-01-05T10:02:00+07:00", now)).toBe("10.02");
    expect(photoTime("2027-01-04T21:10:00+07:00", now)).toBe("Kemarin · 21.10");
    expect(photoTime("2027-01-03T21:10:00+07:00", now)).toMatch(/3 Jan · 21\.10$/);
    const dimas = sampleFeedSemua[2];
    // No kelompok on a card any more: the time only (the name pill carries the nama panggilan).
    expect(photoMeta(dimas, now)).toBe("10.02");
    expect(photoAlt(dimas, now)).toBe("Foto oleh Dimas, 10.02");
    expect(photoAlt({ ...dimas, mine: true }, now)).toBe("Fotomu, 10.02");
  });

  it("lay the cards behind at a tilt of 2 to 7 degrees either way, always the same for the same photo", () => {
    const ids = Array.from({ length: 400 }, (_, index) => `00000000-0000-4000-8b00-${String(index * 7919).padStart(12, "0")}`);
    const tilts = ids.map(pileTilt);
    for (const tilt of tilts) {
      expect(Math.abs(tilt.angle)).toBeGreaterThanOrEqual(TILT_MIN);
      expect(Math.abs(tilt.angle)).toBeLessThanOrEqual(TILT_MAX);
      // A little either way (the front card is centred, so the pile is balanced), and down.
      expect(tilt.x).toBeGreaterThanOrEqual(-5);
      expect(tilt.x).toBeLessThanOrEqual(5);
      expect(tilt.y).toBeGreaterThanOrEqual(8);
      expect(tilt.y).toBeLessThanOrEqual(13);
      // The more it leans the smaller it is, so the corners stay inside the screen.
      expect(tilt.scale).toBeCloseTo(1 - 0.016 * Math.abs(tilt.angle), 1);
      expect(tilt.scale).toBeLessThan(1);
    }
    expect(ids.map(pileTilt)).toEqual(tilts);
    expect(tilts.some(tilt => tilt.angle < 0)).toBe(true);
    expect(tilts.some(tilt => tilt.angle > 0)).toBe(true);
    // Different photos lie differently (many distinct angles and shifts).
    expect(new Set(tilts.map(tilt => tilt.angle)).size).toBeGreaterThan(100);
    expect(new Set(tilts.map(tilt => tilt.x)).size).toBeGreaterThan(20);
  });

  it("count the stack: new photos, one session, from the gallery", () => {
    expect(stackCount("baru", 2, 24)).toBe("3 dari 24 baru");
    expect(stackCount("sesi", 0, 24, "Pemaparan departemen")).toBe("Pemaparan departemen · 24 foto");
    expect(stackCount("galeri", 3, 21)).toBe("4 dari 21");
    expect(stackCountSpoken("baru", 2, 24)).toBe("Foto ke-3 dari 24 foto baru");
  });

  it("say where a photo went (U02–U04) and what waits (U03)", () => {
    expect(sentText(1)).toBe("Terkirim ke semua peserta");
    expect(sentText(3)).toBe("3 foto terkirim ke semua");
    expect(sentText(1, "en")).toBe("Sent to all participants");
    expect(flushedText(2)).toBe("2 foto terkirim");
    expect(flushedText(1)).toBe("Foto terkirim");
    expect(queuedPill(2, true)).toBe("Offline · 2 foto antre");
    expect(queuedPill(2, false)).toBe("2 foto antre");
    expect(newPhotosText(12, 40)).toBe("12 foto baru");
    expect(newPhotosText(0, 40)).toBe("Sudah kamu lihat semua");
    expect(newPhotosText(0, 0)).toBe("Belum ada foto");
  });
});
