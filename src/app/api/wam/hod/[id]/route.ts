import { z } from "zod";
import { hodAnswerSchema } from "@/lib/pra-wam/hod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { answerHodMeeting, cancelHodMeeting } from "@/lib/server/pra-wam/hod";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST {accept, note}: an invited HOD answers. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const { accept, note } = validate(hodAnswerSchema, await readJson(request, 2_000));
    const status = await answerHodMeeting(member, validate(z.uuid(), (await params).id), accept, note);
    return success({ status }, !accept ? "Kamu menolak. HOD yang mengajukan diberi tahu."
      : status === "terjadwal" ? "Kamu menerima. Semua HOD sudah menerima: meeting terjadwal." : "Kamu menerima. Menunggu HOD lain.");
  });
}

/** DELETE: the HOD who asked cancels the meeting. */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await cancelHodMeeting(member, validate(z.uuid(), (await params).id));
    return success(null, "Meeting dibatalkan. HOD yang diundang diberi tahu.");
  });
}
