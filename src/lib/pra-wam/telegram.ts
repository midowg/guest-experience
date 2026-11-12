import { departmentShorts } from "../employees";
import { escapeHtml, minutesCode, type MinutesMessage } from "./minutes-message";

/*
 * MoM lewat Telegram, tahap 1 (12 Nov 2026, migration 202611120002): one bot in one group per
 * department and one shared HOD group. Admin WAM → Telegram makes a one-time code; the bot is added
 * with it (or the command is typed in a group it is already in), and the group is tied to its
 * department. What a webhook update means is decided here, without a server, so it is tested.
 * Tahap 2 (migration 202611120004): a department split into teams (employee_jobs.unit, Sales &
 * Marketing's three) has one group per team instead, and momTargets picks a MoM's groups.
 */

export type TelegramScope = "departemen" | "hod";
export type BotStatus = "admin" | "anggota" | "dikeluarkan";

/** A group the bot posts in. */
export type TelegramGroup = {
  chatId: string; title: string; scope: TelegramScope; department: string | null;
  /** The team inside the department this group stands for (Business Solutions), else null. */
  unit: string | null;
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
  /**
   * One row per group to have: each department of Data karyawan, or, for a department split into
   * teams, each team (Sales & Marketing → Business Solutions, Commercial, ...), with its group name.
   */
  departments: DepartmentGroup[];
};
/** A fresh install code: the link that adds the bot, and the command for a group it is already in. */
export type InstallCode = { scope: TelegramScope; department: string | null; unit: string | null; link: string; command: string; expiresAt: string };
export type DepartmentGroup = { name: string; short: string; unit: string | null; groupTitle: string };

export const INSTALL_MINUTES = 30;
/** 24 random bytes as base64url: 32 characters, inside Telegram's 64 for a start parameter. */
export const INSTALL_CODE = /^[A-Za-z0-9_-]{32}$/;
/** The rights the link asks for when it adds the bot (the admin can untick them). */
export const BOT_RIGHTS = ["delete_messages", "pin_messages", "invite_users", "manage_topics"] as const;
export const MOM_TOPIC = "📝 MoM";
export const HOD_GROUP_TITLE = "Werkudara · HOD";

/**
 * "Werkudara SM · Sales & Marketing"; a one-word department has no short form: "Werkudara · Corporate";
 * a team keeps its department's short form: "Werkudara SM · Business Solutions".
 */
export function groupTitle(department: string, short: string, unit: string | null = null): string {
  const tag = short && short !== department ? `Werkudara ${short}` : "Werkudara";
  return `${tag} · ${unit ?? department}`;
}

const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/**
 * The groups to have, A–Z: a department with teams (from Data karyawan) gets one per team and none
 * of its own; the others one each. Short forms follow Linimasa's rule.
 */
export function departmentGroups(names: readonly string[], units: Readonly<Record<string, readonly string[]>> = {}): DepartmentGroup[] {
  const shorts = departmentShorts(names);
  const teamsOf = (name: string) => [...new Set(Object.entries(units).filter(([department]) => same(department, name)).flatMap(([, list]) => list.map(unit => unit.trim()).filter(Boolean)))]
    .sort((a, b) => a.localeCompare(b, "id"));
  return [...shorts.entries()].sort(([a], [b]) => a.localeCompare(b, "id")).flatMap(([name, short]): DepartmentGroup[] => {
    const teams = teamsOf(name);
    return teams.length ? teams.map(unit => ({ name, short, unit, groupTitle: groupTitle(name, short, unit) }))
      : [{ name, short, unit: null, groupTitle: groupTitle(name, short) }];
  });
}

/** A person's places for MoM: each job's department and team ("" when none). */
export type PersonPlace = { department: string; unit: string };

/**
 * Where a MoM goes (tahap 2): a Meeting HOD or ITEM only to the HOD group; any other meeting to the
 * group of each participant's department or team. Someone without a team in a department split into
 * teams (its GM or HOD) belongs to all of that department's team groups. Each group once.
 */
export function momTargets(groups: readonly TelegramGroup[], places: readonly PersonPlace[], hodMeeting: boolean): TelegramGroup[] {
  const live = groups.filter(group => group.botStatus !== "dikeluarkan");
  if (hodMeeting) return live.filter(group => group.scope === "hod");
  const picked = new Map<string, TelegramGroup>();
  for (const place of places) {
    const ofDepartment = live.filter(group => group.scope === "departemen" && same(group.department, place.department));
    const team = place.unit ? ofDepartment.find(group => same(group.unit, place.unit)) : undefined;
    const whole = ofDepartment.find(group => !group.unit);
    const hits = team ? [team] : whole ? [whole] : place.unit ? [] : ofDepartment;
    for (const group of hits) picked.set(group.chatId, group);
  }
  return [...picked.values()];
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

/**
 * The bot's answer in a group after an install, as Telegram HTML: the department is escaped, as
 * Telegram's HTML rules ask (five departments hold "&"; a bare "& " happens to pass, a "<" would not).
 */
export function installReply(install: { scope: TelegramScope; department: string | null; unit?: string | null; topic: number | null; isForum: boolean }): string {
  const what = install.scope === "hod" ? "MoM meeting antar HOD"
    : `MoM ${escapeHtml(install.department ?? "")}${install.unit ? ` · ${escapeHtml(install.unit)}` : ""}`;
  const where = install.topic ? ` MoM akan masuk ke topik ${MOM_TOPIC}.`
    : install.isForum ? ` Topik ${MOM_TOPIC} belum bisa dibuat: jadikan bot admin dengan hak Kelola topik, lalu tekan Buat topik di Admin WAM.` : "";
  return `✅ Grup ini terpasang di WAM untuk ${what}.${where}`;
}

/** The bot's answer in a private chat (tahap 1: it only posts MoM in groups). */
export const HELP_TEXT = [
  "Halo! Ini bot resmi <b>WAM Werkudara</b>.",
  "",
  "Bot ini mengirim notulen meeting (MoM) dari aplikasi WAM ke grup Telegram departemen. Bot tidak membaca obrolan.",
  "Pertanyaan: hubungi Admin WAM.",
].join("\n");

/** A sample MoM for Admin WAM → Telegram, marked UJI COBA, with placeholder names. */
export function sampleMinutes(group: Pick<TelegramGroup, "scope" | "department" | "unit" | "chatId">, short: string, now: Date, link: string): MinutesMessage {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
  const plus = (days: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(now.getTime() + days * 86_400_000));
  const hod = group.scope === "hod";
  const tag = hod ? "HOD" : short;
  return {
    code: minutesCode(tag, date, `UJI${group.chatId.replace(/\D/g, "").slice(-1)}`),
    title: hod ? "Koordinasi HOD mingguan" : "Review alur kerja tim",
    departmentShort: tag,
    department: hod ? "Grup HOD" : `${group.department ?? ""}${group.unit ? ` · ${group.unit}` : ""}`,
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
