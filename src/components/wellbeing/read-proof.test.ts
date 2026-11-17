import { describe, expect, it } from "vitest";
import { readProof, toNumber, type ProofContext } from "./read-proof";

const sports = [["running", "Running"], ["walking", "Walking"], ["cycling", "Cycling"], ["swimming", "Swimming"], ["workout", "Workout"], ["yoga", "Yoga"],
  ["badminton", "Badminton"], ["zumba", "Zumba"], ["aerobik", "Aerobik"], ["futsal", "Futsal"], ["hiking", "Hiking"], ["lainnya", "Lainnya"]]
  .map(([code, name]) => ({ code: `sport.${code}`, name }));
const daily = [
  { code: "physical.steps", name: "Langkah harian", mode: "steps" as const },
  { code: "emotional.podcast", name: "Mendengarkan Podcast", mode: "fixed" as const },
  { code: "emotional.lainnya", name: "Lainnya (emosional)", mode: "fixed" as const },
  { code: "financial.tabungan_emas", name: "Membuka Tabungan Emas", mode: "fixed" as const },
];
const context: ProofContext = { today: "2026-11-18", backdateDays: 7, sports, daily };

describe("toNumber", () => {
  it("reads thousands and decimals in both ways of writing", () => {
    expect(toNumber("9.128")).toBe(9128);
    expect(toNumber("9,128")).toBe(9128);
    expect(toNumber("12.480.000")).toBe(12480000);
    expect(toNumber("5,2")).toBe(5.2);
    expect(toNumber("412.6")).toBe(412.6);
    expect(toNumber("1.234,5")).toBe(1234.5);
    expect(toNumber("1,234.5")).toBe(1234.5);
  });
});

describe("readProof", () => {
  it("reads a daily steps screen and leaves out the goal (Samsung Health)", () => {
    const text = "09:41\nHari ini\nLangkah\n9.128 / 10.000 langkah\n6,12 km  312 kkal\nAktivitas lainnya";
    expect(readProof(text, context)).toEqual({ kind: "daily", code: "physical.steps", date: "2026-11-18", time: null, steps: 9128, kcal: 312, minutes: null, title: null });
  });

  it("reads a run with glued units and a pace that is not a duration (Strava, English)", () => {
    const text = "Morning Run\nNov 17, 2026 at 6:05 AM\nDistance\n5.20km\nPace\n5:23 /km\nMoving Time\n28:01\nCalories\n412Cal\nElevation 18m";
    expect(readProof(text, context)).toEqual({ kind: "sport", code: "sport.running", date: "2026-11-17", time: "06:05", steps: null, kcal: 412, minutes: 28, title: "Morning Run" });
  });

  it("prefers active calories over the total, and reads h:mm:ss (Apple Watch)", () => {
    const text = "Outdoor Cycle\nSelasa, 17 Nov\nWorkout Time\n1:02:45\nDistance\n24,6KM\nActive Kilocalories\n518KCAL\nTotal Kilocalories\n604KCAL";
    expect(readProof(text, context)).toMatchObject({ kind: "sport", code: "sport.cycling", date: "2026-11-17", kcal: 518, minutes: 63 });
  });

  it("reads Indonesian labels and hours with minutes (Garmin, Mi Fitness)", () => {
    const text = "Renang kolam\n16/11/2026 07.10\nDurasi 1 j 5 mnt\nKalori 455 kkal\nJarak 1.200 m";
    expect(readProof(text, context)).toMatchObject({ kind: "sport", code: "sport.swimming", date: "2026-11-16", kcal: 455, minutes: 65 });
  });

  it("takes a walk with steps and no kcal as daily steps", () => {
    const text = "Afternoon Walk\nKemarin\n7,412 steps\n58 min";
    expect(readProof(text, context)).toMatchObject({ kind: "daily", code: "physical.steps", date: "2026-11-17", steps: 7412, minutes: 58 });
  });

  it("names the sport by the catalog's own name first", () => {
    expect(readProof("Kelas Aerobik pagi\n320 kcal", context)).toMatchObject({ kind: "sport", code: "sport.aerobik", kcal: 320 });
    expect(readProof("Zumba party\n320 kcal", context)).toMatchObject({ kind: "sport", code: "sport.zumba" });
    // "Lainnya" is a word on many Indonesian screens: never a match by itself.
    expect(readProof("Lihat lainnya\n210 kkal", context)).toMatchObject({ kind: "sport", code: null, kcal: 210 });
  });

  it("finds a daily type by most of its own words", () => {
    expect(readProof("Spotify\nPodcast · Episode 12\n45 menit", context)).toMatchObject({ kind: "daily", code: "emotional.podcast" });
    expect(readProof("Tabungan Emas\nSaldo 0,5 gram", context)).toMatchObject({ kind: "daily", code: "financial.tabungan_emas" });
    expect(readProof("Lainnya", context)).toMatchObject({ kind: null, code: null });
  });

  it("keeps only dates in the backdate window, and never a clock time as a duration", () => {
    expect(readProof("Running 3 Okt 2026\n300 kcal", context).date).toBeNull();
    expect(readProof("Running 17 Nov\n300 kcal", context).date).toBe("2026-11-17");
    expect(readProof("12:30\nRunning\n300 kcal", context).minutes).toBeNull();
    // Early January: a December date without a year is last year's.
    expect(readProof("Running 30 Des\n300 kcal", { ...context, today: "2027-01-02" }).date).toBe("2026-12-30");
  });

  it("reads Tesseract's real output: empty lines between pieces, and ')' for 'j' (18 Nov 2026)", () => {
    // Taken from the app's reader on drawn screenshots.
    expect(readProof("09:41\n\nLangkah\n\nHari ini\n\n9.128\n\n/ 10.000 langkah\n\n6,12 km\n\n312 kkal\n", context))
      .toMatchObject({ kind: "daily", code: "physical.steps", steps: 9128, date: "2026-11-18" });
    expect(readProof("Renang kolam\n\nKemarin\n\nDurasi\n\n1) 5 mnt\n\nKalori\n\n455 kkal\n", context))
      .toMatchObject({ kind: "sport", code: "sport.swimming", date: "2026-11-17", kcal: 455, minutes: 65 });
  });

  it("reads the time of day only where the screen says so, and the activity's own name (17 Nov 2026)", () => {
    expect(readProof("Morning Run\nNov 17, 2026 at 6:05 AM\nCalories\n412 Cal", context)).toMatchObject({ time: "06:05", title: "Morning Run" });
    expect(readProof("Renang kolam\n16/11/2026 07.10\nKalori 455 kkal", context)).toMatchObject({ time: "07:10", title: "Renang kolam" });
    expect(readProof("Badminton sore\npukul 16.30 WIB\n520 kkal", context)).toMatchObject({ time: "16:30", title: "Badminton sore" });
    expect(readProof("Yoga\n7:15 pm\n180 kcal", context)).toMatchObject({ time: "19:15", title: null });
    // The phone's clock, a duration and a pace are not the time of day.
    expect(readProof("09:41\nRunning\nTime 28:01\nPace 5:23 /km\n300 kcal", context).time).toBeNull();
    expect(readProof("Running\nDurasi 1:02:45\n300 kcal", context).time).toBeNull();
  });

  it("gives nothing for a photo without data", () => {
    expect(readProof("", context)).toEqual({ kind: null, code: null, date: null, time: null, steps: null, kcal: null, minutes: null, title: null });
    expect(readProof("Foto bersama tim di taman", context)).toMatchObject({ kind: null });
  });
});
