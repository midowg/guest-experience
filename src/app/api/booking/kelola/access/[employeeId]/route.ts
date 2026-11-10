import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { setBookingAdmin } from "@/lib/server/booking/admin";
import { requireFacilityManager } from "@/lib/server/booking/bookings";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ employeeId: string }> };

/** PUT {on}: Kelola → Akses gives or takes one person's Admin Booking (administration staff only). */
export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    requireFacilityManager(member);
    checkOrigin(request);
    const employeeId = validate(z.uuid(), (await params).employeeId);
    const { on } = validate(z.object({ on: z.boolean() }), await readJson(request, 1_000));
    await setBookingAdmin(employeeId, on, member);
    return success(null, on ? "Akses Admin Booking diberikan." : "Akses Admin Booking dicabut.");
  });
}
