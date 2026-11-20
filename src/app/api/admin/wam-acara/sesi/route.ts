import { minutesLabel } from "@/lib/main-wam/admin/rundown";
import { sessionsPostSchema } from "@/lib/main-wam/admin/requests";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { adminActor } from "@/lib/server/main-wam/admin/common";
import { createSession, importSessions, shiftSessions } from "@/lib/server/main-wam/admin/sessions";

export const dynamic = "force-dynamic";

/** "Kabar terkirim ke 122 orang." or nothing. */
const told = (recipients: number) => (recipients ? ` Kabar terkirim ke ${recipients.toLocaleString("id-ID")} orang.` : "");

/**
 * POST Admin WAM 2027 → Rundown (any Admin WAM 2027 admin): {action: "tambah", session} adds one;
 * {action: "impor", sessions} saves a checked paste (all or nothing); {action: "geser", items
 * [{id, version}], minutes, notify} moves several, each from the version the page saw moves several. Each answers with the whole rundown.
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(sessionsPostSchema, await readJson(request, 400_000));
    if (input.action === "tambah") return success(await createSession(input.session), "Sesi ditambahkan.");
    if (input.action === "impor") {
      const result = await importSessions(input.sessions);
      return success(result, `${result.added} sesi ditambahkan dari spreadsheet.`);
    }
    if (input.notify) await enforceRateLimit(request, "mw-admin-kabar", 30);
    const result = await shiftSessions(input.items, input.minutes, { notify: input.notify, by: (await adminActor()).employeeId });
    return success(result, `${input.items.length} sesi digeser ${minutesLabel(input.minutes)}.${told(result.recipients)}`);
  });
}
