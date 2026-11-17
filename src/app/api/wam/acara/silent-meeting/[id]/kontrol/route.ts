import { z } from "zod";
import { silentControlSchema } from "@/lib/main-wam/modul/silent";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireActionApi } from "@/lib/server/main-wam/gate";
import { limitPerson } from "@/lib/server/main-wam/modul/rate";
import { controlSilent } from "@/lib/server/main-wam/modul/silent";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const messages = { buka: "Silent Meeting dibuka.", tutup: "Silent Meeting ditutup." } as const;

/**
 * POST {action: "buka" | "tutup"}: panitia opens a Silent Meeting before its start, or closes it
 * before its end (final: it never opens again). Used by Rundown live (agen C, K02). Answers its state;
 * a count only once closed with 5 feedbacks of 5 people (never while open, audit H2).
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { viewer } = await requireActionApi("silent-kontrol");
    checkOrigin(request);
    const id = validate(z.uuid("Silent Meeting tidak dikenali."), (await params).id);
    const { action } = validate(silentControlSchema, await readJson(request, 1_000));
    await limitPerson("silent-kontrol", viewer.id, 20);
    return success(await controlSilent(id, action, viewer, new Date()), messages[action]);
  });
}
