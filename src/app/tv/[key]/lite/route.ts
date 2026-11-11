import { wibDate } from "@/lib/pra-wam/appraisal";
import { DEFAULT_WAM_LOOK } from "@/lib/pra-wam/theme";
import { TV_DEFAULT_SETTINGS, weekOf, type TvFeed } from "@/lib/pra-wam/tv";
import { parseLiteView, tvLiteHtml, tvLiteNotice, tvLiteResponse } from "@/lib/pra-wam/tv-lite";
import { tvApi, tvLitePath } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { screenForKey, tvFeed } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ key: string }> };

/**
 * GET /tv/{address}/lite: one TV's board (/tv/{address}) for an old TV browser, as plain HTML with
 * no script (tv-lite.ts). The address is all it takes, as for /tv/{address}; one no TV has gets
 * "not found". Content that cannot be read now starts the board empty, as the board does.
 */
export async function GET(request: Request, { params }: Params) {
  const { key } = await params;
  if (!isSupabaseConfigured()) return tvLiteResponse(tvLiteNotice("TV Announcement belum aktif", "Halaman ini belum disiapkan."), 404);
  const screen = await screenForKey(key).catch(() => null);
  if (!screen) return tvLiteResponse(tvLiteNotice("Alamat TV tidak ditemukan", "Periksa alamatnya di Admin TV → Layar TV."), 404);
  const now = new Date();
  const feed: TvFeed = await tvFeed(slideId => tvApi.image(key, slideId), now, screen).catch(() => {
    const date = wibDate(now.toISOString());
    return { now: now.toISOString(), date, days: weekOf(date).map(day => ({ date: day, rooms: [] })), slides: [], settings: TV_DEFAULT_SETTINGS, look: DEFAULT_WAM_LOOK };
  });
  const view = parseLiteView(new URL(request.url).searchParams.get("v"));
  return tvLiteResponse(tvLiteHtml(feed, { view, path: next => tvLitePath(key, next) }));
}
