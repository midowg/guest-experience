import { ScreenHead } from "@/components/pra-wam/PraWamShell";
import { TimelineCalendar } from "@/components/pra-wam/TimelineCalendar";
import { Notice } from "@/components/ui";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { timelineMonths } from "@/lib/pra-wam/timeline";
import { praWamPath } from "@/lib/routes";
import { appraisalOpen } from "@/lib/server/pra-wam/events";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { timelineItems } from "@/lib/server/pra-wam/sessions";
import css from "@/components/pra-wam/timeline.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Timeline · WAM", robots: { index: false } };

/**
 * Timeline (9 Nov 2026, in the bottom bar where Profil was; 11 Nov 2026 as it is now): a month
 * calendar of Pra WAM's forums and events from Kelola acara → Jadwal sesi, each a bar in its own
 * colour and named in the legend below the month, so everyone sees the whole journey. Below it,
 * the rooms of the day picked (today at first), each as a card with its bookings; Book on a card
 * books that room on that day without leaving the page.
 */
export default async function TimelinePage() {
  const member = await requireMemberPage(praWamPath.timeline);
  const today = wibDate(new Date().toISOString());
  const [{ items, migrated }, open] = await Promise.all([timelineItems(member), appraisalOpen().catch(() => false)]);
  const entries = timelineMonths(items, today).flatMap(month => month.entries);
  return <>
    <ScreenHead eyebrow="Pra WAM 2026" title="Timeline" lead="Kegiatan Pra WAM per bulan. Ketuk tanggal untuk melihat ruang dan booking di hari itu." />
    {!migrated ? <Notice tone="warning">Timeline menunggu migrasi 202611040004_pra_wam_sessions.sql.</Notice>
      : <div className={css.layout}>
        {entries.length === 0 && <Notice tone="info">Panitia belum menyusun timeline. Ruang dan booking tetap bisa dilihat per tanggal.</Notice>}
        <TimelineCalendar entries={entries} today={today} canBook={open} viewerId={member.id} />
      </div>}
  </>;
}
