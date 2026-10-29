import { calendarResponse } from "@/app/_guest/pages";
import { welcomeEventQuietly } from "@/app/_guest/find";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";

/** GET /welcome/vortex/kalender.ics?cakupan=semua|hari-ini&ingat=15|30|60 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) return new Response("Kalender belum tersedia.", { status: 503 });
  const event = await welcomeEventQuietly((await params).slug);
  return event ? calendarResponse(request, event) : new Response("Acara tidak ditemukan.", { status: 404 });
}
