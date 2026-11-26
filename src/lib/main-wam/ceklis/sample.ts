import type { MwSession } from "../types";
import type { ChecklistItem, SessionChecklist } from "./ceklis";

/*
 * Mode demo's checklist (the prototype's "Persiapan berangkat", five items): the agenda 3 days before
 * the first day. Made-up content, no photos. Pure.
 */

/** A fixed, valid uuid per sample row (the prefix isSampleId() knows): kind 4 is a session, kind 14 an item. */
const itemId = (n: number) => `00000000-0000-4000-8014-${String(n).padStart(12, "0")}`;
const PREP_ID = "00000000-0000-4000-8004-000000000090";

/**
 * The agenda "Persiapan berangkat", 3 days before the sample's first day (Sat 1 Jan; the sample moves with
 * the rest to today). Kept apart from sample.ts's rundown (many tests count its days and sessions) and
 * added to the demo's rundown by the reader (read.ts), so it appears in Mode demo only.
 */
export const samplePrepSession: MwSession = {
  id: PREP_ID, title: "Persiapan berangkat", kind: "sesi", status: "terbit", startsAt: "2027-01-01T09:00:00+07:00", endsAt: null,
  place: "Di rumah · selesaikan sebelum 3 Januari", mapGuideId: null, dresscode: "", bring: "", lineup: [], meal: "", contactId: null,
  usesAttendance: false, required: false, optional: false, module: null,
  description: "Cek perlengkapanmu satu per satu. Kota Batu dingin, terutama malam hari.", sort: 0, changedAt: null, changedBy: null,
};

const ITEMS: [text: string, note: string][] = [
  ["Jaket dan baju tebal", "Malam di Kota Batu bisa 15–18°C. Bawa jaket yang nyaman dipakai seharian."],
  ["Perlengkapan ibadah", "Sajadah, mukena atau sarung, atau perlengkapan ibadahmu sendiri."],
  ["Baju tema dari panitia", "Batik untuk hari pertama dan malam penghargaan, sesuai ketentuan tema WAM."],
  ["Obat pribadi dan tumbler", "Obat rutinmu dan botol minum isi ulang untuk mengurangi sampah."],
  ["KTP dan tiket digital", "Tiket kereta sudah di HP dan KTP dibawa untuk naik kereta dan check-in."],
];

export const sampleChecklistItems: ChecklistItem[] = ITEMS.map(([text, note], index) => ({
  id: itemId(index + 1), sessionId: PREP_ID, text, note, photo: null, sort: index,
}));

/** session id → its checklist. */
export const sampleChecklists = (): Map<string, SessionChecklist> => new Map([[PREP_ID, { items: sampleChecklistItems }]]);

/** The cookie Mode demo keeps the ticks in (a sample item cannot be saved: every write is refused while the sample rundown stands in). */
export const DEMO_CEKLIS_COOKIE = "mw_demo_ceklis";
/** The ticked sample item ids in a cookie value ("id,id"); anything else is dropped. */
export function parseDemoTicks(value: string | null | undefined): Set<string> {
  const known = new Set(sampleChecklistItems.map(item => item.id));
  return new Set((value ?? "").split(",").filter(id => known.has(id)));
}
