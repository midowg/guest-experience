import { describe, expect, it } from "vitest";
import { createSeedEvent } from "./seed-event";
import { invitationLink, invitationMessage, whatsappUrl } from "./invitation-messages";

const link = invitationLink("https://invitation.werkudara.group", { id: "e1", slug: "rapat panitia" }, { token: "a".repeat(64) });

describe("invitation messages", () => {
  it("builds the personal link", () => {
    expect(link).toBe(`https://invitation.werkudara.group/e/rapat%20panitia/i/${"a".repeat(64)}`);
  });
  it("writes the invitation with name, event, local time, and link", () => {
    const text = invitationMessage("invite", createSeedEvent(), { name: "Bu Sari" }, link);
    expect(text).toBe(`Halo Bu Sari, dengan senang hati kami mengundang Anda ke Rapat Panitia Inti dan Koordinator pada Senin, 12 Oktober 2026, 18.00 WIB. Undangan dan konfirmasi kehadiran ada di tautan pribadi ini: ${link}`);
  });
  it("mentions the RSVP deadline in a reminder when there is one", () => {
    const event = { ...createSeedEvent(), rsvp_closes_at: "2026-10-10T17:00:00+07:00" };
    expect(invitationMessage("reminder", event, { name: "Sari" }, link)).toContain("sebelum Sabtu, 10 Oktober 2026, 17.00 WIB");
    expect(invitationMessage("reminder", createSeedEvent(), { name: "Sari" }, link)).toContain("pada Senin, 12 Oktober 2026");
  });
  it("writes in English for an English-only event, using the English title", () => {
    const event = createSeedEvent();
    event.language = "en";
    event.translations.en.title = "Core Committee Meeting";
    expect(invitationMessage("invite", event, { name: "Ms Sari" }, link)).toMatch(/^Hello Ms Sari, we are delighted to invite you to Core Committee Meeting on Monday, 12 October 2026, 18:00 WIB\./);
  });
  it("opens WhatsApp with the number when known, or lets the admin pick a chat", () => {
    expect(whatsappUrl("6281234567890", "Halo & selamat")).toBe("https://wa.me/6281234567890?text=Halo%20%26%20selamat");
    expect(whatsappUrl(null, "Halo")).toBe("https://wa.me/?text=Halo");
  });
});
