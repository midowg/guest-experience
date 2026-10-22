import { beoStatusLabels, type BeoRevision, type BeoState, type BeoSummary } from "./beo";
import { formatDate, formatDateTime, formatTime } from "./format";
import { tzLabel } from "./timezones";
import type { EventRecord } from "./types";

export type BeoVersion = "vendor" | "internal";
export const beoVersionParam: Record<BeoVersion, string> = { vendor: "penyedia", internal: "internal" };
export const beoVersionFromParam = (value: string | null | undefined): BeoVersion => value === "internal" ? "internal" : "vendor";

export const beoVersionInfo: Record<BeoVersion, { label: string; banner: string; includes: string }> = {
  vendor: {
    label: "Versi penyedia",
    banner: "VERSI PENYEDIA · untuk katering dan venue",
    includes: "Jumlah porsi, makanan khusus, alergi (nama depan saja), jadwal layanan, dan catatan. Tanpa kebutuhan akses, nama lengkap, atau riwayat.",
  },
  internal: {
    label: "Versi internal",
    banner: "VERSI INTERNAL · jangan dikirim ke penyedia",
    includes: "Semua isi versi penyedia, ditambah nama lengkap, kebutuhan akses khusus, angka RSVP, dan riwayat revisi.",
  },
};

export type BeoTable = { title: string; note?: string; columns: string[]; rows: string[][]; empty: string };
export type BeoDocument = {
  version: BeoVersion; banner: string; title: string; when: string; place: string;
  status: string; generated: string;
  numbers: { label: string; value: string; note?: string; main?: boolean }[];
  notes: string;
  tables: BeoTable[];
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/**
 * Everything printed or exported for one BEO version. The print page and the PDF both render this,
 * so they cannot drift apart. The supplier version never carries full names, access needs, RSVP
 * counts or history.
 */
export function beoDocument(event: EventRecord, summary: BeoSummary, state: BeoState, revisions: BeoRevision[], version: BeoVersion, now = Date.now()): BeoDocument {
  const vendor = version === "vendor";
  const time = (value: string) => formatTime(value, event.timezone);
  const when = event.starts_at ? `${formatDate(event.starts_at, event.timezone)}, ${time(event.starts_at)}${event.ends_at ? `–${time(event.ends_at)}` : ""} ${tzLabel(event.timezone)}` : "Tanggal belum diisi";
  const prepared = state.prepared_count === null ? "Belum ditetapkan" : String(state.prepared_count);
  const numbers: BeoDocument["numbers"] = vendor
    ? [{ label: "Jumlah porsi/pax disiapkan", value: prepared, main: true }]
    : [
      { label: "Jumlah disiapkan", value: prepared, main: true },
      { label: "RSVP hadir", value: String(summary.attending), note: `${summary.answeredYes} jawaban, termasuk pendamping` },
      { label: "Perkiraan survei", value: summary.estimate === null ? "—" : String(summary.estimate) },
    ];
  const tables: BeoTable[] = [
    {
      title: "Makanan khusus", note: "Dihitung per jawaban tamu; satu tamu bisa masuk lebih dari satu kategori.",
      columns: ["Kategori", "Jumlah"], rows: summary.dietary.map(item => [item.label, String(item.count)]), empty: "Tidak ada makanan khusus.",
    },
    {
      title: "Alergi", columns: ["Tamu", "Alergen"],
      rows: summary.allergies.map(item => [vendor ? item.firstName : item.name, item.details || "Belum dirinci, tanyakan ke tamu"]), empty: "Tidak ada alergi yang dilaporkan.",
    },
  ];
  if (summary.otherFood.length) tables.push({ title: "Permintaan makanan lain", columns: ["Tamu", "Keterangan"], rows: summary.otherFood.map(item => [vendor ? firstName(item.name) : item.name, item.details || "—"]), empty: "" });
  if (!vendor) tables.push({ title: "Akses khusus", columns: ["Tamu", "Kebutuhan"], rows: summary.access.map(item => [item.name, [...item.needs, item.other].filter(Boolean).join(", ")]), empty: "Tidak ada kebutuhan akses." });
  tables.push({ title: `Jadwal layanan (${tzLabel(event.timezone)})`, columns: ["Waktu", "Kegiatan"], rows: summary.schedule.map(item => [`${time(item.starts_at)}–${time(item.ends_at)}`, item.title]), empty: "Rundown belum diisi." });
  if (!vendor && revisions.length) tables.push({
    title: "Riwayat", columns: ["Versi", "Status", "Waktu", "Disiapkan", "RSVP hadir", "Alasan"],
    rows: revisions.map(rev => [String(rev.version), beoStatusLabels[rev.status], formatDateTime(rev.at, event.timezone), rev.prepared_count === null ? "—" : String(rev.prepared_count), String(rev.attending), rev.reason || "—"]),
    empty: "",
  });
  return {
    version, banner: beoVersionInfo[version].banner, title: event.title, when,
    place: [event.venue_name, event.address].filter(Boolean).join(", ") || "Lokasi belum diisi",
    status: `${beoStatusLabels[state.status]}${state.version ? ` · versi ${state.version}` : ""}`,
    generated: formatDateTime(new Date(now).toISOString(), event.timezone),
    numbers, notes: state.notes.trim(), tables,
  };
}

export function beoFileName(slug: string, version: BeoVersion, state: BeoState) {
  return `beo-${slug}-${beoVersionParam[version]}${state.version ? `-v${state.version}` : ""}.pdf`;
}
