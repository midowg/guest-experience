import { z } from "zod";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { approveFace } from "@/lib/server/pra-wam/attendance";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; employeeId: string }> };

/** POST: panitia looked at a face check-in marked perlu cek and agrees (22 Nov 2026). */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const { id, employeeId } = await params;
    return success(await approveFace(validate(z.uuid(), id), validate(z.uuid(), employeeId), member), "Absen wajah disahkan.");
  });
}
