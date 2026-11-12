import { departmentShorts } from "../employees";
import type { MinutesMessage } from "./minutes-message";

/*
 * MoM lewat Telegram, tahap 1 (12 Nov 2026, migration 202611120002): one bot in one group per
 * department and one shared HOD group. Admin WAM → Telegram makes a one-time code; the bot is added
 * with it (or the command is typed in a group it is already in), and the group is tied to its
 * department. What a webhook update means is decided here, without a server, so it is tested.
 */

export type TelegramScope = "departemen" | "hod";
export type BotStatus = "admin" | "anggota" | "dikeluarkan";

/** A group the bot posts in. */
export type TelegramGroup = {
  chatId: string; title: string; scope: TelegramScope; department: string | null;
  isForum: boolean; momTopicId: number | null; botStatus: BotStatus; installedAt: string;
};
/** Admin WAM → Telegram. */
export type TelegramStatus = {
  /** TELEGRAM_BOT_TOKEN is set on the server. */
  configured: boolean;
  bot: { username: string; name: string } | null;
  /** The bot's own answer when getMe failed (a wrong token), else null. */
  botError: string | null;
  webhook: { set: boolean; ours: boolean; pending: number; lastError: string | null; lastErrorAt: string | null } | null;
  migrated: boolean;
  groups: TelegramGroup[];
  /** The departments of Data karyawan, each with the group name to give it. */
  departments: { name: string; short: string; groupTitle: string }[];
};
/** A fresh install code: the link that adds the bot, and the command for a group it is already in. */
export type InstallCode = { scope: TelegramScope; department: string | null; link: string; command: string; expiresAt: string };

export const INSTALL_MINUTES = 30;
/** 24 random bytes as base64url: 32 characters, inside Telegram's 64 for a start parameter. */
export const INSTALL_CODE = /^[A-Za-z0-9_-]{32}$/;
/** The rights the link asks for when it adds the bot (the admin can untick them). */
export const BOT_RIGHTS = ["delete_messages", "pin_messages", "invite_users", "manage_topics"] as const;
export const MOM_TOPIC = "📝 MoM";
export const HOD_GROUP_TITLE = "Werkudara · HOD";

/** "Werkudara SM · Sales & Marketing"; a one-word department has no short form: "Werkudara · Corporate". */
export function groupTitle(department: string, short: string): string {
  return short && short !== department ? `Werkudara ${short} · ${department}` : `Werkudara · ${department}`;
}

/** The departments with their short forms (the same rule as Linimasa) and group names, A–Z. */
export function departmentGroups(names: readonly string[]): TelegramStatus["departments"] {
  const shorts = departmentShorts(names);
  return [...shorts.entries()].sort(([a], [b]) => a.localeCompare(b, "id"))
    .map(([name, short]) => ({ name, short, groupTitle: groupTitle(name, short) }));
}

export const installLink = (username: string, code: string) => `https://t.me/${username}?startgroup=${code}&admin=${BOT_RIGHTS.join("+")}`;
export const installCommand = (username: string, code: string) => `/start@${username} ${code}`;

/** The parts of Telegram's Update this app reads. */
type Chat = { id: number; type: "private" | "group" | "supergroup" | "channel"; title?: string; is_forum?: boolean };
export type TelegramUpdate = {
  update_id: number;
  message?: { chat: Chat; text?: string; migrate_to_chat_id?: number; message_thread_id?: number };
  my_chat_member?: { chat: Chat; new_chat_member: { status: string } };
};
export type GroupChat = { id: number; title: string; isForum: boolean };
export type UpdateIntent =
  | { kind: "install"; chat: GroupChat; code: string }
  | { kind: "migrate"; from: number; to: number }
  | { kind: "bot-status"; chat: GroupChat; status: BotStatus }
  | { kind: "help"; chatId: number }
  | { kind: "ignore" };

const isGroup = (chat: Chat) => chat.type === "group" || chat.type === "supergroup";
const groupChat = (chat: Chat): GroupChat => ({ id: chat.id, title: chat.title ?? "", isForum: !!chat.is_forum });
const START = /^\/start(?:@([A-Za-z0-9_]+))?(?:\s+(\S+))?\s*$/;

/** What an update asks of the bot. Group chatter never reaches it (privacy mode); anything unknown is ignored. */
export function readUpdate(update: TelegramUpdate, botUsername: string): UpdateIntent {
  const member = update.my_chat_member;
  if (member && isGroup(member.chat)) {
    const status = member.new_chat_member.status;
    return {
      kind: "bot-status", chat: groupChat(member.chat),
      status: status === "administrator" ? "admin" : status === "left" || status === "kicked" ? "dikeluarkan" : "anggota",
    };
  }
  const message = update.message;
  if (!message) return { kind: "ignore" };
  if (message.migrate_to_chat_id && isGroup(message.chat)) return { kind: "migrate", from: message.chat.id, to: message.migrate_to_chat_id };
  const start = message.text?.trim().match(START);
  if (isGroup(message.chat)) {
    if (!start || !start[2]) return { kind: "ignore" };
    if (start[1] && start[1].toLowerCase() !== botUsername.toLowerCase()) return { kind: "ignore" };
    return { kind: "install", chat: groupChat(message.chat), code: start[2] };
  }
  if (message.chat.type === "private" && message.text) return { kind: "help", chatId: message.chat.id };
  return { kind: "ignore" };
}

/** The bot's answer in a private chat (tahap 1: it only posts MoM in groups). */
export const HELP_TEXT = [
  "Halo! Ini bot resmi <b>WAM Werkudara</b>.",
  "",
  "Bot ini mengirim notulen meeting (MoM) dari aplikasi WAM ke grup Telegram departemen. Bot tidak membaca obrolan.",
  "Pertanyaan: hubungi Admin WAM.",
].join("\n");

/** A sample MoM for Admin WAM → Telegram, marked UJI COBA, with placeholder names. */
export function sampleMinutes(group: Pick<TelegramGroup, "scope" | "department">, short: string, now: Date, link: string): MinutesMessage {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
  const plus = (days: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(now.getTime() + days * 86_400_000));
  const hod = group.scope === "hod";
  return {
    title: hod ? "Koordinasi HOD mingguan" : "Review alur kerja tim",
    departmentShort: hod ? "HOD" : short,
    department: hod ? "Grup HOD" : group.department ?? "",
    date, from: "09.00", to: "10.00", place: "Ruang Rapat 1",
    participants: ["Peserta 1", "Peserta 2", "Peserta 3", "Peserta 4"], notetaker: "Peserta 1",
    summary: "Alur kerja tim dibahas dari brief sampai serah terima. Tahap persetujuan paling sering terlambat & perlu batas waktu yang jelas.",
    decisions: "1. Persetujuan paling lama 2 hari kerja.\n2. Checklist alur kerja dipakai mulai bulan depan.",
    actions: [
      { task: "Susun checklist alur kerja", pic: "Peserta 2", dueDate: plus(8), done: false },
      { task: "Sosialisasi checklist ke tim", pic: "Peserta 3", dueDate: plus(14), done: false },
      { task: "Rekap keterlambatan bulan lalu", pic: "Peserta 4", dueDate: null, done: true },
    ],
    version: 1, at: now.toISOString(), link, trial: true,
  };
}
