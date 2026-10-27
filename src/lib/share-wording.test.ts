import { describe, expect, it } from "vitest";
import { createSeedEvent } from "./seed-event";
import { shareWording } from "./share-wording";

const event = (overrides: Partial<ReturnType<typeof createSeedEvent>>) => ({ ...createSeedEvent(), ...overrides });

describe("share wording", () => {
  it("words an invitation with its date and place", () => {
    const wording = shareWording(event({ event_kind: "kunjungan", starts_at: "2026-10-30T02:00:00.000Z", timezone: "Asia/Jakarta", venue_name: "Kantor Werkudara", language: "id" }));
    expect(wording.label).toBe("Undangan kunjungan");
    expect(wording.description).toBe("Undangan kunjungan · Jumat, 30 Oktober 2026 · Kantor Werkudara");
  });

  it("asks to give on a Friday Sharing page, without a date or the word invitation", () => {
    const wording = shareWording(event({ event_kind: "csr", subtitle: "Berbagi pakaian untuk tiga panti", organizer: "Werkudara", starts_at: "2026-10-30T02:00:00.000Z" }));
    expect(wording.label).toBe("Friday Sharing");
    expect(wording.description).toBe("Berbagi pakaian untuk tiga panti. Yuk, ikut berbagi bersama Werkudara: donasi dana atau barang, dan lihat yang sudah terkumpul.");
    expect(wording.description).not.toMatch(/Undangan|Oktober/);
  });

  it("says what a card and an E-Guide are for, in English when the event is", () => {
    expect(shareWording(event({ event_kind: "kartu", subtitle: "" })).description).toBe("Isi data Anda, lalu unduh dan bagikan kartunya.");
    expect(shareWording(event({ event_kind: "eguide", subtitle: "Mengenal Lombok", language: "en" }))).toMatchObject({ label: "E-Guide", description: "Mengenal Lombok. A digital guide: places, culture, schedule and what to prepare." });
  });
});
