import { notFound } from "next/navigation";
import { TimelineCalendar } from "@/components/pra-wam/TimelineCalendar";
import css from "@/components/pra-wam/timeline.module.css";
import { timelineMonths, type TimelineItem } from "@/lib/pra-wam/timeline";
import base from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";

const plan = (title: string, from: string, to: string, kind: TimelineItem["kind"] = "forum"): TimelineItem =>
  ({ id: title, title, kind, published: false, planFrom: from, planTo: to, startsAt: null, endsAt: null, mine: false });

/** Layout check for Timeline's calendar with Pra WAM's planned forums: ?tema=terang, ?tampilan=werkudara. */
export default async function DevTimelinePage({ searchParams }: { searchParams: Promise<{ tema?: string; tampilan?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { tema, tampilan } = await searchParams;
  const entries = timelineMonths([
    plan("Rekonsiliasi ACC", "2026-11-11", "2026-11-12"), plan("Meeting biaya & budget", "2026-11-13", "2026-11-13"),
    plan("CSM & prioritas CAPEX", "2026-11-24", "2026-11-27"), plan("Revenue Sync & RSM", "2026-11-24", "2026-12-04"),
    plan("HOD Meeting", "2026-11-24", "2026-11-27"), plan("Pengajuan & arahan BOD", "2026-11-30", "2026-12-04"),
    plan("Internal Dept Meeting", "2026-12-07", "2026-12-09"), plan("ITEM: antar-departemen", "2026-12-10", "2026-12-11"),
    plan("ITAM: BOD x departemen", "2026-12-14", "2026-12-16"), plan("End Year Dinner", "2026-12-29", "2026-12-29", "acara"),
  ], "2026-11-09").flatMap(month => month.entries);
  return <div data-wam-look={tampilan === "werkudara" ? "werkudara" : "dream"} data-wam-theme={tema === "terang" ? "light" : "dark"}>
    <div className={base.app} style={{ minHeight: "100vh", padding: 16 }}><div className={css.layout}><TimelineCalendar entries={entries} today="2026-11-09" />
      <ol className={css.list}>{entries.map(entry => <li key={entry.id} className={`${css.entry} ${css[`c${entry.color}`]}`} data-state={entry.state}><span className={css.dot} /><div className={css.card}><span className={css.when}>{entry.when}</span><strong className={css.title}>{entry.title}</strong><span className={css.meta}>Forum · Jadwal pasti menyusul</span></div></li>)}</ol>
    </div></div>
  </div>;
}
