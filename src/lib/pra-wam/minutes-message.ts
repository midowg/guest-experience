/*
 * A MoM in Telegram (12 Nov 2026, docs/rancangan-mom-telegram.md): the whole MoM goes as a PDF, and
 * the message carrying it says only what tells it apart: its code (unique), meeting, department,
 * day, hours and place, the notetaker, how many decisions and follow-ups, and its version. Neutral
 * when forwarded to a superior (no "kamu"), the department in full. Telegram's HTML: only what
 * people typed is escaped. Pure, so it is tested without a server.
 */

export type MinutesMessageAction = { task: string; pic: string | null; dueDate: string | null; done: boolean };
export type MinutesMessage = {
  /** The MoM's code, e.g. "CoE-20261112-4F3A": the same in the message, the PDF and its file name. */
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
/** "MoM_CoE-20261112-4F3A_v2.pdf". */
export const minutesFileName = (message: Pick<MinutesMessage, "code" | "version" | "trial">) =>
  `MoM_${message.code}_v${Math.max(1, message.version)}${message.trial ? "_UJI" : ""}.pdf`;

/** The decisions as lines (one per line, list marks kept as typed). */
export const decisionLines = (text: string) => text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

/** The text under the PDF in Telegram: who, when, where, how much, which version. */
export function minutesCaption(message: MinutesMessage): string {
  const open = message.actions.filter(action => !action.done).length;
  const decisions = decisionLines(message.decisions).length;
  const counts = [
    `${decisions} keputusan`,
    `${message.actions.length} tindak lanjut${message.actions.length ? ` (${open} belum selesai)` : ""}`,
  ].join(" · ");
  const version = message.version > 1
    ? `Versi ${message.version} · diperbarui ${stamp(message.at)}${message.changedBy ? ` oleh ${escapeHtml(message.changedBy)}` : ""}`
    : `Versi 1 · dikirim ${stamp(message.at)} lewat WAM`;
  const lines = [
    `📝 <b>MoM · ${escapeHtml(message.departmentShort)} · ${escapeHtml(cut(message.title, 140))}</b>`,
    ...(message.trial ? ["<i>UJI COBA dari WAM, bukan meeting sungguhan.</i>"] : []),
    `Kode: <code>${escapeHtml(message.code)}</code>`,
    "",
    `${escapeHtml(message.department)} · ${longDate(message.date)}`,
    message.from && message.to ? `${message.from}–${message.to} WIB · ${escapeHtml(cut(message.place, 80))}` : escapeHtml(cut(message.place, 80)),
    `${message.notetaker ? `Notulis: ${escapeHtml(message.notetaker)} · ` : ""}${message.participants.length} peserta`,
    counts,
    "",
    "Detail lengkap ada di PDF terlampir.",
    `Buka di WAM: ${escapeHtml(message.link)}`,
    `<i>${version}</i>`,
  ];
  return lines.join("\n");
}
