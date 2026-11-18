import { decodeCursor, GALLERY_PAGE, parseSession, parseView, STACK_PAGE } from "@/lib/main-wam/momen/filters";
import type { FeedAnswer } from "@/lib/main-wam/momen/types";
import { ServiceError } from "@/lib/server/config";
import { handle, success } from "@/lib/server/http";
import { requireMainWamApi } from "@/lib/server/main-wam/gate";
import { listFeed, sessionCounts } from "@/lib/server/main-wam/momen/feed";

export const dynamic = "force-dynamic";

/**
 * GET ?lihat=semua|kelompok|saya&sesi=<id>|umum&sebelum=<cursor>: one page of the stack (cursor
 * "b~…" or "r~…": every photo, the unseen ones first, then the seen and the person's own) or the gallery (none, or "s~…"). The first page also carries the
 * total and "Saring sesi" counts. Kelompok photos only for the person's own kelompok (server side).
 */
export async function GET(request: Request) {
  return handle(async () => {
    const context = await requireMainWamApi();
    const search = new URL(request.url).searchParams;
    const view = parseView(search.get("lihat"));
    const session = parseSession(search.get("sesi"));
    const raw = search.get("sebelum");
    const cursor = raw ? decodeCursor(raw) : { mode: "semua" as const, at: null, id: null, rest: false };
    if (!cursor) throw new ServiceError(422, "Daftar foto tidak dikenali. Muat ulang halaman.");
    const first = !cursor.at;
    const [page, sessions] = await Promise.all([
      listFeed(context, { view, session, mode: cursor.mode, cursor: cursor.at && cursor.id ? { at: cursor.at, id: cursor.id, rest: cursor.rest } : null, limit: cursor.mode === "baru" ? STACK_PAGE : GALLERY_PAGE }),
      first ? sessionCounts(context, view) : Promise.resolve(null),
    ]);
    return success<FeedAnswer>({ items: page.items, next: page.next, total: first ? page.total : null, sessions, migrated: page.migrated }, "Foto dimuat.");
  });
}
