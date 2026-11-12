/*
 * A MoM as one Telegram message (12 Nov 2026, docs/rancangan-mom-telegram.md): readable without
 * opening WAM, neutral when forwarded to a superior (no "kamu"), the department written in full, and
 * a version line at the bottom. Telegram's HTML: only the user's text is escaped, the tags are ours.
 * One message holds 4,096 characters; a long MoM is trimmed (the follow-ups kept first) with a
 * note that the rest is in WAM. Pure, so it is tested without a server.
 */

export type MinutesMessageAction = { task: string; pic: string | null; dueDate: string | null; done: boolean };
export type MinutesMessage = {
  title: string;
  /** The department's short form (SM, CoE) and its full name. */
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
  /** When this version was sent or changed (ISO), and by whom after the first. */
  at: string;
  changedBy?: string | null;
  link: string;
  /** A sample from Admin WAM → Telegram, marked so nobody takes it for a real meeting. */
  trial?: boolean;
};

/** Telegram's limit is 4,096; a margin for the counting differences (emoji, entities). */
export const TELEGRAM_SAFE_LENGTH = 3900;
/** Names shown before "+N lainnya". */
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

const participantsLine = (names: readonly string[]) => {
  const shown = names.slice(0, PARTICIPANTS_SHOWN).map(escapeHtml).join(", ");
  const more = names.length - PARTICIPANTS_SHOWN;
  return `Peserta (${names.length}): ${shown}${more > 0 ? `, +${more} lainnya` : ""}`;
};
const actionLine = (action: MinutesMessageAction) =>
  `${action.done ? "☑" : "☐"} ${escapeHtml(action.task)}${action.pic ? ` — <b>${escapeHtml(action.pic)}</b>` : ""}${action.dueDate ? ` · tenggat ${dueDate(action.dueDate)}` : ""}`;

type Body = { summary: string; decisions: string; actions: readonly MinutesMessageAction[]; moreActions: number; trimmed: boolean };

function render(message: MinutesMessage, body: Body): string {
  const head = [
    `📝 <b>MoM · ${escapeHtml(message.departmentShort)} · ${escapeHtml(message.title)}</b>`,
    ...(message.trial ? ["<i>UJI COBA dari WAM, bukan meeting sungguhan.</i>"] : []),
    "",
    `${escapeHtml(message.department)} · ${longDate(message.date)}`,
    message.from && message.to ? `${message.from}–${message.to} WIB · ${escapeHtml(message.place)}` : escapeHtml(message.place),
    participantsLine(message.participants),
    ...(message.notetaker ? [`Notulis: ${escapeHtml(message.notetaker)}`] : []),
  ];
  const sections: string[][] = [];
  if (body.summary) sections.push(["<b>Ringkasan</b>", escapeHtml(body.summary)]);
  if (body.decisions) sections.push(["<b>Keputusan</b>", escapeHtml(body.decisions)]);
  if (body.actions.length || body.moreActions) {
    sections.push(["<b>Tindak lanjut</b>", ...body.actions.map(actionLine), ...(body.moreActions ? [`+${body.moreActions} tindak lanjut lain di WAM`] : [])]);
  }
  const changed = message.version > 1
    ? `Versi ${message.version} · diperbarui ${stamp(message.at)}${message.changedBy ? ` oleh ${escapeHtml(message.changedBy)}` : ""}`
    : `Versi 1 · dikirim ${stamp(message.at)} lewat WAM`;
  const foot = [
    ...(body.trimmed ? ["<i>Isi lengkapnya ada di WAM.</i>"] : []),
    `Buka di WAM: ${escapeHtml(message.link)}`,
    `<i>${changed}</i>`,
  ];
  return [...head, ...sections.flatMap(section => ["", ...section]), "", ...foot].join("\n");
}

/**
 * The message, and whether it was trimmed to fit. Order of giving way: the summary and decisions
 * shorten first (each keeps a share of the room), then they go, then the follow-ups after the
 * ones that fit become "+N tindak lanjut lain di WAM".
 */
export function minutesTelegramHtml(message: MinutesMessage, limit = TELEGRAM_SAFE_LENGTH): { html: string; trimmed: boolean } {
  const summary = message.summary.trim();
  const decisions = message.decisions.trim();
  const full = render(message, { summary, decisions, actions: message.actions, moreActions: 0, trimmed: false });
  if (visibleLength(full) <= limit) return { html: full, trimmed: false };

  const bare = (actions: readonly MinutesMessageAction[], moreActions: number) => render(message, { summary: "", decisions: "", actions, moreActions, trimmed: true });
  const room = limit - visibleLength(bare(message.actions, 0)) - 40;
  if (room > 200) {
    const total = summary.length + decisions.length;
    const share = (text: string) => text ? cut(text, Math.floor(room * text.length / total)) : "";
    const html = render(message, { summary: share(summary), decisions: share(decisions), actions: message.actions, moreActions: 0, trimmed: true });
    if (visibleLength(html) <= limit) return { html, trimmed: true };
  }
  // Too many follow-ups for any text beside them: keep those that fit.
  let kept = message.actions.length;
  while (kept > 0 && visibleLength(bare(message.actions.slice(0, kept), message.actions.length - kept)) > limit) kept--;
  return { html: bare(message.actions.slice(0, kept), message.actions.length - kept), trimmed: true };
}
