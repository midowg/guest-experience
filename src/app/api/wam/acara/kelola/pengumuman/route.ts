import { announceSchema } from "@/lib/main-wam/panitia/schemas";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireMainWamApi } from "@/lib/server/main-wam/gate";
import { listSent, sendAnnouncement } from "@/lib/server/main-wam/panitia/announce";
import { apiOnlyFor, limitPerPerson } from "@/lib/server/main-wam/panitia/common";

export const dynamic = "force-dynamic";

/** GET: the announcements panitia sent lately, with who sent them (K06). */
export async function GET() {
  return handle(async () => {
    apiOnlyFor(await requireMainWamApi(), "kelola");
    return success(await listSent(), "Pengumuman dimuat.");
  });
}

/** POST {title, body, audience, pinnedUntil}: Kirim pengumuman now (panitia). */
export async function POST(request: Request) {
  return handle(async () => {
    const context = apiOnlyFor(await requireMainWamApi(), "kelola");
    checkOrigin(request);
    await limitPerPerson("pengumuman", context.viewer.id, 10);
    const count = await sendAnnouncement(context, validate(announceSchema, await readJson(request, 10_000)));
    return success({ count }, `Terkirim ke ${count} orang.`);
  });
}
