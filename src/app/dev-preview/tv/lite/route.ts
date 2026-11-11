import { liteAsk, tvLiteHtml, tvLiteResponse } from "@/lib/pra-wam/tv-lite";
import { sampleTvFeed } from "../sample";

export const dynamic = "force-dynamic";

/**
 * Layout check for the lite board (/tv/lite) with the made-up content of /dev-preview/tv: the same
 * ?isi=, ?tema= and ?mode= (?isi=daftar for one of every kind of item), and ?s= for the item on
 * show. Not in production.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const search = new URL(request.url).searchParams;
  const feed = sampleTvFeed({ isi: search.get("isi") ?? undefined, tema: search.get("tema") ?? undefined, mode: search.get("mode") ?? undefined });
  const keep = [...search].filter(([name]) => name !== "s" && name !== "v");
  return tvLiteResponse(tvLiteHtml(feed, { ask: liteAsk(request.url), path: item => `/dev-preview/tv/lite?${new URLSearchParams([...keep, ["s", item]])}` }));
}
