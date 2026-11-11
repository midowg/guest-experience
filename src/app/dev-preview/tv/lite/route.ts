import { parseLiteView, tvLiteHtml, tvLiteResponse } from "@/lib/pra-wam/tv-lite";
import { sampleTvFeed } from "../sample";

export const dynamic = "force-dynamic";

/**
 * Layout check for the lite board (/tv/lite) with the made-up content of /dev-preview/tv: the same
 * ?isi=, ?tema= and ?mode=, and ?v=hari or ?v=minggu for the calendar. Not in production.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const search = new URL(request.url).searchParams;
  const feed = sampleTvFeed({ isi: search.get("isi") ?? undefined, tema: search.get("tema") ?? undefined, mode: search.get("mode") ?? undefined });
  const keep = new URLSearchParams([...search].filter(([name]) => name !== "v"));
  return tvLiteResponse(tvLiteHtml(feed, { view: parseLiteView(search.get("v")), path: view => `/dev-preview/tv/lite?${new URLSearchParams([...keep, ["v", view]])}` }));
}
