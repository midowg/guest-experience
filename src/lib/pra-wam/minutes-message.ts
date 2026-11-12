/*
 * A MoM in Telegram (12 Nov 2026, docs/rancangan-mom-telegram.md): the whole MoM goes as a PDF, and
 * the message carrying it says only what tells it apart: its code (unique), meeting, department,
 * day, hours and place, the notetaker, how many decisions and follow-ups, and its version. Neutral
 * when forwarded to a superior (no "kamu"), the department in full. Telegram's HTML: only what
 * people typed is escaped. Pure, so it is tested without a server.
 */

export type MinutesMessageAction = { task: string; pic: string | null; dueDate: string | null; done: boolean };
/** An agenda item of the FRM form (12 Nov 2026): topic, discussion, decision; `added`: a new topic, outside the agenda. */
export type MinutesMessageItem = { topic: string; discussion: string; decision: string; added: boolean };
/** A row of the PDF's attendance list. */
export type MinutesMessageAttendee = { name: string; department: string; position: string; present: boolean };
export type MinutesMessage = {
  /**
   * The MoM's number, e.g. "MoM/2026/11/0012" (FRM form, migration 202611120005), or before it
   * its code, e.g. "CoE-20261112-4F3A": the same in the message, the PDF and its file name.
   */
  code: string;
  title: string;
  /** The department's (or team's) short form and its full name. */
  departmentShort: string;
  department: string;
  /** YYYY-MM-DD, and the hours as HH.MM (WIB), when the meeting had them. */
  date: string;
  from: string | null;
  to: string | null;
  place: string;
  participants: readonly string[];
  notetaker: string | null;
  summary: string;
  decisions: string;
  actions: readonly MinutesMessageAction[];
  version: number;
  /** When this version was sent or changed (ISO), and by whom. */
  at: string;
  changedBy?: string | null;
  link: string;
  /** A sample from Admin WAM → Telegram, marked so nobody takes it for a real meeting. */
  trial?: boolean;
  /*
   * The FRM form (12 Nov 2026). Without items the summary and decisions above are the MoM, as
   * before; with them, summary and decisions are not used.
   */
  chair?: string | null;
  items?: readonly MinutesMessageItem[];
  /** Everyone in the meeting, and whether they came. */
  attendance?: readonly MinutesMessageAttendee[];
  /** Others who came and are not on the list. */
  guests?: string;
  next?: { date: string | null; time: string | null; place: string; agenda: string } | null;
  photoCount?: number;
};

/** Telegram's limit for the text under a file. */
export const CAPTION_LIMIT = 1024;
/** Names shown before "+N lainnya" in the PDF's list of people. */
export const PARTICIPANTS_SHOWN = 12;

const TZ = "Asia/Jakarta";
export const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** What Telegram counts: the text without our tags, entities read back. */
export const visibleLength = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").length;

const parts = (date: Date, options: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(new Intl.DateTimeFormat("id-ID", { timeZone: TZ, ...options }).formatToParts(date).map(part => [part.type, part.value]));
const day = (iso: string) => new Date(`${iso}T12:00:00+07:00`);

/** "Kamis, 12 November 2026". */
export function longDate(iso: string): string {
  const p = parts(day(iso), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `${p.weekday}, ${p.day} ${p.month} ${p.year}`;
}
/** "Jum, 20 Nov": a follow-up's due date. */
export function dueDate(iso: string): string {
  const p = parts(day(iso), { weekday: "short", day: "numeric", month: "short" });
  return `${p.weekday.replace(/\.$/, "")}, ${p.day} ${p.month.replace(/\.$/, "")}`;
}
/** "12 Nov 2026, 11.38 WIB". */
export function stamp(at: string): string {
  const p = parts(new Date(at), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${p.day} ${p.month.replace(/\.$/, "")} ${p.year}, ${p.hour}.${p.minute} WIB`;
}

/*
 * The FRM form's own words (12 Nov 2026, FRM.05.00.00.027 Minutes of Meeting): the PDF is in
 * English like the paper form, with its date formats and its list of positions.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ymd = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return { y, m, d }; };
/** The form's meeting date, "dd MMM. yy": "07 Aug. 26". */
export function frmDate(iso: string): string {
  const { y, m, d } = ymd(iso);
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]}. ${String(y % 100).padStart(2, "0")}`;
}
/** The form's due date, "d-MMM-yy": "20-Nov-26". */
export function frmDue(iso: string): string {
  const { y, m, d } = ymd(iso);
  return `${d}-${MONTHS[m - 1]}-${String(y % 100).padStart(2, "0")}`;
}
/** A time as the form writes it: "09.00" or "09:00" → "09:00 WIB". */
export const frmTime = (time: string) => `${time.replace(".", ":").slice(0, 5)} WIB`;
/** "12 Nov 2026, 13:05 WIB": when a version was sent, in the PDF's foot. */
export function frmStamp(at: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(at)).map(part => [part.type, part.value]));
  return `${p.day} ${p.month.replace(/\.$/, "").slice(0, 3)} ${p.year}, ${p.hour}:${p.minute} WIB`;
}

/** Others who came, typed as a list ("Pak Andi (klien), Bu Sari"): one name each. */
export const guestNames = (text: string | null | undefined) => (text ?? "").split(/[,;\n]/).map(name => name.trim()).filter(Boolean);

/** The form's positions, as in its list. Assistant HOD has no source in Data karyawan yet. */
export const FRM_POSITIONS = ["Board of Director", "Head of Department", "Assistant HOD", "Coordinator", "Staff"] as const;
export type FrmPosition = (typeof FRM_POSITIONS)[number];
/**
 * A person's position on the form, from WAM: BOD → Board of Director; GM or HOD in any job → Head of
 * Department; Lead → Coordinator; otherwise Staff. Nothing known (no job) → "".
 */
export function frmPosition(bod: boolean, posts: readonly ("gm" | "hod" | "lead" | "staf")[]): FrmPosition | "" {
  if (bod) return "Board of Director";
  if (posts.some(post => post === "gm" || post === "hod")) return "Head of Department";
  if (posts.includes("lead")) return "Coordinator";
  return posts.length ? "Staff" : "";
}

/** Cuts text to at most `max` characters, at a sentence or word end, with "…". */
export function cut(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  if (max < 2) return "";
  const room = clean.slice(0, max - 1);
  const sentence = Math.max(room.lastIndexOf(". "), room.lastIndexOf("\n"));
  const end = sentence >= max * 0.5 ? sentence + 1 : room.lastIndexOf(" ") > max * 0.5 ? room.lastIndexOf(" ") : room.length;
  return `${room.slice(0, end).trimEnd()}…`;
}

/**
 * The MoM's code: the department's short form, the meeting day and four characters of the
 * session's id, e.g. "CoE-20261112-4F3A". Stable for the session, so every version shares it.
 */
export function minutesCode(short: string, date: string, sessionId: string): string {
  const unit = short.replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || "WAM";
  return `${unit}-${date.replace(/-/g, "")}-${sessionId.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase()}`;
}
/** A MoM's number, not a code: "MoM/2026/11/0012". */
export const isMinutesNumber = (code: string) => /^MoM\/\d{4}\/\d{2}\/\d+$/.test(code);
/** "MoM_CoE-20261112-4F3A_v2.pdf", or with a number "MoM-2026-11-0012_v2.pdf". */
export function minutesFileName(message: Pick<MinutesMessage, "code" | "version" | "trial">): string {
  const end = `_v${Math.max(1, message.version)}${message.trial ? "_UJI" : ""}.pdf`;
  return isMinutesNumber(message.code) ? `${message.code.replace(/\//g, "-")}${end}` : `MoM_${message.code}${end}`;
}

/** The decisions as lines (one per line, list marks kept as typed). */
export const decisionLines = (text: string) => text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
/** How many decisions a MoM has: by line, in every agenda item (or in the decisions, before the FRM form). */
export const decisionCount = (message: Pick<MinutesMessage, "decisions" | "items">) => message.items?.length
  ? message.items.reduce((sum, item) => sum + decisionLines(item.decision).length, 0) : decisionLines(message.decisions).length;

/** The text under the PDF in Telegram: who, when, where, how much, which version. */
export function minutesCaption(message: MinutesMessage): string {
  const open = message.actions.filter(action => !action.done).length;
  const decisions = decisionCount(message);
  const counts = [
    ...(message.items?.length ? [`${message.items.length} topik`] : []),
    `${decisions} keputusan`,
    `${message.actions.length} tindak lanjut${message.actions.length ? ` (${open} belum selesai)` : ""}`,
    ...(message.photoCount ? [`${message.photoCount} foto`] : []),
  ].join(" · ");
  const present = message.attendance?.filter(person => person.present).length;
  const people = message.attendance?.length ? `${present} dari ${message.attendance.length} hadir` : `${message.participants.length} peserta`;
  const version = message.version > 1
    ? `Versi ${message.version} · diperbarui ${stamp(message.at)}${message.changedBy ? ` oleh ${escapeHtml(message.changedBy)}` : ""}`
    : `Versi 1 · dikirim ${stamp(message.at)} lewat WAM`;
  const lines = [
    `📝 <b>MoM · ${escapeHtml(message.departmentShort)} · ${escapeHtml(cut(message.title, 140))}</b>`,
    ...(message.trial ? ["<i>UJI COBA dari WAM, bukan meeting sungguhan.</i>"] : []),
    `${isMinutesNumber(message.code) ? "No." : "Kode"}: <code>${escapeHtml(message.code)}</code>`,
    "",
    `${escapeHtml(message.department)} · ${longDate(message.date)}`,
    message.from && message.to ? `${message.from}–${message.to} WIB · ${escapeHtml(cut(message.place, 80))}` : escapeHtml(cut(message.place, 80)),
    `${message.chair ? `Pimpinan: ${escapeHtml(message.chair)} · ` : ""}${message.notetaker ? `Notulis: ${escapeHtml(message.notetaker)} · ` : ""}${people}`,
    counts,
    "",
    "Detail lengkap ada di PDF terlampir.",
    `Buka di WAM: ${escapeHtml(message.link)}`,
    `<i>${version}</i>`,
  ];
  return lines.join("\n");
}
