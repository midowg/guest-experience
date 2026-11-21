import { describe, expect, it } from "vitest";
import { copies } from "./copy";
import { asLang, clockAt, hhmm } from "./lang";
import { englishOf } from "./server-words";
import { byWeek, durationLabel } from "./history";
import { spanLabel } from "./leave";
import { distanceLabel } from "./geo";

/** The shape of a dictionary: every key, and whether each is words, a list (with its length) or a function. */
function shape(value: unknown): unknown {
  if (typeof value === "function") return "function";
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shape(inner)]));
  return typeof value;
}

describe("WG People's words", () => {
  it("has the same things to say in English and Indonesian", () => {
    expect(shape(copies.id)).toEqual(shape(copies.en));
  });

  it("is English unless Indonesian is picked", () => {
    expect(asLang(undefined)).toBe("en");
    expect(asLang("fr")).toBe("en");
    expect(asLang("id")).toBe("id");
  });

  it("writes times, durations, distances and dates the local way", () => {
    expect(clockAt("en", "2026-11-20T01:52:00Z", "WIB")).toBe("08:52");
    expect(clockAt("id", "2026-11-20T01:52:00Z", "WIB")).toBe("08.52");
    expect(hhmm("en", "08.30")).toBe("08:30");
    expect(durationLabel(519, "en")).toBe("8h 39m");
    expect(durationLabel(519)).toBe("8 j 39 m");
    expect(distanceLabel(2300, "en")).toBe("2.3 km");
    expect(distanceLabel(2300)).toBe("2,3 km");
    expect(spanLabel("2026-11-30", "2026-12-02", "en")).toBe("30 Nov – 2 Dec");
    expect(byWeek(["2026-11-20", "2026-11-12"], "2026-11-20", "en").map(week => week.label)).toEqual(["This week", "Last week"]);
  });

  it("sums up a correction in each language", () => {
    const request = { type: "tambah" as const, kind: "masuk" as const, proposedTime: "08:30:00", reasonKind: null, reasonText: null };
    expect(copies.en.requestSummary(request)).toBe("In 08:30 (forgot to clock)");
    expect(copies.id.requestSummary(request)).toBe("Masuk 08.30 (lupa absen)");
  });
});

describe("the server's answers in English", () => {
  it("puts known answers into English and leaves unknown ones as they came", () => {
    expect(englishOf("Revisi terkirim. Admin HR akan memeriksanya.")).toBe("Correction sent. HR will review it.");
    expect(englishOf("Absen pulang tercatat.")).toBe("Clock-out recorded.");
    expect(englishOf("Wajah belum cocok dengan foto acuan (kecocokan 61%, perlu sekitar 76%). Cari tempat terang, lihat lurus ke kamera, lalu coba lagi."))
      .toBe("Your face doesn't match the reference photo yet (61% match, about 76% needed). Find a bright spot, look straight at the camera, then try again.");
    expect(englishOf("Sesuatu yang baru.")).toBe("Sesuatu yang baru.");
    expect(copies.id.server("Absen pulang tercatat.")).toBe("Absen pulang tercatat.");
  });
});
