import { AgendaScreen } from "@/components/main-wam/peserta/agenda/AgendaScreen";
import { hhmm } from "@/lib/main-wam/peserta/format";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";
import { readLang } from "@/lib/server/main-wam/lang";
import { loadAgenda } from "@/lib/server/main-wam/peserta/agenda";
import { unreadCount } from "@/lib/server/pra-wam/announcements";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agenda · WAM", robots: { index: false } };

/** The address of a day asked for: ?hari=2, or ?hari=h3 (Persiapan, module Ceklis); anything else is the default day. */
const hereOf = (asked: string | undefined) => (/^h\d{1,2}$/.test(asked ?? "") ? mainWamPath.agendaPrep(Number(asked!.slice(1))) : mainWamPath.agenda(Number(asked) || undefined));

/** P03 Agenda: the day in the address (?hari=1–4, or h3 for a Persiapan day), else today. Owner A (peserta); the gate first. */
export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ hari?: string | string[] }> }) {
  const { hari } = await searchParams;
  const context = await requireMainWamPage(hereOf(Array.isArray(hari) ? hari[0] : hari));
  const now = new Date();
  const [data, unread] = await Promise.all([loadAgenda(context, hari, now), unreadCount(context.viewer.id).catch(() => 0)]);
  return <AgendaScreen {...data} unread={unread} since={hhmm(now.toISOString(), await readLang())} />;
}
