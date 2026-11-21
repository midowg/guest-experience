import { z } from "zod";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { selfieAsReference } from "@/lib/server/hr/attendance";
import { hrAdminActor } from "@/lib/server/hr/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST: "Jadikan foto acuan" (an old GreatDay photo that no longer matches well). */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await selfieAsReference(validate(z.uuid(), (await params).id), await hrAdminActor());
    return success(null, "Wajah acuan diganti dengan selfie ini.");
  });
}
