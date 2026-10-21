import { calendarResponse } from "@/app/_guest/pages";
import { getPublicEvent } from "@/lib/server/events";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";

/** Older address of the calendar file; still served so saved calendar links keep working. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) return new Response("Kalender belum tersedia.", { status: 503 });
  const event = await getPublicEvent((await params).slug).catch(() => null);
  return event ? calendarResponse(request, event) : new Response("Acara tidak ditemukan.", { status: 404 });
}
