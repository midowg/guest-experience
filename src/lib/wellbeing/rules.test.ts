import { describe, expect, it } from "vitest";
import { appControlsOf, appControlsSchema, claimedPoints, controlsForApp, countedPoints, dateProblem, defaultAppControls, defaultSettings, isVideoProof, limitReached, monthRange, pointBatchSchema, previousMonth, rank, reviewSchema, wibToday } from "./rules";

describe("video proofs (18 Nov 2026)", () => {
  it("knows a video by its name, also in a signed address", () => {
    expect(isVideoProof("https://x.r2.cloudflarestorage.com/b/wellbeing/a/b.mp4?X-Amz-Signature=1")).toBe(true);
    expect(isVideoProof("https://old.supabase.co/storage/v1/object/public/quest-proofs/a/1-1.MOV")).toBe(true);
    expect(isVideoProof("https://x/wellbeing/a/b.jpg?X-Amz-Signature=mp4")).toBe(false);
    expect(isVideoProof("wellbeing/a/b.png")).toBe(false);
  });
});

describe("claimedPoints", () => {
  it("uses the fixed points, steps / 10, or kcal within the caps", () => {
    expect(claimedPoints("fixed", 150, {}, defaultSettings)).toBe(150);
    expect(claimedPoints("steps", 0, { steps: 9128 }, defaultSettings)).toBe(912);
    expect(claimedPoints("steps", 0, { steps: 999999 }, defaultSettings)).toBe(6000);
    expect(claimedPoints("kcal", 0, { kcal: 412.6 }, defaultSettings)).toBe(413);
    expect(claimedPoints("kcal", 0, { kcal: 9000 }, defaultSettings)).toBe(3000);
    expect(claimedPoints("kcal", 0, { kcal: -5 }, defaultSettings)).toBe(0);
  });
});

describe("dates", () => {
  it("refuses future dates and dates past the backdate window, in WIB", () => {
    expect(dateProblem("2026-11-16", "2026-11-16", 7)).toBeNull();
    expect(dateProblem("2026-11-09", "2026-11-16", 7)).toBeNull();
    expect(dateProblem("2026-11-08", "2026-11-16", 7)).toMatch(/7 hari/);
    expect(dateProblem("2026-11-23", "2026-11-16", 7)).toMatch(/setelah hari ini/);
    expect(dateProblem("2026-13-01", "2026-11-16", 7)).toMatch(/tidak valid/);
    expect(dateProblem("2026-11-15", "2026-11-16", 0)).toMatch(/hari ini/);
    // 17 Nov 2026: a date that does not exist is refused, not passed on to the database.
    expect(dateProblem("2026-02-30", "2026-03-03", 7)).toMatch(/tidak valid/);
  });
  it("counts the WIB day, not UTC", () => {
    expect(wibToday(new Date("2026-11-15T18:30:00Z"))).toBe("2026-11-16");
  });
  it("gives month ranges", () => {
    expect(monthRange("2026-02-14")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(previousMonth("2026-01-10")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
});

describe("limits", () => {
  it("allows once per day or month", () => {
    expect(limitReached(null, "2026-11-16", ["2026-11-16"])).toBe(false);
    expect(limitReached("day", "2026-11-16", ["2026-11-15"])).toBe(false);
    expect(limitReached("day", "2026-11-16", ["2026-11-16"])).toBe(true);
    expect(limitReached("month", "2026-11-30", ["2026-11-02"])).toBe(true);
    expect(limitReached("month", "2026-12-01", ["2026-11-30"])).toBe(false);
  });
});

describe("review", () => {
  it("needs a reason to reject or change points", () => {
    expect(reviewSchema.safeParse({ status: "approved", points: 80, reason: null, checked: true }).success).toBe(true);
    expect(reviewSchema.safeParse({ status: "rejected", points: 80, reason: "", checked: true }).success).toBe(false);
    expect(reviewSchema.safeParse({ status: "adjusted", points: 300, reason: "Durasi 60 menit.", checked: true }).success).toBe(true);
    expect(countedPoints("rejected", 300)).toBe(0);
    expect(countedPoints("adjusted", 300)).toBe(300);
  });
});

describe("point batches", () => {
  const id = "0b9f3f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
  it("needs people, non-zero points and a reason", () => {
    expect(pointBatchSchema.safeParse({ employeeIds: [id], points: 100, reason: "Kehadiran internal activities", date: "2026-11-16" }).success).toBe(true);
    expect(pointBatchSchema.safeParse({ employeeIds: [], points: 100, reason: "Acara", date: "2026-11-16" }).success).toBe(false);
    expect(pointBatchSchema.safeParse({ employeeIds: [id], points: 0, reason: "Acara", date: "2026-11-16" }).success).toBe(false);
    expect(pointBatchSchema.safeParse({ employeeIds: [id], points: -50, reason: "Double input dengan Strava", date: "2026-11-16" }).success).toBe(true);
  });
});

describe("rank", () => {
  it("shares a place on ties", () => {
    expect(rank([{ points: 5 }, { points: 9 }, { points: 9 }, { points: 1 }]).map(row => row.rank)).toEqual([1, 1, 3, 4]);
  });
});

describe("app controls (17 Nov 2026)", () => {
  it("fills in defaults for anything missing or broken in the stored value", () => {
    expect(appControlsOf(null)).toEqual(defaultAppControls);
    expect(appControlsOf({ prize: "Voucher", photoReading: "ya", logging: { paused: true } })).toEqual({ ...defaultAppControls, prize: "Voucher" });
  });
  it("shows the announcement only while on and not past its day, and pauses Catat with a message", () => {
    const controls = { ...defaultAppControls, announcement: { on: true, title: "Ditutup 30 Nov", message: "", until: "2026-11-30" }, prize: "  ", logging: { paused: true, message: "" } };
    expect(controlsForApp(controls, "2026-11-30")).toEqual({ announcement: { title: "Ditutup 30 Nov", message: "" }, prize: null, photoReading: true, pausedMessage: "Pencatatan sedang dijeda admin. Coba lagi nanti." });
    expect(controlsForApp(controls, "2026-12-01").announcement).toBeNull();
    expect(controlsForApp({ ...controls, announcement: { ...controls.announcement, on: false } }, "2026-11-17").announcement).toBeNull();
  });
  it("refuses an announcement turned on with nothing to say", () => {
    expect(appControlsSchema.safeParse({ ...defaultAppControls, announcement: { on: true, title: " ", message: "", until: null } }).success).toBe(false);
    expect(appControlsSchema.safeParse({ ...defaultAppControls, announcement: { on: true, title: "Halo", message: "", until: null } }).success).toBe(true);
  });
});
