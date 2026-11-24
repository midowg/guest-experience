import { Gallery } from "@/components/main-wam/momen/Gallery";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";
import { galleryScreen } from "@/lib/server/main-wam/momen/screens";

export const dynamic = "force-dynamic";
export const metadata = { title: "Galeri · WAM", robots: { index: false } };

type Search = Record<string, string | string[] | undefined>;

/** M05 Galeri (the icon in Momen's bar): the tabs Fotoku and Ditandai, a grid of three each. Area B. */
export default async function GaleriPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const tab = (Array.isArray(search.tab) ? search.tab[0] : search.tab) === "ditandai" ? "ditandai" : undefined;
  const context = await requireMainWamPage(mainWamPath.gallery(tab));
  return <Gallery {...(await galleryScreen(context, search))} />;
}
