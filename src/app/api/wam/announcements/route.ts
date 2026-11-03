import { z } from "zod";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { sendAnnouncement, sentAnnouncements } from "@/lib/server/pra-wam/announcements";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
const schema = z.object({
  title: z.string().trim().min(2, "Isi judul pengumuman.").max(150),
  body: z.string().trim().max(4000, "Isi paling panjang 4.000 karakter.").default(""),
  audience: z.discriminatedUnion("type", [
    z.object({ type: z.literal("semua") }),
    z.object({ type: z.literal("sesi"), sessionId: z.uuid() }),
    z.object({ type: z.literal("unit"), unitIds: z.array(z.uuid()).min(1, "Pilih minimal satu unit.").max(50) }),
  ]),
});

export async function GET() {
  return handle(async () => success(await sentAnnouncements(await requireApiMember()), "Pengumuman dimuat."));
}

/** POST: send an announcement now (panitia). */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, "pra-wam-announce", 20);
    const count = await sendAnnouncement(validate(schema, await readJson(request, 20_000)), member);
    return success({ count }, `Pengumuman terkirim ke ${count} orang.`);
  });
}
