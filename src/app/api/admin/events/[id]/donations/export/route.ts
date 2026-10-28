import { z } from "zod";
import { donationsCsv, listDonations } from "@/lib/server/donations";
import { getAdminEvent } from "@/lib/server/events";
import { failure, validate } from "@/lib/server/http";
import { requireApiAdmin, requireEventAccess } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAdmin();
    const id = validate(z.uuid(), (await params).id);
    await requireEventAccess(id);
    const { donations } = await listDonations(id);
    const event = await getAdminEvent(id);
    return new Response(donationsCsv(donations, event?.donation.recipients ?? []), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="donasi-${id}.csv"`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
