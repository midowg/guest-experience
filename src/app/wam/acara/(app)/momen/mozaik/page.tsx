import { Mosaic } from "@/components/main-wam/momen/Mosaic";
import { mainWamPath } from "@/lib/routes";
import { t } from "@/lib/main-wam/i18n";
import { requireModulePage } from "@/lib/server/main-wam/gate";
import { readLang } from "@/lib/server/main-wam/lang";
import { GALLERY_PAGE } from "@/lib/main-wam/momen/filters";
import { listFeed } from "@/lib/server/main-wam/momen/feed";
import { mosaicManifest } from "@/lib/server/main-wam/momen/mosaic";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mozaik · WAM", robots: { index: false } };

type Search = Record<string, string | string[] | undefined>;

/** M06 Mozaik (module Mozaik; 404 while it is off), with Fotoku (own photos: status, Hapus foto) since Galeri was removed. Area B. */
export default async function MozaikPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const mark = (Array.isArray(search.tandai) ? search.tandai[0] : search.tandai) === "1";
  const context = await requireModulePage("mozaik", mainWamPath.mosaic(mark));
  // Fotoku sits under the mosaic: the person's own photos, also those not in it (Ditinjau, Disembunyikan).
  const [manifest, own] = await Promise.all([
    mosaicManifest(context),
    listFeed(context, { view: "saya", session: null, mode: "semua", limit: GALLERY_PAGE }).catch(() => null),
  ]);
  return <Mosaic initial={manifest} mark={mark} own={own?.items ?? []} ownTotal={own?.total ?? 0} mozaik title={t(await readLang(), "momen.mos.title", { name: context.settings.event.name })} />;
}
