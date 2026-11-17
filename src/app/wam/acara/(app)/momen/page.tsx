import { MomenStack } from "@/components/main-wam/momen/MomenStack";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";
import { stackScreen } from "@/lib/server/main-wam/momen/screens";

export const dynamic = "force-dynamic";
export const metadata = { title: "Momen · WAM", robots: { index: false } };

type Search = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** M01–M03 Momen, the stack (Semua / Kelompokku, one session, or opened at one photo). Area B. */
export default async function MomenPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const context = await requireMainWamPage(mainWamPath.moments({
    lihat: one(search.lihat) === "kelompok" ? "kelompok" : undefined, sesi: one(search.sesi), foto: one(search.foto),
  }));
  const screen = await stackScreen(context, search);
  // A new filter or start photo = a new stack (fresh state from this first page).
  return <MomenStack key={`${screen.mode}|${screen.view}|${screen.session ?? ""}|${one(search.foto) ?? ""}`} {...screen} />;
}
