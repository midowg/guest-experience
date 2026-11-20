import { z } from "zod";
import { reviewSchema } from "@/lib/hr/attendance";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { reviewRecord } from "@/lib/server/hr/attendance";
import { hrAdminActor } from "@/lib/server/hr/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** PATCH {status: "sah" | "ditolak", note}: decides a clock-in that waits ("Perlu dicek"). */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    const review = validate(reviewSchema, await readJson(request, 1_000));
    const record = await reviewRecord(id, review, await hrAdminActor());
    return success(record, review.status === "sah" ? "Absen disetujui." : "Absen ditolak.");
  });
}
