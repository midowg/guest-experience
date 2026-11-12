import { describe, expect, it, vi } from "vitest";
import { isOurWebhook, telegramCall, TelegramError, telegramConfig, webhookSecret } from "./telegram";

const TOKEN = "123456789:AAH-fake_token_for_tests_only_0123456789";
const config = { token: TOKEN, username: "wam_werkudara_bot" };
/** The error a call ends in (it must end in one). */
const failure = (promise: Promise<unknown>) => promise.then(() => { throw new Error("expected a refusal"); }, (problem: unknown) => problem as TelegramError);
const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;

describe("telegramConfig", () => {
  it("needs a token shaped like a bot token; the username loses its @", () => {
    expect(telegramConfig({})).toBeNull();
    expect(telegramConfig({ TELEGRAM_BOT_TOKEN: "rubbish" })).toBeNull();
    expect(telegramConfig({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_BOT_USERNAME: "@wam_werkudara_bot" })).toEqual(config);
    expect(telegramConfig({ TELEGRAM_BOT_TOKEN: ` ${TOKEN} ` })?.username).toBeNull();
  });
});

describe("webhook secret", () => {
  it("is derived from the token, uses only the characters Telegram allows, and is checked exactly", () => {
    const secret = webhookSecret(TOKEN);
    expect(secret).toMatch(/^[A-Za-z0-9_-]{1,256}$/);
    expect(secret).not.toContain(TOKEN.split(":")[1]);
    expect(isOurWebhook(secret, TOKEN)).toBe(true);
    expect(isOurWebhook(`${secret}x`, TOKEN)).toBe(false);
    expect(isOurWebhook(null, TOKEN)).toBe(false);
    expect(isOurWebhook(webhookSecret("999:other"), TOKEN)).toBe(false);
  });
});

describe("telegramCall", () => {
  it("posts JSON to the method and gives back the result", async () => {
    const fetcher = reply({ ok: true, result: { message_id: 7 } });
    await expect(telegramCall(config, "sendMessage", { chat_id: -1, text: "hi" }, fetcher)).resolves.toEqual({ message_id: 7 });
    const [url, init] = (fetcher as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(JSON.parse(String(init.body))).toEqual({ chat_id: -1, text: "hi" });
  });

  it("turns a refusal into TelegramError with retry, migration, gone and unchanged, never the token", async () => {
    const error = await failure(telegramCall(config, "sendMessage", {}, reply({ ok: false, error_code: 400, description: "Bad Request: group chat was upgraded to a supergroup chat", parameters: { migrate_to_chat_id: -1009 } }, 400)));
    expect(error).toBeInstanceOf(TelegramError);
    expect(error.migrateTo).toBe(-1009);
    expect(error.message).not.toContain(TOKEN);
    const slow = await failure(telegramCall(config, "sendMessage", {}, reply({ ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 5 } }, 429)));
    expect(slow.retryAfter).toBe(5);
    const gone = await failure(telegramCall(config, "sendMessage", {}, reply({ ok: false, error_code: 403, description: "Forbidden: bot was kicked from the group chat" }, 403)));
    expect(gone.gone).toBe(true);
    const same = await failure(telegramCall(config, "editMessageText", {}, reply({ ok: false, error_code: 400, description: "Bad Request: message is not modified" }, 400)));
    expect(same.unchanged).toBe(true);
  });

  it("reports a network fault without the address (which holds the token)", async () => {
    const fetcher = vi.fn(async () => { throw new TypeError(`fetch failed for https://api.telegram.org/bot${TOKEN}/getMe`); }) as unknown as typeof fetch;
    const error = await failure(telegramCall(config, "getMe", {}, fetcher));
    expect(error.message).toContain("Telegram tidak dapat dihubungi (getMe)");
    expect(error.message).not.toContain(TOKEN);
  });
});
