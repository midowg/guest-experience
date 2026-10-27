import { beoStatusLabels, type BeoRevision, type BeoState, type BeoSummary } from "./beo";
import { formatDate, formatDateTime, formatTime } from "./format";
import { briefFilled, briefGroups, type BriefGroup, type HostingBrief } from "./hosting-brief";
import { tzLabel } from "./timezones";
import type { EventRecord } from "./types";

export type BeoVersion = "vendor" | "internal";
export const beoVersionParam: Record<BeoVersion, string> = { vendor: "penyedia", internal: "lengkap" };
/** The full sheet unless the supplier version is asked for by name. */
export const beoVersionFromParam = (value: string | null | undefined): BeoVersion => value === "penyedia" ? "vendor" : "internal";

export const beoVersionInfo: Record<BeoVersion, { label: string; banner: string; includes: string }> = {
  vendor: {
    label: "Versi penyedia",
    banner: "Untuk penyedia (katering & venue)",
    includes: "Jumlah porsi, makanan khusus, alergi (nama depan saja), jadwal layanan, dan catatan. Tanpa nama lengkap, kebutuhan akses, brief tamu, atau riwayat.",
  },
  internal: {
    label: "Lembar lengkap",
    // The full sheet stays with the team, so it carries no band.
    banner: "",
    includes: "Lembar persiapan dan brief tamu sekaligus: nama lengkap, kebutuhan akses, angka RSVP, dan riwayat revisi.",
  },
};

export type BeoTable = { title: string; note?: string; columns: string[]; rows: string[][]; empty: string };
export type BeoDocument = {
  version: BeoVersion; banner: string; title: string; when: string; place: string;
  status: string; generated: string;
  numbers: { label: string; value: string; note?: string; main?: boolean }[];
  notes: string;
  tables: BeoTable[];
  /** Page 2 of the full sheet: the hosting brief, when anything is written in it. Never in the supplier version. */
  brief: BriefGroup[] | null;
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/**
 * Everything printed or exported for one BEO version. The print page and the PDF both render this,
 * so they cannot drift apart. The supplier version never carries full names, access needs, RSVP
 * counts or history.
 */
export function beoDocument(event: EventRecord, summary: BeoSummary, state: BeoState, revisions: BeoRevision[], version: BeoVersion, brief: HostingBrief | null = null, now = Date.now()): BeoDocument {
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
    brief: !vendor && brief && briefFilled(brief) ? briefGroups(brief, summary.attending ? `${summary.attending} orang (dari konfirmasi)` : "Belum ada konfirmasi") : null,
  };
}

export function beoFileName(slug: string, version: BeoVersion, state: BeoState) {
  return `beo-${slug}${version === "vendor" ? "-penyedia" : ""}${state.version ? `-v${state.version}` : ""}.pdf`;
}
