import { z } from "zod";
import { byStart, timeRange, wibDate, wibInstant, wibTime } from "../rundown";
import { SESSION_KINDS, SESSION_MODULES, SESSION_STATUSES, type LineupItem, type MwSession, type RundownChange, type SessionKind, type SessionModule } from "../types";
import { sessionKindLabels, sessionModuleLabels, sessionStatusLabels } from "./labels";
import { matchPerson, type AdminPerson } from "./people";
import { MAX_PASTE_ROWS, cellAt, clockTime, dotTime, eventDayDate, fold, parseTsv, readColumns, yesNo } from "./tsv";

/*
 * Admin WAM → Main WAM → Rundown (agen E): what a session form and a pasted rundown may hold, how
 * a change after publishing is logged ("diubah oleh", mw_rundown_log) and told to participants,
 * moving many sessions at once, and copying one. Times are WIB: the admin picks a day of the event
 * and a clock time; the server turns them into instants. Pure: tested without a server.
 */

export const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const text = (max: number, label: string) => z.string().trim().max(max, `${label} paling panjang ${max} karakter.`);
const lineupItem = z.object({ time: z.string().trim().max(5), label: z.string().trim().min(1).max(120, "Satu baris urutan tampil paling panjang 120 karakter.") });

/** A session as the form and the import send it (one day of the event, clock times). */
export const sessionInputSchema = z.object({
  title: z.string().trim().min(2, "Tulis judul sesi.").max(150, "Judul paling panjang 150 karakter."),
  kind: z.enum(SESSION_KINDS, { message: "Jenis: sesi, makan, atau perjalanan." }),
  status: z.enum(SESSION_STATUSES, { message: "Status: draf, terbit, atau batal." }),
  date: z.string().regex(DATE, "Pilih hari acara."),
  start: z.string().regex(TIME, "Tulis jam mulai, misalnya 08.00."),
  end: z.string().regex(TIME, "Tulis jam selesai, misalnya 12.00, atau kosongkan.").nullable(),
  place: text(200, "Tempat"),
  mapGuideId: z.uuid({ message: "Denah tidak dikenali." }).nullable(),
  dresscode: text(200, "Dresscode"),
  bring: text(500, "Yang perlu dibawa"),
  lineup: z.array(lineupItem).max(40, "Urutan tampil paling banyak 40 baris."),
  meal: text(300, "Konsumsi"),
  contactId: z.uuid({ message: "Kontak panitia tidak dikenali." }).nullable(),
  usesAttendance: z.boolean(),
  required: z.boolean(),
  optional: z.boolean(),
  module: z.enum(SESSION_MODULES, { message: "Modul tidak dikenali." }).nullable(),
  description: text(2000, "Keterangan"),
  sort: z.number().int().min(0).max(10_000),
}).superRefine((value, ctx) => {
  if (value.end && value.end <= value.start) ctx.addIssue({ code: "custom", path: ["end"], message: "Jam selesai harus setelah jam mulai." });
  if (value.kind === "makan" && value.usesAttendance) ctx.addIssue({ code: "custom", path: ["usesAttendance"], message: "Sesi makan tidak memakai absen." });
  if (value.required && !value.usesAttendance) ctx.addIssue({ code: "custom", path: ["required"], message: "Sesi wajib harus memakai absen." });
  if (value.required && value.optional) ctx.addIssue({ code: "custom", path: ["optional"], message: "Sesi wajib tidak bisa opsional." });
});
export type SessionInput = z.infer<typeof sessionInputSchema>;

/**
 * A session as the admin edits it: with its row version (updated_at; agen C's trigger moves it on
 * every change), so a save never overwrites a change made in Rundown live in the meantime.
 */
export type AdminSession = MwSession & { version: string | null };

/** A new session's defaults. */
export const blankSession = (date: string, sort = 0): SessionInput => ({
  title: "", kind: "sesi", status: "draf", date, start: "08:00", end: "09:00", place: "", mapGuideId: null, dresscode: "", bring: "", lineup: [], meal: "",
  contactId: null, usesAttendance: false, required: false, optional: false, module: null, description: "", sort,
});

/** The form's values of a saved session (its WIB day and clock times). */
export function sessionToInput(session: MwSession): SessionInput {
  return {
    title: session.title, kind: session.kind, status: session.status, date: wibDate(session.startsAt), start: wibTime(session.startsAt),
    end: session.endsAt ? wibTime(session.endsAt) : null, place: session.place, mapGuideId: session.mapGuideId, dresscode: session.dresscode, bring: session.bring,
    lineup: session.lineup, meal: session.meal, contactId: session.contactId, usesAttendance: session.usesAttendance, required: session.required,
    optional: session.optional, module: session.module, description: session.description, sort: session.sort,
  };
}

/** The instants of a session input. */
export const inputTimes = (input: Pick<SessionInput, "date" | "start" | "end">) => ({
  startsAt: new Date(wibInstant(input.date, input.start)).toISOString(),
  endsAt: input.end ? new Date(wibInstant(input.date, input.end)).toISOString() : null,
});

/** The mw_sessions columns of an input. */
export function sessionRow(input: SessionInput): Record<string, unknown> {
  const { startsAt, endsAt } = inputTimes(input);
  return {
    title: input.title, kind: input.kind, status: input.status, starts_at: startsAt, ends_at: endsAt, place: input.place, map_guide_id: input.mapGuideId,
    dresscode: input.dresscode, bring: input.bring, lineup: input.lineup, meal: input.meal, contact_id: input.contactId,
    uses_attendance: input.kind === "makan" ? false : input.usesAttendance, required: input.required, optional: input.optional, module: input.module,
    description: input.description, sort: input.sort,
  };
}

/* ── Urutan tampil as text ────────────────────────────────────────────────────────────────────── */

/** "08.00 Sales & Marketing" per line (or separated by ";"), to the lineup; a line without a time keeps an empty time. */
export function lineupFromText(value: string): LineupItem[] {
  return value.split(/\r?\n|;/).map(line => line.trim()).filter(Boolean).map(line => {
    const match = line.match(/^(\d{1,2}[.:]\d{2})\s*(?:[-–·|]\s*)?(.+)$/);
    const time = match ? clockTime(match[1]) : null;
    return time ? { time: dotTime(time), label: match![2].trim() } : { time: "", label: line };
  });
}
export const lineupToText = (items: readonly LineupItem[]) => items.map(item => (item.time ? `${item.time} ${item.label}` : item.label)).join("\n");

/* ── Changes after publishing ─────────────────────────────────────────────────────────────────── */

type Scheduled = Pick<MwSession, "startsAt" | "endsAt" | "place" | "status">;
const same = (a: string | null, b: string | null) => (a === null || b === null ? a === b : Date.parse(a) === Date.parse(b));

/**
 * What changed that participants care about (mw_rundown_log: start, end, place, status), for a
 * session that was published. A draft's edits are not logged.
 */
export function scheduleChanges(before: Scheduled, after: Scheduled): RundownChange["changes"] {
  if (before.status === "draf") return [];
  const changes: RundownChange["changes"] = [];
  if (!same(before.startsAt, after.startsAt)) changes.push({ field: "startsAt", from: before.startsAt, to: after.startsAt });
  if (!same(before.endsAt, after.endsAt)) changes.push({ field: "endsAt", from: before.endsAt, to: after.endsAt });
  if (before.place !== after.place) changes.push({ field: "place", from: before.place || null, to: after.place || null });
  if (before.status !== after.status) changes.push({ field: "status", from: before.status, to: after.status });
  return changes;
}

/** The note "Kabari peserta" sends about one session. */
export function changeNote(before: Pick<MwSession, "title" | "startsAt" | "endsAt" | "place">, after: Scheduled & { title: string }): { title: string; body: string } {
  if (after.status === "batal") return { title: "Jadwal berubah", body: `${after.title} dibatalkan.` };
  if (after.status === "draf") return { title: "Jadwal berubah", body: `${after.title} untuk sementara tidak ada di agenda.` };
  const timesMoved = !same(before.startsAt, after.startsAt) || !same(before.endsAt, after.endsAt);
  const moved = before.place !== after.place && after.place;
  const now = [timesMoved ? timeRange(after) : "", moved ? after.place : ""].filter(Boolean).join(" · ");
  const was = [timesMoved ? timeRange(before) : "", moved ? before.place : ""].filter(Boolean).join(" · ");
  return { title: "Jadwal berubah", body: now ? `${after.title}: ${now}${was ? ` (tadinya ${was})` : ""}.` : `${after.title} diperbarui.` };
}

/* ── Geser jam ────────────────────────────────────────────────────────────────────────────────── */

export const shiftSchema = z.object({
  ids: z.array(z.uuid()).min(1, "Pilih sesi yang digeser.").max(200),
  minutes: z.number().int().min(-720, "Paling jauh 12 jam.").max(720, "Paling jauh 12 jam.").refine(value => value !== 0, "Isi berapa menit.").refine(value => value % 5 === 0, "Geser dalam kelipatan 5 menit."),
  notify: z.boolean(),
});

const plus = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000).toISOString();
/** A session moved by some minutes (end with it). */
export const shifted = <T extends Pick<MwSession, "startsAt" | "endsAt">>(session: T, minutes: number): T => ({ ...session, startsAt: plus(session.startsAt, minutes), endsAt: session.endsAt ? plus(session.endsAt, minutes) : null });

/** "+30 menit", "−1 jam 15 menit". */
export function minutesLabel(minutes: number): string {
  const sign = minutes < 0 ? "−" : "+";
  const total = Math.abs(minutes);
  const hours = Math.floor(total / 60), rest = total % 60;
  return `${sign}${[hours ? `${hours} jam` : "", rest ? `${rest} menit` : ""].filter(Boolean).join(" ")}`;
}

/** The note for many sessions moved at once. */
export function shiftNote(sessions: readonly Pick<MwSession, "title" | "startsAt" | "endsAt">[], minutes: number): { title: string; body: string } {
  const sorted = [...sessions].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const word = minutes > 0 ? "mundur" : "maju";
  const first = sorted[0];
  const span = minutesLabel(minutes).slice(1);
  if (sorted.length === 1) return { title: "Jadwal berubah", body: `${first.title} ${word} ${span}: ${timeRange(shifted(first, minutes))}.` };
  return { title: "Jadwal berubah", body: `${sorted.length} sesi ${word} ${span}, mulai ${first.title} ${timeRange(shifted(first, minutes))}.` };
}

/** Sessions that overlap another in the same place (a warning, not a refusal; meals and cancelled ones are left out). */
export function overlaps(sessions: readonly MwSession[]): Set<string> {
  const live = sessions.filter(session => session.status !== "batal" && session.kind !== "makan").sort(byStart);
  const out = new Set<string>();
  for (let i = 0; i < live.length; i++) {
    const endA = Date.parse(live[i].endsAt ?? live[i].startsAt);
    for (let j = i + 1; j < live.length && Date.parse(live[j].startsAt) < endA; j++) {
      if (live[j].place && live[j].place === live[i].place) { out.add(live[i].id); out.add(live[j].id); }
    }
  }
  return out;
}

/* ── Impor dari spreadsheet ───────────────────────────────────────────────────────────────────── */

const COLUMNS = {
  day: /^(hari|tanggal|tgl|day|date)\b/,
  start: /^((jam )?mulai|start|dari|jam)$/,
  end: /^((jam )?selesai|end|sampai|hingga)$/,
  title: /^(judul|sesi|nama sesi|kegiatan|acara|agenda|title)\b/,
  place: /^(tempat|lokasi|ruang|place|venue)\b/,
  kind: /^(jenis|tipe|kind)\b/,
  dresscode: /^(dress ?code|pakaian|busana)\b/,
  bring: /^(yang (perlu )?dibawa|dibawa|bawa|bawaan)\b/,
  meal: /^(konsumsi|snack|makanan)\b/,
  attendance: /^((pakai )?absen|presensi)\b/,
  required: /^wajib\b/,
  optional: /^opsional\b/,
  module: /^modul\b/,
  contact: /^(kontak|pic|penanggung jawab)\b/,
  status: /^status\b/,
  lineup: /^(urutan( tampil)?|lineup|susunan)\b/,
  description: /^(keterangan|deskripsi|catatan)\b/,
};
type Column = keyof typeof COLUMNS;
/** Without a header row, the order the page documents. */
export const RUNDOWN_COLUMN_ORDER: Column[] = ["day", "start", "end", "title", "place", "kind", "dresscode", "bring", "meal", "attendance", "required", "module", "contact", "status"];
export const rundownColumnLabels: Record<Column, string> = {
  day: "Hari", start: "Mulai", end: "Selesai", title: "Judul", place: "Tempat", kind: "Jenis", dresscode: "Dresscode", bring: "Yang dibawa", meal: "Konsumsi",
  attendance: "Absen", required: "Wajib", optional: "Opsional", module: "Modul", contact: "Kontak", status: "Status", lineup: "Urutan tampil", description: "Keterangan",
};
const fallback = Object.fromEntries((Object.keys(COLUMNS) as Column[]).map(key => [key, RUNDOWN_COLUMN_ORDER.indexOf(key)])) as Record<Column, number>;

function kindOf(value: string): SessionKind | null {
  const word = fold(value);
  if (!word) return "sesi";
  return (Object.entries(sessionKindLabels).find(([key, label]) => fold(label) === word || key === word)?.[0] as SessionKind | undefined) ?? null;
}
function moduleOf(value: string): SessionModule | null | undefined {
  const word = fold(value);
  if (!word || ["tidak ada", "tidak", "-", "none"].includes(word)) return null;
  if (word === "voting") return "voting";
  return (Object.entries(sessionModuleLabels).find(([key, label]) => key !== "none" && (fold(label) === word || key === word))?.[0] as SessionModule | undefined) ?? undefined;
}
function statusOf(value: string): SessionInput["status"] | null {
  const word = fold(value);
  if (!word) return "draf";
  if (["dibatalkan", "batalkan"].includes(word)) return "batal";
  if (["terbitkan", "diterbitkan", "tayang"].includes(word)) return "terbit";
  return (Object.entries(sessionStatusLabels).find(([key, label]) => fold(label) === word || key === word)?.[0] as SessionInput["status"] | undefined) ?? null;
}

export type ImportRow<T> = { line: number; cells: string[]; input: T | null; errors: string[] };
export type RundownImport = { rows: ImportRow<SessionInput>[]; header: boolean; columns: Column[] };

/**
 * A rundown pasted from a sheet, one session per row, checked row by row before anything is saved:
 * the day (1–N, "Hari 2", or a date of the event), clock times, the kind, yes/no columns, the
 * module, the contact (a name in Data karyawan), and the same rules as the form. A row that
 * repeats an existing session (same day, start and title) is refused, so pasting twice adds nothing.
 */
export function parseRundownPaste(paste: string, ctx: { dates: readonly string[]; people: readonly AdminPerson[]; existing: readonly MwSession[]; sortFrom?: number }): RundownImport {
  const all = parseTsv(paste);
  const { columns, header } = readColumns(all, COLUMNS, fallback, 3);
  const rows = header ? all.slice(1) : all;
  const seen = new Map<string, number>();
  const existing = new Set(ctx.existing.map(session => `${wibDate(session.startsAt)} ${wibTime(session.startsAt)} ${fold(session.title)}`));
  const used = (Object.keys(columns) as Column[]).filter(key => columns[key] >= 0).sort((a, b) => columns[a] - columns[b]);
  const out = rows.slice(0, MAX_PASTE_ROWS).map((cells, index): ImportRow<SessionInput> => {
    const line = index + (header ? 2 : 1);
    const get = (key: Column) => cellAt(cells, columns[key]);
    const errors: string[] = [];
    const date = eventDayDate(get("day"), ctx.dates);
    if (!date) errors.push(get("day") ? `Hari "${get("day")}" bukan hari acara (1–${ctx.dates.length} atau tanggalnya).` : "Hari kosong.");
    const start = clockTime(get("start"));
    if (!start) errors.push(get("start") ? `Jam mulai "${get("start")}" tidak terbaca.` : "Jam mulai kosong.");
    const end = get("end") ? clockTime(get("end")) : null;
    if (get("end") && !end) errors.push(`Jam selesai "${get("end")}" tidak terbaca.`);
    const kind = kindOf(get("kind"));
    if (!kind) errors.push(`Jenis "${get("kind")}" tidak dikenal (sesi, makan, perjalanan).`);
    const flag = (key: Column, label: string) => {
      const value = yesNo(get(key));
      if (value === null) errors.push(`${label} "${get(key)}": tulis ya atau tidak.`);
      return value ?? false;
    };
    const usesAttendance = flag("attendance", "Absen"), required = flag("required", "Wajib"), optional = flag("optional", "Opsional");
    const hosted = moduleOf(get("module"));
    if (hosted === undefined) errors.push(`Modul "${get("module")}" tidak dikenal (Silent Meeting, Awarding, Survei).`);
    const status = statusOf(get("status"));
    if (!status) errors.push(`Status "${get("status")}" tidak dikenal (draf, terbit, batal).`);
    let contactId: string | null = null;
    if (get("contact")) {
      const found = matchPerson(get("contact"), ctx.people);
      if (found.person) contactId = found.person.id; else errors.push(`Kontak: ${found.error}`);
    }
    const input: SessionInput = {
      title: get("title"), kind: kind ?? "sesi", status: status ?? "draf", date: date ?? "", start: start ?? "", end, place: get("place"), mapGuideId: null,
      dresscode: get("dresscode"), bring: get("bring"), lineup: lineupFromText(get("lineup")), meal: get("meal"), contactId,
      usesAttendance: (kind ?? "sesi") === "makan" ? false : usesAttendance || required, required, optional, module: hosted ?? null,
      description: get("description"), sort: (ctx.sortFrom ?? 0) + index,
    };
    if (!input.title) errors.push("Judul kosong.");
    if (!errors.length) {
      const checked = sessionInputSchema.safeParse(input);
      if (!checked.success) errors.push(...new Set(checked.error.issues.map(issue => issue.message)));
    }
    if (date && start && input.title) {
      const key = `${date} ${start} ${fold(input.title)}`;
      if (existing.has(key)) errors.push("Sesi ini sudah ada di rundown (hari, jam mulai, dan judul sama).");
      else if (seen.has(key)) errors.push(`Sama dengan baris ${seen.get(key)}.`);
      else seen.set(key, line);
    }
    return { line, cells, input: errors.length ? null : input, errors: [...new Set(errors)] };
  });
  if (rows.length > MAX_PASTE_ROWS) out.push({ line: MAX_PASTE_ROWS + 1, cells: [], input: null, errors: [`Paling banyak ${MAX_PASTE_ROWS} baris sekali impor.`] });
  return { rows: out, header, columns: header ? used : RUNDOWN_COLUMN_ORDER };
}

/** What the server accepts from the import: the checked rows only. */
export const sessionImportSchema = z.object({ sessions: z.array(sessionInputSchema).min(1, "Tidak ada baris yang bisa disimpan.").max(MAX_PASTE_ROWS) });
