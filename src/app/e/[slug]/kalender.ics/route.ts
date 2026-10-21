import { buildCalendar, calendarFileName, reminderChoices, type CalendarScope } from "@/lib/ics";
import { getPublicEvent } from "@/lib/server/events";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";

/**
 * GET /e/{slug}/kalender.ics?cakupan=semua|hari-ini&ingat=15|30|60
 * Only published events; the file carries the general invitation link, never a personal one.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSupabaseConfigured()) return new Response("Kalender belum tersedia.", { status: 503 });
  const event = await getPublicEvent(slug).catch(() => null);
  if (!event) return new Response("Acara tidak ditemukan.", { status: 404 });
  const url = new URL(request.url);
  const scope: CalendarScope = url.searchParams.get("cakupan") === "hari-ini" ? "today" : "all";
  const asked = Number(url.searchParams.get("ingat"));
  const remind = (reminderChoices as readonly number[]).includes(asked) ? asked : 30;
  const body = buildCalendar(event, { scope, remind, pageUrl: `${url.origin}/e/${event.slug}`, host: url.hostname });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${calendarFileName(event.slug, scope)}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
