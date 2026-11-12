import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { CAPTION_LIMIT, cut, minutesCaption, minutesFileName, visibleLength, type MinutesMessage } from "@/lib/pra-wam/minutes-message";
import {
  canonicalTitle, departmentGroups, HELP_TEXT, INSTALL_CODE, INSTALL_MINUTES, installCommand, installLink, installReply, MOM_TOPIC, privateLink, readUpdate, sampleMinutes,
  type BotStatus, type GroupChat, type InstallCode, type TelegramGroup, type TelegramScope, type TelegramStatus, type TelegramUpdate,
} from "@/lib/pra-wam/telegram";
import { praWamPath } from "@/lib/routes";
import { shareUrl } from "@/lib/site-url";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { telegramCall, TelegramError, telegramConfig, telegramUpload, telegramUploadMany, webhookSecret, type TelegramConfig } from "../telegram";
import { minutesPdf } from "./minutes-pdf";
import { departmentShorts } from "@/lib/employees";
import { leadOptions } from "./leads";

/*
 * MoM lewat Telegram, tahap 1 (12 Nov 2026, migration 202611120002): Admin WAM → Telegram reads the
 * bot and its webhook, makes one-time install codes, and sends a sample MoM; the webhook ties a
 * group to its department and follows the bot's place in it. Sending the real MoM from the
 * notetaker's panel comes next, on top of the groups kept here.
 */

export const TELEGRAM_MIGRATION = "202611120002_pw_telegram.sql";
const missing = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") || /pw_telegram_/.test(error.message ?? "");
const waiting = () => new ServiceError(503, `Grup Telegram menunggu migrasi ${TELEGRAM_MIGRATION}.`);
const noBot = () => new ServiceError(503, "Bot Telegram belum disiapkan. Isi TELEGRAM_BOT_TOKEN di environment server.");
const hash = (code: string) => createHash("sha256").update(code).digest("hex");
const say = (error: unknown) => error instanceof TelegramError ? error.description : error instanceof Error ? error.message : "galat";

type GroupRow = {
  chat_id: number | string; title: string; scope: TelegramScope; department: string | null; unit?: string | null; is_forum: boolean;
  mom_topic_id: number | null; bot_status: BotStatus; installed_at: string;
};
const BASE_COLUMNS = "chat_id,title,scope,department,is_forum,mom_topic_id,bot_status,installed_at";
/** With the team column of migration 202611120004; before it, groups have none. */
const GROUP_COLUMNS = `${BASE_COLUMNS},unit`;
const toGroup = (row: GroupRow): TelegramGroup => ({
  chatId: String(row.chat_id), title: row.title, scope: row.scope, department: row.department, unit: row.unit?.trim() || null, isForum: row.is_forum,
  momTopicId: row.mom_topic_id, botStatus: row.bot_status, installedAt: row.installed_at,
});

function requireBot(): TelegramConfig {
  const config = telegramConfig();
  if (!config) throw noBot();
  return config;
}
/** The bot's username: from the environment, else asked of Telegram. */
async function botUsername(config: TelegramConfig): Promise<string> {
  if (config.username) return config.username;
  return (await telegramCall<{ username: string }>(config, "getMe")).username;
}
const botId = (config: TelegramConfig) => Number(config.token.split(":")[0]);

const columnMissing = (error: { code?: string; message?: string }) => ["42703", "PGRST204"].includes(error.code ?? "") || /\bunit\b/.test(error.message ?? "");
/** Whether migration 202611120004 (teams, MoM sending) has run. */
export async function teamsReady(): Promise<boolean> {
  const { error } = await createPrivilegedClient().from("pw_telegram_groups").select("unit").limit(1);
  return !error;
}

/** The groups WAM posts in; before migration 202611120002, none. */
export async function listGroups(): Promise<{ migrated: boolean; groups: TelegramGroup[] }> {
  const client = createPrivilegedClient();
  const first = await client.from("pw_telegram_groups").select(GROUP_COLUMNS).eq("active", true).order("installed_at");
  let rows = first.data as GroupRow[] | null, error = first.error;
  if (error && columnMissing(error)) {
    const second = await client.from("pw_telegram_groups").select(BASE_COLUMNS).eq("active", true).order("installed_at");
    rows = second.data as GroupRow[] | null; error = second.error;
  }
  if (error) { if (missing(error)) return { migrated: false, groups: [] }; databaseError(error); }
  return { migrated: true, groups: (rows ?? []).map(toGroup) };
}

/** The teams of each department (employee_jobs.unit of active people), for groups per team. */
export async function teamsByDepartment(): Promise<Record<string, string[]>> {
  const client = createPrivilegedClient();
  const [{ data: jobs, error }, { data: people }] = await Promise.all([
    client.from("employee_jobs").select("employee_id,department,unit").neq("unit", "").limit(5000),
    client.from("employees").select("id").eq("active", true).limit(5000),
  ]);
  if (error || !jobs) return {};
  const active = new Set((people ?? []).map(row => row.id as string));
  const teams: Record<string, Set<string>> = {};
  for (const job of jobs as { employee_id: string; department: string; unit: string | null }[]) {
    const unit = job.unit?.trim();
    if (!unit || !active.has(job.employee_id)) continue;
    (teams[job.department.trim()] ??= new Set()).add(unit);
  }
  return Object.fromEntries(Object.entries(teams).map(([department, units]) => [department, [...units]]));
}

/**
 * Each group's current title and invite address, from Telegram (13 Nov 2026): getChat gives both
 * (the address once there is one); a group without one gets its address from exportChatInviteLink,
 * which the bot may do as an admin with "invite users". A title changed in Telegram is kept here
 * too. Read again after half an hour; a group Telegram cannot answer for keeps what it has.
 */
const CHAT_FRESH_MS = 30 * 60_000;
const chats = new Map<string, { at: number; title: string; link: string | null }>();
export async function withChatInfo(groups: readonly TelegramGroup[], now = Date.now()): Promise<TelegramGroup[]> {
  const config = telegramConfig();
  if (!config) return [...groups];
  return Promise.all(groups.map(async group => {
    // The CoS's own chat has no address and no members to ask about.
    if (group.scope === "cos") return { ...group, inviteLink: null };
    const kept = chats.get(group.chatId);
    if (kept && now - kept.at < CHAT_FRESH_MS) return { ...group, title: kept.title, inviteLink: kept.link };
    if (group.botStatus === "dikeluarkan") return { ...group, inviteLink: null };
    const [chat, status] = await Promise.all([
      telegramCall<{ title?: string; invite_link?: string; is_forum?: boolean }>(config, "getChat", { chat_id: group.chatId }).catch(() => null),
      // The bot's standing as it is now: a promotion the webhook missed (the group moved to a supergroup meanwhile) is caught here.
      botStatusIn(config, Number(group.chatId)),
    ]);
    if (!chat) return { ...group, inviteLink: kept?.link ?? null };
    let link = chat.invite_link ?? null;
    if (!link && status === "admin") link = await telegramCall<string>(config, "exportChatInviteLink", { chat_id: group.chatId }).catch(() => null);
    const title = chat.title?.trim() || group.title;
    if (title !== group.title || status !== group.botStatus) {
      await createPrivilegedClient().from("pw_telegram_groups").update({ title, bot_status: status, updated_at: new Date(now).toISOString() }).eq("chat_id", group.chatId);
    }
    chats.set(group.chatId, { at: now, title, link });
    return { ...group, title, botStatus: status, inviteLink: link };
  }));
}

/** Admin WAM → Telegram: the bot, its webhook, the groups and the departments. */
export async function telegramStatus(): Promise<TelegramStatus> {
  const config = telegramConfig();
  const [{ migrated, groups }, names, teams, ready] = await Promise.all([
    listGroups(), leadOptions().then(options => options.departments).catch(() => [] as string[]), teamsByDepartment().catch(() => ({})), teamsReady().catch(() => false),
  ]);
  // Groups per team need migration 202611120004; before it, one per department.
  const base: TelegramStatus = { configured: !!config, bot: null, botError: null, webhook: null, migrated, groups, departments: departmentGroups(names, ready ? teams : {}) };
  if (!config) return base;
  try {
    const [me, hook] = await Promise.all([
      telegramCall<{ username: string; first_name: string }>(config, "getMe"),
      telegramCall<{ url: string; pending_update_count: number; last_error_message?: string; last_error_date?: number }>(config, "getWebhookInfo"),
    ]);
    return {
      ...base, groups: await withChatInfo(groups), bot: { username: me.username, name: me.first_name },
      webhook: {
        set: !!hook.url, ours: hook.url === webhookUrl(), pending: hook.pending_update_count,
        lastError: hook.last_error_message ?? null, lastErrorAt: hook.last_error_date ? new Date(hook.last_error_date * 1000).toISOString() : null,
      },
    };
  } catch (error) {
    return { ...base, botError: say(error) };
  }
}

const webhookUrl = () => new URL("/api/telegram/webhook", shareUrl()).toString();

/** Points the bot at this site's webhook, with the secret derived from the token. */
export async function installWebhook(): Promise<void> {
  const config = requireBot();
  await telegramCall(config, "setWebhook", {
    url: webhookUrl(), secret_token: webhookSecret(config.token), allowed_updates: ["message", "my_chat_member"], max_connections: 10,
  });
}

/** A one-time code to tie a group to a department or one of its teams (or to the HOD group), valid for 30 minutes. */
export async function createInstallCode(scope: TelegramScope, department: string | null, unit: string | null = null, now = new Date()): Promise<InstallCode> {
  const config = requireBot();
  const name = scope === "departemen" ? department?.trim() ?? "" : null;
  const team = scope === "departemen" ? unit?.trim() || null : null;
  if (scope === "departemen") {
    const known = (await leadOptions()).departments;
    if (!name || !known.some(item => item.toLowerCase() === name.toLowerCase())) throw new ServiceError(422, "Departemen tidak ada di Data karyawan.");
    const ready = await teamsReady();
    const teams = ready ? Object.entries(await teamsByDepartment()).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? [] : [];
    if (team && !teams.some(item => item.toLowerCase() === team.toLowerCase())) throw new ServiceError(422, `${team} tidak ada sebagai unit ${name} di Data karyawan.`);
    if (!team && teams.length) throw new ServiceError(422, `${name} dibagi per unit. Pasang grup untuk tiap unitnya.`);
  }
  const code = randomBytes(24).toString("base64url");
  const expiresAt = new Date(now.getTime() + INSTALL_MINUTES * 60_000).toISOString();
  const client = createPrivilegedClient();
  // Codes over a day past their end are of no use, even to explain a refusal.
  await client.from("pw_telegram_codes").delete().lt("expires_at", new Date(now.getTime() - 86_400_000).toISOString());
  const { error } = await client.from("pw_telegram_codes").insert({ code_hash: hash(code), scope, department: name, expires_at: expiresAt, ...(team ? { unit: team } : {}) });
  // Before migration 202611130002 the scope check refuses "cos".
  if (error && scope === "cos" && error.code === "23514") throw new ServiceError(503, "Chat CoS menunggu migrasi 202611130002_pw_telegram_cos.sql.");
  if (error) { if (missing(error)) throw waiting(); databaseError(error); }
  const username = await botUsername(config);
  // The CoS's chat: the link opens the bot, and Start sends the code from that person's own chat.
  if (scope === "cos") return { scope, department: null, unit: null, link: privateLink(username, code), command: `/start ${code}`, expiresAt };
  return { scope, department: name, unit: team, link: installLink(username, code), command: installCommand(username, code), expiresAt };
}

async function send(config: TelegramConfig, chatId: number | string, html: string, threadId?: number | null) {
  return telegramCall<{ message_id: number }>(config, "sendMessage", {
    chat_id: chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...(threadId ? { message_thread_id: threadId } : {}),
  });
}

/** 21.00–07.00 WIB: a MoM still arrives, without a sound. */
export const quietHour = (now: Date) => { const hour = (now.getUTCHours() + 7) % 24; return hour >= 21 || hour < 7; };

/** A MoM's post in a group: where it went (the id may move when the group became a supergroup). */
export type Posted = { chatId: string; messageId: number; topicLost: boolean };

/**
 * Posts a MoM in a group as one message: the PDF with its caption, in the MoM topic when there is
 * one. With an earlier message, that message is changed in place instead (Telegram does not ring
 * for a change); when it is gone, a new one is sent. A group that moved follows its new id, a topic
 * that is gone falls back to the group, and a bot that was removed is marked so.
 */
export async function postMinutes(group: TelegramGroup, message: MinutesMessage, earlier: number | null, now = new Date(), pdf?: Uint8Array): Promise<Posted> {
  const config = requireBot();
  const bytes = pdf ?? await minutesPdf(message);
  let caption = minutesCaption(message);
  if (visibleLength(caption) > CAPTION_LIMIT) caption = minutesCaption({ ...message, title: cut(message.title, 60), place: cut(message.place, 40) });
  const file = { field: "document", name: minutesFileName(message), bytes, type: "application/pdf" };
  const client = createPrivilegedClient();
  let chatId = group.chatId, topic = group.momTopicId, topicLost = false;

  const send = async (): Promise<number> => (await telegramUpload<{ message_id: number }>(config, "sendDocument", {
    chat_id: chatId, caption, parse_mode: "HTML", ...(topic ? { message_thread_id: topic } : {}), ...(quietHour(now) ? { disable_notification: true } : {}),
  }, file)).message_id;
  const edit = async (messageId: number): Promise<number> => {
    await telegramUpload(config, "editMessageMedia", {
      chat_id: chatId, message_id: messageId, media: { type: "document", media: "attach://document", caption, parse_mode: "HTML" },
    }, file);
    return messageId;
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (earlier) {
        try { return { chatId, messageId: await edit(earlier), topicLost }; }
        catch (error) {
          if (error instanceof TelegramError && error.unchanged) return { chatId, messageId: earlier, topicLost };
          if (!(error instanceof TelegramError && /not found|can't be edited|MESSAGE_ID_INVALID/i.test(error.description))) throw error;
          earlier = null; // The message was deleted in the group: send it anew.
        }
      }
      return { chatId, messageId: await send(), topicLost };
    } catch (error) {
      if (!(error instanceof TelegramError)) throw new ServiceError(502, say(error));
      if (error.migrateTo) {
        await client.from("pw_telegram_groups").update({ chat_id: error.migrateTo, updated_at: now.toISOString() }).eq("chat_id", chatId);
        chatId = String(error.migrateTo); earlier = null;
      } else if (error.gone) {
        await client.from("pw_telegram_groups").update({ bot_status: "dikeluarkan", updated_at: now.toISOString() }).eq("chat_id", chatId);
        throw new ServiceError(409, `Bot sudah tidak ada di grup ${group.title}. Pasang ulang bot ke grup itu.`);
      } else if (topic && /thread|topic/i.test(error.description)) {
        // The topic was deleted or closed to the bot: post in the group, and forget the topic.
        await client.from("pw_telegram_groups").update({ mom_topic_id: null, updated_at: now.toISOString() }).eq("chat_id", chatId);
        topic = null; topicLost = true; earlier = null;
      } else if (error.retryAfter && error.retryAfter <= 5) {
        await new Promise(resolve => setTimeout(resolve, error.retryAfter! * 1000));
      } else throw new ServiceError(502, `Telegram menolak: ${error.description}`);
    }
  }
  throw new ServiceError(502, `Telegram belum menerima MoM untuk ${group.title}. Coba kirim ulang.`);
}

/** Opens the "📝 MoM" topic in a group with topics, when the bot may; null when it may not. */
async function openTopic(config: TelegramConfig, chatId: number): Promise<number | null> {
  try { return (await telegramCall<{ message_thread_id: number }>(config, "createForumTopic", { chat_id: chatId, name: MOM_TOPIC })).message_thread_id; }
  catch { return null; }
}

async function botStatusIn(config: TelegramConfig, chatId: number): Promise<BotStatus> {
  try {
    const member = await telegramCall<{ status: string }>(config, "getChatMember", { chat_id: chatId, user_id: botId(config) });
    return member.status === "administrator" ? "admin" : member.status === "left" || member.status === "kicked" ? "dikeluarkan" : "anggota";
  } catch { return "anggota"; }
}

/** Ties a group to the code's department; a department's earlier group stops receiving. */
async function install(config: TelegramConfig, chat: GroupChat, code: string, now: Date): Promise<string> {
  if (!INSTALL_CODE.test(code)) return "Kode pemasangan tidak dikenali. Buat tautan baru di Admin WAM → Telegram.";
  const client = createPrivilegedClient();
  let { data: row, error } = await client.from("pw_telegram_codes").select("scope,department,unit,expires_at,used_at").eq("code_hash", hash(code)).maybeSingle();
  if (error && columnMissing(error)) ({ data: row, error } = await client.from("pw_telegram_codes").select("scope,department,expires_at,used_at").eq("code_hash", hash(code)).maybeSingle());
  if (error) { if (missing(error)) return "Grup Telegram belum siap di WAM (menunggu migrasi)."; databaseError(error); }
  if (!row || row.used_at || Date.parse(row.expires_at) < now.getTime()) return "Kode pemasangan tidak dikenali atau sudah kedaluwarsa. Buat tautan baru di Admin WAM → Telegram.";
  const scope = row.scope as TelegramScope;
  // A CoS code is for a person's own chat with the bot; the others for a group.
  if (scope === "cos" && !chat.private) return "Kode ini untuk chat pribadi CoS dengan bot, bukan untuk grup. Buka tautannya dari akun Telegram CoS.";
  if (scope !== "cos" && chat.private) return "Kode ini untuk grup. Tambahkan bot ke grup departemennya, lalu kirim kodenya di grup itu.";
  const department = row.department as string | null;
  const unit = ((row as { unit?: string | null }).unit ?? "").trim() || null;
  // Mark the code used first, so a repeated update cannot install twice.
  const { data: claimed, error: claimError } = await client.from("pw_telegram_codes").update({ used_at: now.toISOString(), used_chat_id: chat.id })
    .eq("code_hash", hash(code)).is("used_at", null).select("code_hash");
  if (claimError) databaseError(claimError);
  if (!claimed?.length) return "Kode ini sudah dipakai. Buat tautan baru di Admin WAM → Telegram.";
  // The department's (or HOD's) earlier group, and this chat's earlier place, step aside.
  const earlier = client.from("pw_telegram_groups").update({ active: false, updated_at: now.toISOString() }).eq("active", true).eq("scope", scope).neq("chat_id", chat.id);
  const like = (text: string) => text.replace(/[\\%_]/g, "\\$&");
  // The same department and team: a team's group leaves the department's other teams alone.
  const sameSpot = !department ? earlier : unit ? earlier.ilike("department", like(department)).ilike("unit", like(unit)) : earlier.ilike("department", like(department));
  const { error: clearError } = await sameSpot;
  if (clearError) databaseError(clearError);
  const status = chat.private ? "admin" : await botStatusIn(config, chat.id);
  const { data: before } = await client.from("pw_telegram_groups").select("mom_topic_id").eq("chat_id", chat.id).maybeSingle();
  const topic = chat.isForum ? before?.mom_topic_id ?? await openTopic(config, chat.id) : null;
  const { error: saveError } = await client.from("pw_telegram_groups").upsert({
    chat_id: chat.id, title: chat.title, scope, department, is_forum: chat.isForum, mom_topic_id: topic, bot_status: status,
    active: true, installed_at: now.toISOString(), updated_at: now.toISOString(), ...(unit ? { unit } : {}),
  }, { onConflict: "chat_id" });
  if (saveError) databaseError(saveError);
  return installReply({ scope, department, unit, topic, isForum: chat.isForum });
}

/** After a group became a supergroup (Topics turned on, say): its row follows the new id, with the new chat's title and topics. */
async function migrate(config: TelegramConfig, from: number, to: number, now: Date) {
  const client = createPrivilegedClient();
  const { data } = await client.from("pw_telegram_groups").select("chat_id").eq("chat_id", from).maybeSingle();
  if (!data) return;
  const chat = await telegramCall<{ title?: string; is_forum?: boolean }>(config, "getChat", { chat_id: to }).catch(() => null);
  // A row left over for the new id (an earlier install that was let go) gives way.
  await client.from("pw_telegram_groups").delete().eq("chat_id", to).eq("active", false);
  const { error } = await client.from("pw_telegram_groups").update({
    chat_id: to, ...(chat ? { title: chat.title ?? "", is_forum: !!chat.is_forum } : {}), updated_at: now.toISOString(),
  }).eq("chat_id", from);
  if (error) databaseError(error);
}

/** One webhook update. Never throws: Telegram would only send it again. */
export async function handleUpdate(update: TelegramUpdate, now = new Date()): Promise<void> {
  const config = telegramConfig();
  if (!config) return;
  try {
    const intent = readUpdate(update, await botUsername(config));
    const client = createPrivilegedClient();
    if (intent.kind === "install") {
      // A failure still answers in the group, so the admin knows to make a new link.
      const reply = await install(config, intent.chat, intent.code, now).catch(error => {
        console.error("telegram install", say(error));
        return "Pemasangan gagal di WAM. Buat tautan baru di Admin WAM → Telegram, lalu coba lagi.";
      });
      await send(config, intent.chat.id, reply).catch(error => console.error("telegram install reply", say(error)));
    } else if (intent.kind === "migrate") {
      await migrate(config, intent.from, intent.to, now);
    } else if (intent.kind === "bot-status") {
      const { data } = await client.from("pw_telegram_groups").select("mom_topic_id").eq("chat_id", intent.chat.id).maybeSingle();
      if (!data) return;
      const topic = data.mom_topic_id ?? (intent.status === "admin" && intent.chat.isForum ? await openTopic(config, intent.chat.id) : null);
      await client.from("pw_telegram_groups").update({
        bot_status: intent.status, title: intent.chat.title, is_forum: intent.chat.isForum, mom_topic_id: topic, updated_at: now.toISOString(),
      }).eq("chat_id", intent.chat.id);
    } else if (intent.kind === "help") {
      await send(config, intent.chatId, HELP_TEXT);
    }
  } catch (error) {
    console.error("telegram webhook", say(error));
  }
}

async function activeGroup(chatId: string): Promise<TelegramGroup> {
  if (!/^-?\d{1,20}$/.test(chatId)) throw new ServiceError(422, "Grup tidak dikenali.");
  const { groups, migrated } = await listGroups();
  if (!migrated) throw waiting();
  const group = groups.find(item => item.chatId === chatId);
  if (!group) throw new ServiceError(404, "Grup ini tidak lagi terpasang. Muat ulang halaman.");
  return group;
}

/** Sends a sample MoM (marked UJI COBA) to a group, as the real ones go: a PDF with its caption, in the MoM topic. */
export async function sendSample(chatId: string, now = new Date()): Promise<string> {
  requireBot();
  const group = await activeGroup(chatId);
  const short = departmentGroups(group.department ? [group.department] : [])[0]?.short ?? "";
  const posted = await postMinutes(group, sampleMinutes(group, short, now, new URL(praWamPath.home, shareUrl()).toString().replace(/^https?:\/\//, "")), null, now);
  if (posted.topicLost) return `Contoh MoM terkirim ke ${group.title}, tetapi tidak di topik ${MOM_TOPIC} (topiknya tidak bisa dipakai bot). Tekan Buat topik untuk membuatnya lagi.`;
  return `Contoh MoM (PDF) terkirim ke ${group.title}${group.momTopicId ? ` (topik ${MOM_TOPIC})` : ""}.`;
}

/** Opens the MoM topic for a group that turned on topics after it was installed. */
export async function ensureTopic(chatId: string, now = new Date()): Promise<string> {
  const config = requireBot();
  const group = await activeGroup(chatId);
  const chat = await telegramCall<{ is_forum?: boolean; title?: string }>(config, "getChat", { chat_id: group.chatId }).catch(error => { throw new ServiceError(502, say(error)); });
  if (!chat.is_forum) throw new ServiceError(409, `${group.title} belum memakai topik. Di Telegram: info grup → Edit → nyalakan Topics, lalu coba lagi.`);
  const topic = await openTopic(config, Number(group.chatId));
  if (!topic) throw new ServiceError(409, `Bot belum boleh membuat topik di ${group.title}. Jadikan bot admin dengan hak Kelola topik.`);
  const { error } = await createPrivilegedClient().from("pw_telegram_groups")
    .update({ is_forum: true, mom_topic_id: topic, title: chat.title ?? group.title, updated_at: now.toISOString() }).eq("chat_id", group.chatId);
  if (error) databaseError(error);
  return `Topik ${MOM_TOPIC} dibuat di ${group.title}.`;
}

/** Stops posting MoM to a group; the bot stays in it until someone removes it. */
/** The short forms of every department of Data karyawan, as the group names use them. */
export async function groupShorts(): Promise<Map<string, string>> {
  return departmentShorts(await leadOptions().then(options => options.departments).catch(() => [] as string[]));
}

/**
 * Gives a group its WAM name in Telegram (13 Nov 2026): "WG {short} · {full name}". The bot may do it
 * as an admin with "change group info"; without that right, the admin is told the name to type.
 */
export async function renameGroup(chatId: string, now = new Date()): Promise<string> {
  const config = requireBot();
  const group = await activeGroup(chatId);
  const title = canonicalTitle(group, await groupShorts());
  if (title === group.title) return `Nama grup sudah ${title}.`;
  try { await telegramCall(config, "setChatTitle", { chat_id: group.chatId, title }); }
  catch (error) {
    if (error instanceof TelegramError && /rights|admin|forbidden|not enough/i.test(error.description)) {
      throw new ServiceError(409, `Bot belum boleh mengganti nama grup. Ganti nama grup di Telegram jadi "${title}", atau jadikan bot admin dengan hak Ubah info grup.`);
    }
    throw new ServiceError(502, `Telegram menolak: ${say(error)}`);
  }
  const { error } = await createPrivilegedClient().from("pw_telegram_groups").update({ title, updated_at: now.toISOString() }).eq("chat_id", group.chatId);
  if (error) databaseError(error);
  chats.delete(group.chatId);
  return `Nama grup diganti jadi ${title}.`;
}

export async function removeGroup(chatId: string, now = new Date()): Promise<string> {
  const group = await activeGroup(chatId);
  const { error } = await createPrivilegedClient().from("pw_telegram_groups").update({ active: false, updated_at: now.toISOString() }).eq("chat_id", group.chatId);
  if (error) databaseError(error);
  return `${group.title} dilepas dari WAM. MoM tidak dikirim ke sana lagi.`;
}

/**
 * The meeting's photos in the group, under its MoM (13 Nov 2026): one album of up to ten, in the MoM
 * topic, without a sound (the MoM just rang). Sent once, when the MoM first reaches the group; the
 * PDF keeps every photo for later versions.
 */
export async function sendMinutePhotos(group: TelegramGroup, chatId: string, code: string, photos: readonly Uint8Array[]): Promise<void> {
  if (!photos.length) return;
  const config = requireBot();
  const files = photos.slice(0, 10).map((bytes, index) => ({ field: `foto${index}`, name: `foto-${index + 1}.jpg`, bytes, type: "image/jpeg" }));
  const media = files.map((file, index) => ({ type: "photo", media: `attach://${file.field}`, ...(index === 0 ? { caption: `📷 Foto meeting · ${code}` } : {}) }));
  await telegramUploadMany(config, "sendMediaGroup", {
    chat_id: chatId, media, disable_notification: true, ...(group.momTopicId ? { message_thread_id: group.momTopicId } : {}),
  }, files);
}
