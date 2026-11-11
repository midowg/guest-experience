import { liteAsk, tvLiteHtml, tvLiteNotice, tvLiteResponse } from "@/lib/pra-wam/tv-lite";
import { tvHomeApi, tvLitePath } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { tvFeed } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";

/**
 * GET /tv/lite: the board of /tv for an old TV browser, as plain HTML with no script (tv-lite.ts),
 * one item of the list a load. Open with no sign-in, like /tv. Content that cannot be read now gets
 * a note that tries again within a minute, so a TV left on recovers by itself.
 */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return tvLiteResponse(tvLiteNotice("TV Announcement belum aktif", "Halaman ini belum disiapkan."), 404);
  const feed = await tvFeed(tvHomeApi.image).catch(() => null);
  if (!feed) return tvLiteResponse(tvLiteNotice("Jadwal belum bisa dibaca", "Dicoba lagi dalam satu menit."), 503);
  return tvLiteResponse(tvLiteHtml(feed, { ask: liteAsk(request.url), path: item => tvLitePath(null, item) }));
}
