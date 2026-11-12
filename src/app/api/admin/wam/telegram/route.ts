import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { createInstallCode, ensureTopic, installWebhook, removeGroup, sendSample, telegramStatus } from "@/lib/server/pra-wam/telegram";

export const dynamic = "force-dynamic";

const chatId = z.string().regex(/^-?\d{1,20}$/, "Grup tidak dikenali.");
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("webhook") }),
  z.object({
    action: z.literal("install"), scope: z.enum(["departemen", "hod", "cos"]),
    department: z.string().trim().max(150).nullable().default(null), unit: z.string().trim().max(120).nullable().default(null),
  }),
  z.object({ action: z.literal("sample"), chatId }),
  z.object({ action: z.literal("topic"), chatId }),
  z.object({ action: z.literal("remove"), chatId }),
]);

/** GET: Admin WAM → Telegram (any admin): the bot, its webhook, the groups and the departments. */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await telegramStatus(), "");
  });
}

/**
 * POST {action}: webhook (point the bot at this site), install (a 30-minute link for one
 * department or the HOD group), sample (a UJI COBA MoM to a group), topic (open the MoM topic),
 * remove (stop posting to a group).
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(schema, await readJson(request, 2_000));
    if (input.action === "webhook") {
      await installWebhook();
      return success(await telegramStatus(), "Webhook terpasang. Bot sekarang menjawab lewat WAM.");
    }
    if (input.action === "install") {
      const group = input.scope === "departemen";
      const code = await createInstallCode(input.scope, group ? input.department : null, group ? input.unit : null);
      return success(code, "Tautan pemasangan dibuat. Berlaku 30 menit dan sekali pakai.");
    }
    const message = input.action === "sample" ? await sendSample(input.chatId)
      : input.action === "topic" ? await ensureTopic(input.chatId)
        : await removeGroup(input.chatId);
    return success(await telegramStatus(), message);
  });
}
