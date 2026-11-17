import { Gallery } from "@/components/main-wam/momen/Gallery";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";
import { galleryScreen } from "@/lib/server/main-wam/momen/screens";

export const dynamic = "force-dynamic";
export const metadata = { title: "Galeri · WAM", robots: { index: false } };

type Search = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** M05 Galeri: Semua / Kelompokku / Fotoku, one session, a grid of three. Area B. */
export default async function GaleriPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const lihat = one(search.lihat);
  const context = await requireMainWamPage(mainWamPath.gallery({ lihat: lihat === "kelompok" || lihat === "saya" ? lihat : undefined, sesi: one(search.sesi) }));
  const screen = await galleryScreen(context, search);
  // A new filter = a new grid (fresh state from this first page).
  return <Gallery key={`${screen.view}|${screen.session ?? ""}`} {...screen} />;
}
