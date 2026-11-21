import { z } from "zod";
import { kindLabels, recordEditSchema, reviewSchema } from "@/lib/hr/attendance";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { deleteRecord, editRecord, reviewRecord } from "@/lib/server/hr/attendance";
import { hrAdminActor } from "@/lib/server/hr/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** PATCH {status: "sah" | "ditolak", note}: decides a clock-in that waits ("Perlu dicek"); {action: "ubah", time, zone, place, reasonText, note} changes its time and place. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    const body = await readJson(request, 2_000);
    if ((body as { action?: string } | null)?.action === "ubah") {
      const change = validate(recordEditSchema, body);
      const record = await editRecord(id, change, await hrAdminActor());
      return success(record, `Absen ${kindLabels[record.kind].toLowerCase()} diubah.`);
    }
    const review = validate(reviewSchema, body);
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
