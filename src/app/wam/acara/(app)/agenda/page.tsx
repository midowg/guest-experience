import { AgendaScreen } from "@/components/main-wam/peserta/agenda/AgendaScreen";
import { hhmm } from "@/lib/main-wam/peserta/format";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";
import { readLang } from "@/lib/server/main-wam/lang";
import { loadAgenda } from "@/lib/server/main-wam/peserta/agenda";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agenda · WAM", robots: { index: false } };

/** P03 Agenda: the day in the address (?hari=1–4), else today. Owner A (peserta); the gate first. */
export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ hari?: string | string[] }> }) {
  const { hari } = await searchParams;
  const context = await requireMainWamPage(mainWamPath.agenda(Number(Array.isArray(hari) ? hari[0] : hari) || undefined));
  const now = new Date();
  const data = await loadAgenda(context, hari, now);
  return <AgendaScreen {...data} since={hhmm(now.toISOString(), await readLang())} />;
}
