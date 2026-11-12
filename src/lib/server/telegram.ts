import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * Telegram Bot API (12 Nov 2026, docs/rancangan-mom-telegram.md). The token lives only in the
 * server's environment (TELEGRAM_BOT_TOKEN) and never appears in a message, a log or an error:
 * errors carry Telegram's own description. The webhook's secret is derived from the token, so
 * there is no second secret to keep.
 */

export type TelegramConfig = { token: string; username: string | null };

export function telegramConfig(env: Record<string, string | undefined> = process.env): TelegramConfig | null {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token || !/^\d+:[A-Za-z0-9_-]{30,}$/.test(token)) return null;
  const username = env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") || null;
  return { token, username };
}

/** The X-Telegram-Bot-Api-Secret-Token the webhook expects (A–Z, a–z, 0–9, _ and -). */
export const webhookSecret = (token: string) => createHmac("sha256", token).update("wam-telegram-webhook").digest("base64url");

/** Whether a webhook request carries our secret. */
export function isOurWebhook(header: string | null, token: string): boolean {
  if (!header) return false;
  const expected = Buffer.from(webhookSecret(token));
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** A refusal from Telegram, with what it says to do about it. */
export class TelegramError extends Error {
  constructor(public code: number, public description: string, public retryAfter: number | null = null, public migrateTo: number | null = null) {
    super(`Telegram ${code}: ${description}`);
    this.name = "TelegramError";
  }
  /** The bot was removed from the chat or blocked: do not try again. */
  get gone() { return this.code === 403; }
  /** Editing to the same text: nothing to do. */
  get unchanged() { return this.code === 400 && /message is not modified/i.test(this.description); }
}

type Reply<T> = { ok: boolean; result?: T; error_code?: number; description?: string; parameters?: { retry_after?: number; migrate_to_chat_id?: number } };

/** Calls a Bot API method; a refusal throws TelegramError, a network fault a plain Error without the token. */
export async function telegramCall<T>(config: TelegramConfig, method: string, params: Record<string, unknown> = {}, fetcher: typeof fetch = fetch): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(`https://api.telegram.org/bot${config.token}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params), signal: AbortSignal.timeout(10_000), cache: "no-store",
    });
  } catch (error) {
    throw new Error(`Telegram tidak dapat dihubungi (${method}): ${error instanceof Error ? error.name : "galat"}`);
  }
  let reply: Reply<T>;
  try { reply = await response.json() as Reply<T>; }
  catch { throw new TelegramError(response.status, "Jawaban Telegram tidak dikenali."); }
  if (!reply.ok) {
    throw new TelegramError(reply.error_code ?? response.status, reply.description ?? "Ditolak Telegram.", reply.parameters?.retry_after ?? null, reply.parameters?.migrate_to_chat_id ?? null);
  }
  return reply.result as T;
}
