import { z } from "zod";
import { listAllRsvps, rsvpCsv } from "@/lib/server/responses";
import { failure, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const idSchema = z.uuid();

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = validate(idSchema, (await params).id);
    const rows = await listAllRsvps(id);
    return new Response(rsvpCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="rsvp-${id}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
