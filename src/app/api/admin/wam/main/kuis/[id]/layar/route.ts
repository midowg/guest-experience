import { z } from "zod";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { newScreenLink } from "@/lib/server/main-wam/kuis/admin";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST: a new big-screen link, shown once (only its hash is kept); the old link stops working. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const link = await newScreenLink(validate(z.uuid("Kuis tidak dikenali."), (await params).id));
    return success(link, "Tautan layar besar dibuat. Salin sekarang: tautan ini hanya tampil sekali.");
  });
}
