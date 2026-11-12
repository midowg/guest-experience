import { describe, expect, it } from "vitest";
import { cut, dueDate, escapeHtml, longDate, minutesTelegramHtml, stamp, visibleLength, type MinutesMessage } from "./minutes-message";

const base: MinutesMessage = {
  title: "Appraisal team SS", departmentShort: "SM", department: "Sales & Marketing",
  date: "2026-11-10", from: "11.00", to: "12.30", place: "CFC Ananta Room",
  participants: ["Raja", "Sofyan", "Kayana"], notetaker: "Raja",
  summary: "Penilaian kinerja dibahas per orang.", decisions: "1. KPI Q4 memakai format baru.\n2. Evaluasi 15 Desember.",
  actions: [
    { task: "Kirim draf KPI", pic: "Sofyan", dueDate: "2026-11-14", done: false },
    { task: "Rekap nilai Q3", pic: "Kayana", dueDate: null, done: true },
  ],
  version: 1, at: "2026-11-10T06:05:00Z", link: "journey.werkudara.group/wam/sessions/x",
};

describe("dates", () => {
  it("writes the meeting day, a due date and the stamp in Indonesian, WIB", () => {
    expect(longDate("2026-11-10")).toBe("Selasa, 10 November 2026");
    expect(dueDate("2026-11-14")).toBe("Sab, 14 Nov");
    expect(stamp("2026-11-10T06:05:00Z")).toBe("10 Nov 2026, 13.05 WIB");
  });
});

describe("minutesTelegramHtml", () => {
  it("reads on its own: department in full, hours, room, people, notetaker, sections and the version line", () => {
    const { html, trimmed } = minutesTelegramHtml(base);
    expect(trimmed).toBe(false);
    expect(html).toContain("📝 <b>MoM · SM · Appraisal team SS</b>");
    expect(html).toContain("Sales &amp; Marketing · Selasa, 10 November 2026");
    expect(html).toContain("11.00–12.30 WIB · CFC Ananta Room");
    expect(html).toContain("Peserta (3): Raja, Sofyan, Kayana");
    expect(html).toContain("Notulis: Raja");
    expect(html).toContain("<b>Ringkasan</b>\nPenilaian kinerja dibahas per orang.");
    expect(html).toContain("☐ Kirim draf KPI — <b>Sofyan</b> · tenggat Sab, 14 Nov");
    expect(html).toContain("☑ Rekap nilai Q3 — <b>Kayana</b>");
    expect(html).toContain("<i>Versi 1 · dikirim 10 Nov 2026, 13.05 WIB lewat WAM</i>");
    expect(html).not.toMatch(/\bkamu\b/i);
    expect(html).not.toContain("UJI COBA");
  });

  it("escapes what people typed, so a < or & cannot break Telegram's HTML", () => {
    const { html } = minutesTelegramHtml({ ...base, title: "Q&A <draft>", summary: "a < b & c > d" });
    expect(html).toContain("MoM · SM · Q&amp;A &lt;draft&gt;");
    expect(html).toContain("a &lt; b &amp; c &gt; d");
    expect(escapeHtml("<b>")).toBe("&lt;b&gt;");
  });

  it("leaves out empty sections, the hours when there are none, and marks a sample and a later version", () => {
    const { html } = minutesTelegramHtml({ ...base, summary: " ", actions: [], from: null, to: null, trial: true, version: 3, changedBy: "Sofyan", at: "2026-11-11T02:10:00Z" });
    expect(html).not.toContain("Ringkasan");
    expect(html).not.toContain("Tindak lanjut");
    expect(html).toContain("\nCFC Ananta Room\n");
    expect(html).toContain("<i>UJI COBA dari WAM, bukan meeting sungguhan.</i>");
    expect(html).toContain("Versi 3 · diperbarui 11 Nov 2026, 09.10 WIB oleh Sofyan");
  });

  it("shows twelve names, then +N lainnya", () => {
    const people = Array.from({ length: 15 }, (_, index) => `Orang ${index + 1}`);
    const { html } = minutesTelegramHtml({ ...base, participants: people });
    expect(html).toContain("Peserta (15): Orang 1,");
    expect(html).toContain("Orang 12, +3 lainnya");
  });

  it("fits the longest MoM the form allows: text shortened, every follow-up that fits kept, the rest counted", () => {
    const long = "Kalimat yang cukup panjang untuk mengisi notulen meeting ini. ".repeat(70).slice(0, 4000);
    const actions = Array.from({ length: 30 }, (_, index) => ({ task: `${"Tugas ".repeat(48)}${index + 1}`.slice(0, 300), pic: "Peserta", dueDate: "2026-11-20", done: false }));
    const { html, trimmed } = minutesTelegramHtml({ ...base, summary: long, decisions: long, actions });
    expect(trimmed).toBe(true);
    expect(visibleLength(html)).toBeLessThanOrEqual(3900);
    expect(html).toMatch(/\+\d+ tindak lanjut lain di WAM/);
    expect(html).toContain("<i>Isi lengkapnya ada di WAM.</i>");
  });

  it("shortens only the summary and decisions when the follow-ups fit", () => {
    const long = "Kalimat yang cukup panjang untuk mengisi notulen meeting ini. ".repeat(70).slice(0, 4000);
    const { html, trimmed } = minutesTelegramHtml({ ...base, summary: long, decisions: long });
    expect(trimmed).toBe(true);
    expect(visibleLength(html)).toBeLessThanOrEqual(3900);
    expect(html).toContain("<b>Ringkasan</b>");
    expect(html).toContain("<b>Keputusan</b>");
    expect(html).toContain("☐ Kirim draf KPI");
    expect(html).toContain("…");
    expect(html).not.toContain("tindak lanjut lain");
  });
});

describe("cut", () => {
  it("ends at a sentence or a word, never mid-word", () => {
    expect(cut("Satu dua tiga. Empat lima enam tujuh.", 20)).toBe("Satu dua tiga.…");
    expect(cut("katapanjang sekali tanpa titik di sini", 22)).toBe("katapanjang sekali…");
    expect(cut("pendek", 20)).toBe("pendek");
  });
});
