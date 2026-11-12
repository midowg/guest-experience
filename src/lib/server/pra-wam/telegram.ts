import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { minutesTelegramHtml } from "@/lib/pra-wam/minutes-message";
import {
  departmentGroups, HELP_TEXT, INSTALL_CODE, INSTALL_MINUTES, installCommand, installLink, MOM_TOPIC, readUpdate, sampleMinutes,
  type BotStatus, type GroupChat, type InstallCode, type TelegramGroup, type TelegramScope, type TelegramStatus, type TelegramUpdate,
} from "@/lib/pra-wam/telegram";
import { praWamPath } from "@/lib/routes";
import { shareUrl } from "@/lib/site-url";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { telegramCall, TelegramError, telegramConfig, webhookSecret, type TelegramConfig } from "../telegram";
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
  chat_id: number | string; title: string; scope: TelegramScope; department: string | null; is_forum: boolean;
  mom_topic_id: number | null; bot_status: BotStatus; installed_at: string;
};
const GROUP_COLUMNS = "chat_id,title,scope,department,is_forum,mom_topic_id,bot_status,installed_at";
const toGroup = (row: GroupRow): TelegramGroup => ({
  chatId: String(row.chat_id), title: row.title, scope: row.scope, department: row.department, isForum: row.is_forum,
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

async function listGroups(): Promise<{ migrated: boolean; groups: TelegramGroup[] }> {
  const { data, error } = await createPrivilegedClient().from("pw_telegram_groups").select(GROUP_COLUMNS).eq("active", true).order("installed_at");
  if (error) { if (missing(error)) return { migrated: false, groups: [] }; databaseError(error); }
  return { migrated: true, groups: ((data ?? []) as GroupRow[]).map(toGroup) };
}

/** Admin WAM → Telegram: the bot, its webhook, the groups and the departments. */
export async function telegramStatus(): Promise<TelegramStatus> {
  const config = telegramConfig();
  const [{ migrated, groups }, names] = await Promise.all([listGroups(), leadOptions().then(options => options.departments).catch(() => [] as string[])]);
  const base: TelegramStatus = { configured: !!config, bot: null, botError: null, webhook: null, migrated, groups, departments: departmentGroups(names) };
  if (!config) return base;
  try {
    const [me, hook] = await Promise.all([
      telegramCall<{ username: string; first_name: string }>(config, "getMe"),
      telegramCall<{ url: string; pending_update_count: number; last_error_message?: string; last_error_date?: number }>(config, "getWebhookInfo"),
    ]);
    return {
      ...base, bot: { username: me.username, name: me.first_name },
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

/** A one-time code to tie a group to a department (or to the HOD group), valid for 30 minutes. */
export async function createInstallCode(scope: TelegramScope, department: string | null, now = new Date()): Promise<InstallCode> {
  const config = requireBot();
  const name = scope === "departemen" ? department?.trim() ?? "" : null;
  if (scope === "departemen") {
    const known = (await leadOptions()).departments;
    if (!name || !known.some(item => item.toLowerCase() === name.toLowerCase())) throw new ServiceError(422, "Departemen tidak ada di Data karyawan.");
  }
  const code = randomBytes(24).toString("base64url");
  const expiresAt = new Date(now.getTime() + INSTALL_MINUTES * 60_000).toISOString();
  const { error } = await createPrivilegedClient().from("pw_telegram_codes").insert({ code_hash: hash(code), scope, department: name, expires_at: expiresAt });
  if (error) { if (missing(error)) throw waiting(); databaseError(error); }
  const username = await botUsername(config);
  return { scope, department: name, link: installLink(username, code), command: installCommand(username, code), expiresAt };
}

async function send(config: TelegramConfig, chatId: number | string, html: string, threadId?: number | null) {
  return telegramCall<{ message_id: number }>(config, "sendMessage", {
    chat_id: chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...(threadId ? { message_thread_id: threadId } : {}),
  });
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
  const { data: row, error } = await client.from("pw_telegram_codes").select("scope,department,expires_at,used_at").eq("code_hash", hash(code)).maybeSingle();
  if (error) { if (missing(error)) return "Grup Telegram belum siap di WAM (menunggu migrasi)."; databaseError(error); }
  if (!row || row.used_at || Date.parse(row.expires_at) < now.getTime()) return "Kode pemasangan tidak dikenali atau sudah kedaluwarsa. Buat tautan baru di Admin WAM → Telegram.";
  const scope = row.scope as TelegramScope;
  const department = row.department as string | null;
  // Mark the code used first, so a repeated update cannot install twice.
  const { data: claimed, error: claimError } = await client.from("pw_telegram_codes").update({ used_at: now.toISOString(), used_chat_id: chat.id })
    .eq("code_hash", hash(code)).is("used_at", null).select("code_hash");
  if (claimError) databaseError(claimError);
  if (!claimed?.length) return "Kode ini sudah dipakai. Buat tautan baru di Admin WAM → Telegram.";
  // The department's (or HOD's) earlier group, and this chat's earlier place, step aside.
  const earlier = client.from("pw_telegram_groups").update({ active: false, updated_at: now.toISOString() }).eq("active", true).eq("scope", scope).neq("chat_id", chat.id);
  const { error: clearError } = await (department ? earlier.ilike("department", department.replace(/[\\%_]/g, "\\$&")) : earlier);
  if (clearError) databaseError(clearError);
  const status = await botStatusIn(config, chat.id);
  const { data: before } = await client.from("pw_telegram_groups").select("mom_topic_id").eq("chat_id", chat.id).maybeSingle();
  const topic = chat.isForum ? before?.mom_topic_id ?? await openTopic(config, chat.id) : null;
  const { error: saveError } = await client.from("pw_telegram_groups").upsert({
    chat_id: chat.id, title: chat.title, scope, department, is_forum: chat.isForum, mom_topic_id: topic, bot_status: status,
    active: true, installed_at: now.toISOString(), updated_at: now.toISOString(),
  }, { onConflict: "chat_id" });
  if (saveError) databaseError(saveError);
  const what = scope === "hod" ? "MoM meeting antar HOD" : `MoM ${department}`;
  const where = topic ? ` MoM akan masuk ke topik ${MOM_TOPIC}.` : chat.isForum ? ` Topik ${MOM_TOPIC} belum bisa dibuat: jadikan bot admin dengan hak Kelola topik, lalu tekan Buat topik di Admin WAM.` : "";
  return `✅ Grup ini terpasang di WAM untuk ${what}.${where}`;
}

/** One webhook update. Never throws: Telegram would only send it again. */
export async function handleUpdate(update: TelegramUpdate, now = new Date()): Promise<void> {
  const config = telegramConfig();
  if (!config) return;
  try {
    const intent = readUpdate(update, await botUsername(config));
    const client = createPrivilegedClient();
    if (intent.kind === "install") {
      const reply = await install(config, intent.chat, intent.code, now);
      await send(config, intent.chat.id, reply).catch(() => undefined);
    } else if (intent.kind === "migrate") {
      // A group that became a supergroup gets a new id; the old id's row moves with it.
      await client.from("pw_telegram_groups").update({ chat_id: intent.to, updated_at: now.toISOString() }).eq("chat_id", intent.from);
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
  const { data, error } = await createPrivilegedClient().from("pw_telegram_groups").select(GROUP_COLUMNS).eq("chat_id", chatId).eq("active", true).maybeSingle();
  if (error) { if (missing(error)) throw waiting(); databaseError(error); }
  if (!data) throw new ServiceError(404, "Grup ini tidak lagi terpasang. Muat ulang halaman.");
  return toGroup(data as GroupRow);
}

/** Sends a sample MoM (marked UJI COBA) to a group, to its MoM topic when it has one. */
export async function sendSample(chatId: string, now = new Date()): Promise<string> {
  const config = requireBot();
  const group = await activeGroup(chatId);
  const short = departmentGroups(group.department ? [group.department] : [])[0]?.short ?? "";
  const { html } = minutesTelegramHtml(sampleMinutes(group, short, now, new URL(praWamPath.home, shareUrl()).toString().replace(/^https?:\/\//, "")));
  const client = createPrivilegedClient();
  try {
    await send(config, group.chatId, html, group.momTopicId);
  } catch (error) {
    if (!(error instanceof TelegramError)) throw new ServiceError(502, say(error));
    if (error.migrateTo) {
      await client.from("pw_telegram_groups").update({ chat_id: error.migrateTo, updated_at: now.toISOString() }).eq("chat_id", group.chatId);
      await send(config, error.migrateTo, html, group.momTopicId);
    } else if (error.gone) {
      await client.from("pw_telegram_groups").update({ bot_status: "dikeluarkan", updated_at: now.toISOString() }).eq("chat_id", group.chatId);
      throw new ServiceError(409, `Bot sudah tidak ada di grup ${group.title}. Pasang ulang bot ke grup itu.`);
    } else if (group.momTopicId && /thread|topic/i.test(error.description)) {
      // The topic was deleted or closed to the bot: post in the group, and forget the topic.
      await client.from("pw_telegram_groups").update({ mom_topic_id: null, updated_at: now.toISOString() }).eq("chat_id", group.chatId);
      await send(config, group.chatId, html);
      return `Contoh MoM terkirim ke ${group.title}, tetapi tidak di topik ${MOM_TOPIC} (topiknya tidak bisa dipakai bot). Tekan Buat topik untuk membuatnya lagi.`;
    } else throw new ServiceError(502, `Telegram menolak: ${error.description}`);
  }
  return `Contoh MoM terkirim ke ${group.title}${group.momTopicId ? ` (topik ${MOM_TOPIC})` : ""}.`;
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
export async function removeGroup(chatId: string, now = new Date()): Promise<string> {
  const group = await activeGroup(chatId);
  const { error } = await createPrivilegedClient().from("pw_telegram_groups").update({ active: false, updated_at: now.toISOString() }).eq("chat_id", group.chatId);
  if (error) databaseError(error);
  return `${group.title} dilepas dari WAM. MoM tidak dikirim ke sana lagi.`;
}
