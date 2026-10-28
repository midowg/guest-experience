import type { PlainImage } from "./types";

/**
 * CSR donations (event_kind "csr"): people give money or goods, the page shows what has been
 * collected and who gave, and the committee tells every donor when the help was handed over.
 *
 * Money is paid by hand (bank transfer or QRIS shown on the page, no payment gateway). Only
 * donations the committee has received count anywhere public, so the totals can be trusted.
 */

/** Fund: money (in rupiah). Goods: things counted in a unit. Other: anything else, typed freely. */
export type DonationCategory = "fund" | "goods" | "other";
/** One suggestion chip on the form: a tap fills in what is given and its unit. */
export type DonationItem = { key: string; label: string; category: DonationCategory; unit: string; target: number | null };
export type BankAccount = { id: string; bank: string; number: string; holder: string };
/** Where the help goes: a children's home, a village, a family. A page may name several. */
export type DonationRecipient = { id: string; name: string; description: string; place: string; photo: PlainImage };
/** How a donor appears in the public list. "hidden" still counts in the totals. */
export type DonorDisplay = "name" | "hamba_allah" | "hidden";
export const donorDisplays: { key: DonorDisplay; label: string; hint: string }[] = [
  { key: "name", label: "Tampilkan nama saya", hint: "Nama Anda muncul di daftar donatur." },
  { key: "hamba_allah", label: "Hamba Allah", hint: "Tercantum sebagai Hamba Allah, tanpa mengisi nama." },
  { key: "hidden", label: "Jangan sebutkan", hint: "Tidak muncul di daftar dan tanpa mengisi nama, tetap terhitung." },
];
export const HAMBA_ALLAH = "Hamba Allah";
export const NO_NAME = "Tanpa nama";
/**
 * The name a donation carries everywhere (page, admin, report, spreadsheet): the donor's own only
 * when they chose to show it. A donor who chose Hamba Allah or not to be named is never asked for a
 * name, and an older record that has one still shows it as they chose.
 */
export const donorLabel = (donation: Pick<DonationRecord, "donor_name" | "display">) =>
  donation.display === "name" ? donation.donor_name : donation.display === "hamba_allah" ? HAMBA_ALLAH : NO_NAME;

export type DonationSettings = {
  /** The form takes donations. Off: the page still shows what was collected. */
  enabled: boolean;
  items: DonationItem[];
  /** Who receives the help, shown on the page as "Disalurkan ke". */
  recipients: DonationRecipient[];
  accounts: BankAccount[];
  qris: PlainImage;
  proofRequired: boolean;
  /** Each gift of goods comes with a photo of it, so the committee can check it on receipt. */
  goodsPhotoRequired: boolean;
  /** How to hand over goods: where to drop them off, by when, or that the committee picks them up. */
  goodsNote: string;
  /** After this the form closes; null keeps it open. */
  closesAt: string | null;
  /** What the public page shows. */
  show: { fundTotal: boolean; fundTarget: boolean; goods: boolean; donors: boolean; donorAmounts: boolean; messages: boolean };
  /** Filled once the help has been handed over: the page shows it and donors can be told. */
  delivered: { at: string | null; photo: PlainImage; note: string };
  /** The WhatsApp message to each donor, with {nama} {bantuan} {jumlah} {tanggal_serah} {penerima} {acara} {tautan} {doa}. */
  notify: { template: string; prayer: string };
};

/** A donation as the committee sees it. */
export type DonationStatus = "pending" | "received" | "rejected";
export type DonationRecord = {
  id: string; event_id: string;
  item_key: string; item_label: string; category: DonationCategory; amount: number; unit: string;
  donor_name: string; display: DonorDisplay; donor_phone: string; message: string;
  proof_key: string; status: DonationStatus; received_amount: number | null; reject_reason: string;
  verified_at: string | null; notified_at: string | null; created_at: string;
  /** The recipient this donation is handed to (Donasi → Pembagian); empty until shared out. */
  recipient_id: string;
  /** Admin only: a short-lived address of the photo (goods) or proof of transfer, for a preview. */
  proof_url?: string;
};
/** What the form sends. */
export type DonationInput = {
  item_key: string; item_label: string; category: DonationCategory; amount: number; unit: string;
  donor_name: string; display: DonorDisplay; donor_phone: string; message: string;
  website: string; idempotency_key: string;
};

const image = (): PlainImage => ({ url: "", alt: "", srcset: [] });
const item = (key: string, label: string, category: DonationCategory, unit: string): DonationItem => ({ key, label, category, unit, target: null });

/** The chips a CSR event starts with; the admin adds, removes and reorders them. */
export const defaultDonationItems = (): DonationItem[] => [
  item("dana", "Dana", "fund", "Rp"),
  item("sembako", "Sembako", "goods", "paket"),
  item("beras", "Beras", "goods", "kg"),
  item("minyak", "Minyak goreng", "goods", "liter"),
  item("susu", "Susu", "goods", "pcs"),
  item("buku", "Buku tulis", "goods", "pcs"),
  item("alat-tulis", "Alat tulis", "goods", "pcs"),
  item("seragam", "Seragam sekolah", "goods", "pcs"),
  item("pakaian", "Pakaian layak pakai", "goods", "pcs"),
  item("mainan", "Mainan edukasi", "goods", "pcs"),
  item("obat", "Obat-obatan", "goods", "pcs"),
  item("mandi", "Perlengkapan mandi", "goods", "pcs"),
];
/** Examples that add to the free-text gift, so donors see they may write several things at once. */
export const otherGiftSuggestions = ["Selimut", "Pakaian anak", "Sepatu", "Tas sekolah", "Buku cerita", "Mainan edukasi", "Handuk", "Sajadah dan mukena"];
/** Adds an example to what was typed, separated by a comma, unless it is already there. */
export function addGiftText(current: string, addition: string): string {
  const text = current.trim().replace(/[,\s]+$/, "");
  if (text.toLowerCase().split(/\s*,\s*/).includes(addition.toLowerCase())) return text;
  return text ? `${text}, ${addition}` : addition;
}
/** Prayers the admin can pick for the closing line of the WhatsApp message. */
export const prayerSuggestions = [
  "Semoga kebaikan Anda dibalas berlipat ganda.",
  "Semoga menjadi amal jariyah dan membawa keberkahan bagi Anda sekeluarga.",
  "Semoga Tuhan membalas kebaikan Anda dengan kesehatan dan rezeki yang lapang.",
  "Jazakumullahu khairan katsiran, semoga Allah membalas dengan kebaikan yang banyak.",
];
export const defaultNotifyTemplate = "Halo {nama},\n\nTerima kasih atas donasi Anda untuk {acara}: {bantuan}.\nBantuan telah kami serahkan kepada {penerima} pada {tanggal_serah}.\n\nLihat kabarnya di sini: {tautan}\n\n{doa}";

export function emptyDonation(): DonationSettings {
  return {
    enabled: false, items: [], recipients: [], accounts: [], qris: image(), proofRequired: false, goodsPhotoRequired: false, goodsNote: "", closesAt: null,
    show: { fundTotal: true, fundTarget: true, goods: true, donors: true, donorAmounts: false, messages: true },
    delivered: { at: null, photo: image(), note: "" },
    notify: { template: defaultNotifyTemplate, prayer: prayerSuggestions[0] },
  };
}
/** A new CSR event: donations open, with the usual chips. */
export const startingDonation = (): DonationSettings => ({ ...emptyDonation(), enabled: true, items: defaultDonationItems() });

/** Fills what documents saved before donations existed do not carry. */
export function normalizeDonation(donation: Partial<DonationSettings> | undefined): DonationSettings {
  const base = emptyDonation();
  if (!donation) return base;
  return {
    ...base, ...donation,
    items: donation.items ?? [], accounts: donation.accounts ?? [], qris: { ...image(), ...donation.qris },
    recipients: (donation.recipients ?? []).map(({ id, name, description, place, photo }) => ({ id, name, description, place, photo: { ...image(), ...photo } })),
    show: { ...base.show, ...donation.show },
    delivered: { ...base.delivered, ...donation.delivered, photo: { ...image(), ...donation.delivered?.photo } },
    notify: { ...base.notify, ...donation.notify },
  };
}

/** "Rp 12.500.000". */
export const formatRupiah = (amount: number) => `Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.round(amount))}`;
/** Digits from what was typed ("Rp 100.000", "100rb" is not guessed): 0 when there are none. */
export const parseRupiah = (text: string) => Number(text.replace(/\D/g, "").slice(0, 13)) || 0;
const formatCount = (amount: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(amount);

/** "Dana Rp 100.000", "Sembako 2 paket", or just the label when no amount was given. */
export function describeDonation(donation: Pick<DonationRecord, "item_label" | "category" | "amount" | "unit">, amount = donation.amount): string {
  if (donation.category === "fund") return amount > 0 ? `${donation.item_label} ${formatRupiah(amount)}` : donation.item_label;
  return amount > 0 ? `${donation.item_label} ${formatCount(amount)}${donation.unit ? ` ${donation.unit}` : ""}` : donation.item_label;
}

/** The amount that counts: what the committee recorded on receipt, else what the donor said. */
export const countedAmount = (donation: Pick<DonationRecord, "amount" | "received_amount">) => donation.received_amount ?? donation.amount;

export type DonationTotals = {
  fund: { total: number; target: number | null } | null;
  goods: { key: string; label: string; unit: string; total: number; target: number | null }[];
  /** Donations of things not on the chip list. */
  other: number;
  /** People who gave (received donations), named or not. */
  donors: number;
  /** Donations still waiting for the committee: a count only, nobody's details. */
  pending: number;
};

/**
 * What the public page may show of the totals. Only received donations count; the admin's switches
 * decide which parts appear at all (a part switched off is null or empty).
 */
export function donationTotals(settings: DonationSettings, donations: Pick<DonationRecord, "item_key" | "item_label" | "category" | "amount" | "unit" | "status" | "received_amount">[]): DonationTotals {
  const received = donations.filter(donation => donation.status === "received");
  const fundItems = settings.items.filter(item => item.category === "fund");
  const fundTarget = fundItems.reduce<number | null>((sum, item) => item.target ? (sum ?? 0) + item.target : sum, null);
  const fundTotal = received.filter(donation => donation.category === "fund").reduce((sum, donation) => sum + countedAmount(donation), 0);
  const goods = settings.items.filter(item => item.category === "goods").map(item => ({
    key: item.key, label: item.label, unit: item.unit, target: item.target,
    total: received.filter(donation => donation.category === "goods" && donation.item_key === item.key).reduce((sum, donation) => sum + countedAmount(donation), 0),
  }));
  // Goods given under a chip removed since, or typed freely, are "other": still visible, never lost.
  const goodsKeys = new Set(goods.map(item => item.key));
  const other = received.filter(donation => donation.category === "other" || (donation.category === "goods" && !goodsKeys.has(donation.item_key))).length;
  return {
    fund: settings.show.fundTotal && (fundItems.length || fundTotal) ? { total: fundTotal, target: settings.show.fundTarget ? fundTarget : null } : null,
    goods: settings.show.goods ? goods.filter(item => item.total > 0 || item.target) : [],
    other: settings.show.goods ? other : 0,
    donors: received.length,
    pending: donations.filter(donation => donation.status === "pending").length,
  };
}

/** One line of the public donor list. Never carries a phone number, a proof, or a hidden name. */
export type PublicDonor = { id: string; name: string; gift: string; message: string; at: string };

/**
 * The public donor list: received donations, newest first, as each donor chose to appear. Hidden
 * donors are left out; amounts of money and messages only when the admin shows them.
 */
export function publicDonors(settings: DonationSettings, donations: DonationRecord[]): PublicDonor[] {
  if (!settings.show.donors) return [];
  return donations
    .filter(donation => donation.status === "received" && donation.display !== "hidden")
    .sort((a, b) => (b.verified_at ?? b.created_at).localeCompare(a.verified_at ?? a.created_at))
    .map(donation => ({
      id: donation.id,
      name: donation.display === "name" ? donation.donor_name : HAMBA_ALLAH,
      gift: donation.category === "fund" && !settings.show.donorAmounts ? donation.item_label : describeDonation(donation, countedAmount(donation)),
      message: settings.show.messages ? donation.message : "",
      at: donation.verified_at ?? donation.created_at,
    }));
}

/** Initials for a donor's round badge: "HA" for Hamba Allah. */
export const donorInitials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]!.toUpperCase()).join("") || "?";

/**
 * The WhatsApp message telling one donor their help was handed over. Placeholders the admin did not
 * use are simply absent; only this donor's own details go in.
 */
export function notifyMessage(settings: DonationSettings, donation: DonationRecord, event: { title: string }, link: string, handedOver: string): string {
  const values: Record<string, string> = {
    // The message is private to the donor, so their own name is used even when the page says Hamba Allah.
    nama: donation.display === "name" && donation.donor_name ? donation.donor_name : "Bapak/Ibu",
    bantuan: describeDonation(donation, countedAmount(donation)),
    jumlah: donation.category === "fund" ? formatRupiah(countedAmount(donation)) : `${formatCount(countedAmount(donation))}${donation.unit ? ` ${donation.unit}` : ""}`,
    tanggal_serah: handedOver, acara: event.title, tautan: link, doa: settings.notify.prayer,
    penerima: listNames(settings.recipients.map(recipient => recipient.name).filter(Boolean)) || "penerima bantuan",
  };
  return settings.notify.template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole).replace(/\n{3,}/g, "\n\n").trim();
}

/** "A", "A dan B", "A, B, dan C". */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return names.length === 2 ? `${names[0]} dan ${names[1]}` : `${names.slice(0, -1).join(", ")}, dan ${names.at(-1)}`;
}

/** What the printed report lists: every received gift, whatever the public page shows. */
export type DonationReport = {
  fund: number;
  /** Per kind of goods; `key` is the chip it was given under. */
  goods: { key: string; label: string; unit: string; total: number }[];
  /** Gifts written freely (or under a chip removed since), as the donor wrote them. */
  other: string[];
  /** Received donations; one donor giving two things counts twice, as on the page. */
  count: number;
  donors: { id: string; name: string; gift: string; amount: string; at: string }[];
};

/**
 * The handover report for the recipient: totals per kind of gift from received donations only,
 * and the donors as each chose to appear ("Tanpa nama" for those who asked not to be named).
 * Never a phone number or a proof.
 */
export function donationReport(settings: DonationSettings, donations: DonationRecord[]): DonationReport {
  const received = donations.filter(donation => donation.status === "received")
    .sort((a, b) => (a.verified_at ?? a.created_at).localeCompare(b.verified_at ?? b.created_at));
  const goodsKeys = new Set(settings.items.filter(item => item.category === "goods").map(item => item.key));
  const goods = new Map<string, { key: string; label: string; unit: string; total: number }>();
  for (const donation of received) {
    if (donation.category !== "goods" || !goodsKeys.has(donation.item_key)) continue;
    const key = donation.item_key;
    const row = goods.get(key) ?? { key, label: donation.item_label, unit: donation.unit, total: 0 };
    row.total += countedAmount(donation);
    goods.set(key, row);
  }
  const order = settings.items.map(item => item.label);
  return {
    fund: received.filter(donation => donation.category === "fund").reduce((sum, donation) => sum + countedAmount(donation), 0),
    goods: [...goods.values()].sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label)),
    other: received.filter(donation => donation.category === "other" || (donation.category === "goods" && !goodsKeys.has(donation.item_key)))
      .map(donation => describeDonation(donation, countedAmount(donation))),
    count: received.length,
    donors: received.map(donation => ({
      id: donation.id,
      name: donorLabel(donation),
      gift: donation.category === "fund" ? donation.item_label : describeDonation(donation, countedAmount(donation)),
      amount: donation.category === "fund" ? formatRupiah(countedAmount(donation)) : "",
      at: donation.verified_at ?? donation.created_at,
    })),
  };
}

/** What one recipient is handed: money, goods per kind (as donated), and gifts written freely. */
export type RecipientGifts = { fund: number; goods: { label: string; unit: string; total: number }[]; other: string[]; count: number };

/**
 * Received donations shared out to recipients (Donasi → Pembagian): what each recipient gets, and
 * what is not shared out yet (no recipient, or one removed since). Goods given under a chip are
 * added up per kind; anything else is listed as written.
 */
export function splitByRecipient(settings: DonationSettings, donations: DonationRecord[]): { byRecipient: Record<string, RecipientGifts>; unassigned: RecipientGifts; anyAssigned: boolean } {
  const goodsKeys = new Set(settings.items.filter(item => item.category === "goods").map(item => item.key));
  const ids = new Set(settings.recipients.map(recipient => recipient.id));
  const empty = (): RecipientGifts => ({ fund: 0, goods: [], other: [], count: 0 });
  const byRecipient: Record<string, RecipientGifts> = Object.fromEntries(settings.recipients.map(recipient => [recipient.id, empty()]));
  const unassigned = empty();
  let anyAssigned = false;
  for (const donation of donations.filter(item => item.status === "received")) {
    const assigned = ids.has(donation.recipient_id);
    anyAssigned ||= assigned;
    const into = assigned ? byRecipient[donation.recipient_id] : unassigned;
    const amount = countedAmount(donation);
    into.count++;
    if (donation.category === "fund") into.fund += amount;
    else if (donation.category === "goods" && goodsKeys.has(donation.item_key)) {
      const row = into.goods.find(item => item.label === donation.item_label && item.unit === donation.unit);
      if (row) row.total += amount; else into.goods.push({ label: donation.item_label, unit: donation.unit, total: amount });
    } else into.other.push(describeDonation(donation, amount));
  }
  return { byRecipient, unassigned, anyAssigned };
}

/** "Selimut 20 pcs; Sepatu 10 pcs; Kursi roda", for a table cell. */
export const giftsText = (gifts: RecipientGifts) => [...gifts.goods.map(item => `${item.label} ${formatCount(item.total)}${item.unit ? ` ${item.unit}` : ""}`), ...gifts.other].join("; ");
