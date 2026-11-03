import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { attendance, setPresent } from "@/lib/server/pra-wam/attendance";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** GET: who is present (panitia and BOD). */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => success(await attendance(validate(z.uuid(), (await params).id), await requireApiMember()), "Daftar hadir dimuat."));
}

/** POST {employeeId, present}: panitia corrects by hand. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const { employeeId, present } = validate(z.object({ employeeId: z.uuid(), present: z.boolean() }), await readJson(request, 1_000));
    return success(await setPresent(validate(z.uuid(), (await params).id), employeeId, present, member), present ? "Ditandai hadir." : "Tanda hadir dihapus.");
  });
}
