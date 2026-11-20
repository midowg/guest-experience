import { z } from "zod";
import { kindLabels, reviewSchema } from "@/lib/hr/attendance";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { deleteRecord, reviewRecord } from "@/lib/server/hr/attendance";
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

/** DELETE: "Hapus absen": the clock-in and its selfie, for good (test data, a mistake). */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const record = await deleteRecord(validate(z.uuid(), (await params).id));
    return success(record, `Absen ${kindLabels[record.kind].toLowerCase()} dihapus.`);
  });
}
