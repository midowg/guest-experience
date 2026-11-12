import { readJson } from "@/lib/server/http";
import { handleUpdate } from "@/lib/server/pra-wam/telegram";
import { isOurWebhook, telegramConfig } from "@/lib/server/telegram";
import type { TelegramUpdate } from "@/lib/pra-wam/telegram";

export const dynamic = "force-dynamic";

/**
 * POST from Telegram (12 Nov 2026): one update for @wam_werkudara_bot. Only a request carrying the
 * secret derived from the bot's token is read; the answer is always 200 once read, since Telegram
 * would otherwise send the same update again and again.
 */
export async function POST(request: Request) {
  const config = telegramConfig();
  if (!config || !isOurWebhook(request.headers.get("x-telegram-bot-api-secret-token"), config.token)) {
    return Response.json({ ok: false }, { status: 403 });
  }
  let update: TelegramUpdate;
  try { update = await readJson(request, 100_000) as TelegramUpdate; }
  catch { return Response.json({ ok: true }); }
  if (update && typeof update === "object") await handleUpdate(update);
  return Response.json({ ok: true });
}
