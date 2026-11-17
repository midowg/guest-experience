import { describe, expect, it } from "vitest";
import { noteTone } from "./notify";

/* A note's tone: Beranda's pinned banner and N01 (P02__status: "Jam kumpul berubah" is a warning). */

describe("noteTone", () => {
  it("a schedule change is a warning: kind jadwal, or an announcement whose title says something changed", () => {
    expect(noteTone({ kind: "jadwal", title: "Jadwal berubah" })).toBe("warning");
    for (const title of ["Jam kumpul berubah", "Makan siang dimundurkan", "Sesi sore dibatalkan", "Team building pindah ke Aula", "Gala dinner ditunda 30 menit", "Perubahan bus pulang"]) {
      expect(noteTone({ kind: "pengumuman", title })).toBe("warning");
    }
  });

  it("other news is info", () => {
    expect(noteTone({ kind: "pengumuman", title: "Team building mulai 15.00 di Lawn" })).toBe("info");
    expect(noteTone({ kind: "pengumuman", title: "Pindahan" })).toBe("info");
    expect(noteTone({ kind: "momen", title: "Ubah foto profil" })).toBe("info");
    // Only an announcement's title counts, not other kinds that happen to say it.
    expect(noteTone({ kind: "kamar", title: "Kamarmu berubah" })).toBe("info");
  });

  it("the tone panitia chose wins over the rule", () => {
    expect(noteTone({ kind: "pengumuman", title: "Bawa jaket", tone: "warning" })).toBe("warning");
    expect(noteTone({ kind: "pengumuman", title: "Jam kumpul berubah", tone: "info" })).toBe("info");
    expect(noteTone({ kind: "pengumuman", title: "Bawa jaket", tone: "rusak" })).toBe("info");
  });
});
