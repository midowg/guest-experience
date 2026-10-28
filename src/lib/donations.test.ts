import { describe, expect, it } from "vitest";
import { HAMBA_ALLAH, addGiftText, donorLabel, giftsText, splitByRecipient, listNames, defaultDonationItems, describeDonation, donationReport, donationTotals, emptyDonation, formatRupiah, normalizeDonation, notifyMessage, parseRupiah, publicDonors, startingDonation, type DonationRecord } from "./donations";
import { donationInputSchema, eventSchema } from "./validation";
import { createSeedEvent } from "./seed-event";
import { buildEventFromSetup } from "./event-setup";
import { normalizeEvent } from "./hero-framing";

let n = 0;
function donation(overrides: Partial<DonationRecord> = {}): DonationRecord {
  n++;
  return {
    id: `d${n}`, event_id: "e1", item_key: "dana", item_label: "Dana", category: "fund", amount: 100000, unit: "Rp",
    donor_name: "Sari Dewi", display: "name", donor_phone: "081234567890", message: "Semoga bermanfaat",
    proof_key: "", status: "received", received_amount: null, reject_reason: "", verified_at: `2026-10-2${n % 9}T03:00:00.000Z`, notified_at: null, recipient_id: "",
    created_at: "2026-10-20T03:00:00.000Z", ...overrides,
  };
}
const settings = () => ({ ...startingDonation(), items: defaultDonationItems().map(item => item.key === "dana" ? { ...item, target: 10_000_000 } : item.key === "sembako" ? { ...item, target: 100 } : item) });

describe("rupiah", () => {
  it("writes and reads amounts the Indonesian way", () => {
    expect(formatRupiah(12500000)).toBe("Rp 12.500.000");
    expect(parseRupiah("Rp 100.000")).toBe(100000);
    expect(parseRupiah("abc")).toBe(0);
  });
  it("describes money and goods", () => {
    expect(describeDonation(donation())).toBe("Dana Rp 100.000");
    expect(describeDonation(donation({ item_label: "Sembako", category: "goods", amount: 2, unit: "paket" }))).toBe("Sembako 2 paket");
    expect(describeDonation(donation({ item_label: "Tenaga relawan", category: "other", amount: 0, unit: "" }))).toBe("Tenaga relawan");
  });
});

describe("totals", () => {
  it("counts only what the committee received, using the amount it recorded", () => {
    const totals = donationTotals(settings(), [
      donation(), donation({ received_amount: 250000 }), donation({ status: "pending", amount: 5_000_000 }), donation({ status: "rejected", amount: 9_000_000 }),
      donation({ item_key: "sembako", item_label: "Sembako", category: "goods", amount: 3, unit: "paket" }),
      donation({ item_key: "", item_label: "Kursi roda", category: "other", amount: 1, unit: "" }),
    ]);
    expect(totals.fund).toEqual({ total: 350000, target: 10_000_000 });
    expect(totals.goods).toEqual([{ key: "sembako", label: "Sembako", unit: "paket", total: 3, target: 100 }]);
    expect(totals.other).toBe(1);
    expect(totals.donors).toBe(4);
    expect(totals.pending).toBe(1);
  });

  it("counts goods given under a chip removed since as other help, never losing them", () => {
    const totals = donationTotals(settings(), [donation({ item_key: "kasur", item_label: "Kasur", category: "goods", amount: 2, unit: "buah" })]);
    expect(totals.other).toBe(1);
  });

  it("shows only the parts the admin switched on", () => {
    const hidden = { ...settings(), show: { ...settings().show, fundTotal: false, goods: false } };
    const totals = donationTotals(hidden, [donation(), donation({ item_key: "sembako", item_label: "Sembako", category: "goods", amount: 3, unit: "paket" })]);
    expect(totals.fund).toBeNull();
    expect(totals.goods).toEqual([]);
    expect(totals.donors).toBe(2);
    expect(donationTotals({ ...settings(), show: { ...settings().show, fundTarget: false } }, [donation()]).fund?.target).toBeNull();
  });
});

describe("public donor list", () => {
  it("follows each donor's choice and never carries a phone number", () => {
    const list = publicDonors(settings(), [donation({ donor_name: "Raka" }), donation({ donor_name: "Budi Santoso", display: "hamba_allah" }), donation({ donor_name: "Rahasia", display: "hidden" }), donation({ status: "pending" })]);
    expect(list.map(item => item.name)).toEqual(expect.arrayContaining(["Raka", HAMBA_ALLAH]));
    expect(list).toHaveLength(2);
    expect(JSON.stringify(list)).not.toContain("Budi");
    expect(JSON.stringify(list)).not.toContain("Rahasia");
    expect(JSON.stringify(list)).not.toContain("0812");
  });

  it("hides amounts of money and messages unless the admin shows them", () => {
    const [plain] = publicDonors(settings(), [donation()]);
    expect(plain.gift).toBe("Dana");
    expect(plain.message).toBe("Semoga bermanfaat");
    const [shown] = publicDonors({ ...settings(), show: { ...settings().show, donorAmounts: true, messages: false } }, [donation()]);
    expect(shown.gift).toBe("Dana Rp 100.000");
    expect(shown.message).toBe("");
    expect(publicDonors({ ...settings(), show: { ...settings().show, donors: false } }, [donation()])).toEqual([]);
  });
});

describe("handover message", () => {
  it("fills the template with this donor's gift, the date and the prayer, by name only when they showed it", () => {
    const withRecipients = { ...settings(), recipients: ["Panti Asuhan Kasih Ibu", "Sekolah Harapan"].map((name, index) => ({ id: `p${index}`, name, description: "", place: "", photo: { url: "", alt: "", srcset: [] } })) };
    const text = notifyMessage(withRecipients, donation({ donor_name: "Budi", display: "hamba_allah", received_amount: 150000 }), { title: "Berbagi Bersama Anak Panti" }, "https://journey.werkudara.group/AB23CD", "12 Desember 2026");
    expect(text).toContain("Halo Bapak/Ibu");
    expect(text).not.toContain("Budi");
    expect(notifyMessage(withRecipients, donation({ donor_name: "Sari Dewi", display: "name" }), { title: "Berbagi" }, "https://journey.werkudara.group/friday-sharing", "12 Desember 2026")).toContain("Halo Sari Dewi");
    expect(text).toContain("Berbagi Bersama Anak Panti: Dana Rp 150.000");
    expect(text).toContain("12 Desember 2026");
    expect(text).toContain("kepada Panti Asuhan Kasih Ibu dan Sekolah Harapan");
    expect(text).toContain("https://journey.werkudara.group/AB23CD");
    expect(text).toContain(settings().notify.prayer);
    expect(text).not.toContain("{");
  });
});

describe("form and event", () => {
  const base = { item_key: "dana", item_label: "Dana", category: "fund" as const, amount: 50000, unit: "Rp", donor_name: "Sari", display: "name" as const, donor_phone: "", message: "", website: "", idempotency_key: "10f3a511-2331-4000-8000-0000000000aa" };
  it("asks money for an amount and goods for a count", () => {
    expect(donationInputSchema.safeParse(base).success).toBe(true);
    expect(donationInputSchema.safeParse({ ...base, amount: 500 }).success).toBe(false);
    expect(donationInputSchema.safeParse({ ...base, category: "goods", item_label: "Sembako", amount: 0 }).success).toBe(false);
    expect(donationInputSchema.safeParse({ ...base, category: "other", item_label: "Tenaga relawan", amount: 0 }).success).toBe(true);
    expect(donationInputSchema.safeParse({ ...base, website: "spam" }).success).toBe(false);
    expect(donationInputSchema.safeParse({ ...base, donor_phone: "12" }).success).toBe(false);
  });

  it("starts a CSR event from its template with donations open and the usual chips", () => {
    const event = buildEventFromSetup({
      template: "csr-kegiatan-sosial", title: "Berbagi Bersama Anak Panti", starts_at: "2026-12-12T02:00:00.000Z", ends_at: null, timezone: "Asia/Jakarta",
      audience: "external", language: "id", invitation_mode: "open", modules: ["about", "contact"], location: "later", venue_name: "", address: "", location_url: "",
      greeting: "", introduction: "", closing: "", rsvp_closes_at: null, guest_estimate: null, contact_name: "", contact_phone: "",
    } as Parameters<typeof buildEventFromSetup>[0], { id: "10f3a511-2331-4000-8000-0000000000ab", uuid: () => "10f3a511-2331-4000-8000-0000000000ac", now: "2026-10-27T00:00:00.000Z" });
    expect(event.event_kind).toBe("csr");
    expect(event.donation.enabled).toBe(true);
    expect(event.donation.items.map(item => item.key)).toContain("sembako");
  });

  it("publishes a CSR page without a place, but not money without a way to pay", () => {
    const event = { ...createSeedEvent(), event_kind: "csr" as const, status: "published" as const, organizer: "Werkudara", introduction: "Untuk anak panti.", venue_name: "", address: "", location_url: "", location_embed_url: "", location_display: "manual" as const, donation: startingDonation() };
    const missing = eventSchema.safeParse(event);
    expect(missing.success).toBe(false);
    expect(missing.error?.issues.map(issue => issue.path.join("."))).toEqual(["donation.accounts"]);
    const paid = { ...event, donation: { ...event.donation, accounts: [{ id: "a1", bank: "BCA", number: "123 456 7890", holder: "Yayasan Werkudara" }] } };
    expect(eventSchema.safeParse(paid).success).toBe(true);
  });

  it("gives events saved before donations a switched-off donation", () => {
    const old = { ...createSeedEvent(), donation: undefined } as unknown as Parameters<typeof normalizeEvent>[0];
    expect(normalizeEvent(old).donation).toEqual(emptyDonation());
    expect(normalizeDonation({ enabled: true }).show).toEqual(emptyDonation().show);
  });
});

describe("several gifts and recipients", () => {
  it("adds examples to the free-text gift once each", () => {
    expect(addGiftText("", "Selimut")).toBe("Selimut");
    expect(addGiftText("Beras 5 kg, ", "Selimut")).toBe("Beras 5 kg, Selimut");
    expect(addGiftText("Selimut", "selimut")).toBe("Selimut");
  });
  it("lists names the Indonesian way", () => {
    expect(listNames(["A"])).toBe("A");
    expect(listNames(["A", "B"])).toBe("A dan B");
    expect(listNames(["A", "B", "C"])).toBe("A, B, dan C");
  });
});

describe("handover report", () => {
  it("adds up received gifts only, whatever the public page shows, and names donors as they chose", () => {
    const shown = { ...settings(), show: { ...settings().show, fundTotal: false, goods: false, donors: false } };
    const report = donationReport(shown, [
      donation({ amount: 250000, received_amount: 200000 }),
      donation({ item_key: "sembako", item_label: "Sembako", category: "goods", amount: 3, unit: "paket", display: "hamba_allah" }),
      donation({ item_key: "sembako", item_label: "Sembako", category: "goods", amount: 2, unit: "paket", display: "hidden", donor_name: "Rahasia" }),
      donation({ item_key: "", item_label: "Kursi roda", category: "other", amount: 0, unit: "" }),
      donation({ amount: 9_000_000, status: "pending" }),
      donation({ amount: 5_000_000, status: "rejected" }),
    ]);
    expect(report.fund).toBe(200000);
    expect(report.goods).toEqual([{ key: "sembako", label: "Sembako", unit: "paket", total: 5 }]);
    expect(report.other).toEqual(["Kursi roda"]);
    expect(report.count).toBe(4);
    expect(report.donors.map(row => row.name)).toEqual(["Sari Dewi", HAMBA_ALLAH, "Tanpa nama", "Sari Dewi"]);
    expect(report.donors[0]).toMatchObject({ gift: "Dana", amount: "Rp 200.000" });
    expect(JSON.stringify(report)).not.toContain("Rahasia");
    expect(JSON.stringify(report)).not.toContain("0812");
  });
});

describe("donor names", () => {
  it("shows a donor's name only when they chose to show it, admin included", () => {
    expect(donorLabel({ donor_name: "Sari Dewi", display: "name" })).toBe("Sari Dewi");
    expect(donorLabel({ donor_name: "Budi", display: "hamba_allah" })).toBe(HAMBA_ALLAH);
    expect(donorLabel({ donor_name: "Rahasia", display: "hidden" })).toBe("Tanpa nama");
  });
  it("asks for a name only when it will be shown", () => {
    const base = { item_key: "dana", item_label: "Dana", category: "fund" as const, amount: 100000, unit: "Rp", donor_phone: "", message: "", website: "", idempotency_key: crypto.randomUUID() };
    expect(donationInputSchema.safeParse({ ...base, donor_name: "", display: "hidden" }).success).toBe(true);
    expect(donationInputSchema.safeParse({ ...base, donor_name: "", display: "hamba_allah" }).success).toBe(true);
    expect(donationInputSchema.safeParse({ ...base, donor_name: "", display: "name" }).success).toBe(false);
  });
});

describe("sharing out to recipients", () => {
  it("adds up what each recipient was given, and what is not shared out yet", () => {
    const shared = { ...settings(), recipients: ["Panti A", "Panti B"].map((name, index) => ({ id: `p${index}`, name, description: "", place: "", photo: { url: "", alt: "", srcset: [] } })) };
    const split = splitByRecipient(shared, [
      donation({ amount: 200000, recipient_id: "p0" }),
      donation({ item_key: "sembako", item_label: "Sembako", category: "goods", amount: 3, unit: "paket", recipient_id: "p1" }),
      donation({ item_key: "sembako", item_label: "Sembako", category: "goods", amount: 2, unit: "paket", recipient_id: "p1" }),
      donation({ item_key: "", item_label: "Kursi roda", category: "other", amount: 0, unit: "", recipient_id: "gone" }),
      donation({ amount: 50000, recipient_id: "" }),
      donation({ amount: 9_000_000, status: "pending", recipient_id: "p0" }),
    ]);
    expect(split.anyAssigned).toBe(true);
    expect(split.byRecipient.p0).toEqual({ fund: 200000, goods: [], other: [], count: 1 });
    expect(split.byRecipient.p1).toEqual({ fund: 0, goods: [{ label: "Sembako", unit: "paket", total: 5 }], other: [], count: 2 });
    expect(split.unassigned).toEqual({ fund: 50000, goods: [], other: ["Kursi roda"], count: 2 });
    expect(giftsText(split.byRecipient.p1)).toBe("Sembako 5 paket");
  });
});

describe("public donor list order", () => {
  it("puts the largest gifts first, money before goods, the newest first among equals", () => {
    const shown = { ...settings(), show: { ...settings().show, donorAmounts: true } };
    const names = publicDonors(shown, [
      donation({ donor_name: "Kecil", amount: 50000, verified_at: "2026-10-27T03:00:00.000Z" }),
      donation({ donor_name: "Barang", item_key: "sembako", item_label: "Sembako", category: "goods", amount: 30, unit: "paket", verified_at: "2026-10-28T03:00:00.000Z" }),
      donation({ donor_name: "Besar", amount: 2_000_000, verified_at: "2026-10-20T03:00:00.000Z" }),
      donation({ donor_name: "Sedang lama", amount: 500_000, verified_at: "2026-10-21T03:00:00.000Z" }),
      donation({ donor_name: "Sedang baru", amount: 500_000, verified_at: "2026-10-26T03:00:00.000Z" }),
    ]).map(donor => donor.name);
    expect(names).toEqual(["Besar", "Sedang baru", "Sedang lama", "Kecil", "Barang"]);
  });
});
