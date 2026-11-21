import { isId, sessionCopySchema, sessionPutSchema } from "@/lib/main-wam/admin/requests";
import { ServiceError } from "@/lib/server/config";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { adminActor } from "@/lib/server/main-wam/admin/common";
import { copySession, deleteSession, updateSession } from "@/lib/server/main-wam/admin/sessions";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

async function sessionId(params: Params["params"]): Promise<string> {
  const { id } = await params;
  if (!isId(id)) throw new ServiceError(404, "Sesi tidak ditemukan.");
  return id;
}

/** PUT {session, notify}: saves one session; a change to a published one is logged and, with notify, told. */
export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = await sessionId(params);
    const input = validate(sessionPutSchema, await readJson(request, 50_000));
    if (input.notify) await enforceRateLimit(request, "mw-admin-kabar", 30);
    const result = await updateSession(id, input.session, { notify: input.notify, by: (await adminActor()).employeeId, version: input.version ?? null });
    return success(result, result.recipients ? `Sesi tersimpan. Kabar terkirim ke ${result.recipients.toLocaleString("id-ID")} orang.` : "Sesi tersimpan.");
  });
}

/** POST {date}: "Salin sesi" as a draft, on that day (null = the same day). */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = await sessionId(params);
    const input = validate(sessionCopySchema, await readJson(request, 1_000));
    return success(await copySession(id, input.date), "Sesi disalin sebagai draf.");
  });
}

/** DELETE: removes a session without check-ins (one with check-ins is cancelled instead). */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = await sessionId(params);
    return success(await deleteSession(id), "Sesi dihapus.");
  });
}
