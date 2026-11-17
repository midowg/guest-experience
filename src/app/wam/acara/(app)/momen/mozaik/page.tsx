import { Mosaic } from "@/components/main-wam/momen/Mosaic";
import { mainWamPath } from "@/lib/routes";
import { requireModulePage } from "@/lib/server/main-wam/gate";
import { mosaicManifest } from "@/lib/server/main-wam/momen/mosaic";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mozaik · WAM", robots: { index: false } };

type Search = Record<string, string | string[] | undefined>;

/** M06 Mozaik (module Mozaik; 404 while it is off). Area B. */
export default async function MozaikPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const mark = (Array.isArray(search.tandai) ? search.tandai[0] : search.tandai) === "1";
  const context = await requireModulePage("mozaik", mainWamPath.mosaic(mark));
  const manifest = await mosaicManifest(context);
  return <Mosaic initial={manifest} mark={mark} title={`Mozaik ${context.settings.event.name}`} />;
}
