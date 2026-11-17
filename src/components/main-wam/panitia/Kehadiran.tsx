import { ChevronRight, Lock, UserCheck } from "lucide-react";
import { ScreenContent, ScreenSection } from "@/components/main-wam/shell";
import { Banner, Card, DayTabs, EmptyState, List, Pill, ProgressBar, SectionHeader, StatusPill, Text } from "@/components/main-wam/ui";
import { count } from "@/lib/main-wam/panitia/format";
import type { AttendanceDay } from "@/lib/server/main-wam/panitia/summary";
import Link from "next/link";
import { Bar } from "./parts";
import css from "./panitia.module.css";

/**
 * B02 Kehadiran (BOD): per day, the average of the sessions that are over, each session's
 * percentage, and per department (5 people or more; smaller ones together). Never who: "Nama yang
 * tidak hadir hanya terlihat oleh panitia." Server-rendered; the day tabs are links.
 */
export function Kehadiran({ data }: { data: AttendanceDay }) {
  return <ScreenContent>
    {!data.migrated && <Banner tone="info" title="Menunggu pembaruan sistem">Kehadiran tampil setelah pembaruan sistem dijalankan.</Banner>}
    {data.days.length > 0 && <DayTabs label="Hari" days={data.days} current={String(data.day)} />}
    {data.sessions.length === 0
      ? <EmptyState icon={<UserCheck />} title="Tidak ada sesi dengan absen di hari ini." size="s" />
      : <>
        <div className={css.avg}>
          <Text as="h2" variant="title">{data.average === null ? "Belum ada data" : `Rata-rata ${data.average}%`}</Text>
          <Text variant="body-small" color="2">{data.average === null && data.firstStart ? `Sesi pertama mulai ${data.firstStart}` : `dari ${count(data.expected)} peserta`}</Text>
        </div>
        <ScreenSection label="Per sesi">
          <SectionHeader title="Per sesi" />
          <List inset={16} label="Kehadiran per sesi">
            {data.sessions.map(session => <Link key={session.id} href={session.href} className={`${css.att} ${session.percent === null ? css.attNoBar : ""}`}
              aria-label={`${session.title}, ${session.time}, ${session.percent === null ? "belum mulai" : `${session.percent}% hadir`}`}>
              <span className={css.attTop}>
                <span className={css.attText}>
                  <span className={css.attTitle}>{session.title}</span>
                  <span className={css.attMeta}><span>{session.time}</span>{session.state === "live" && <StatusPill status="live" />}</span>
                </span>
                <span className={css.attEnd}>
                  {session.percent === null ? <Pill>Belum mulai</Pill> : <span className={css.attValue}>{session.percent}%</span>}
                  <ChevronRight aria-hidden />
                </span>
              </span>
              {session.percent !== null && <Bar thin value={session.percent} label={`${session.title}, ${session.percent}% hadir`} />}
            </Link>)}
          </List>
        </ScreenSection>
        {data.departments.length > 0 && <ScreenSection label="Per departemen">
          <SectionHeader title="Per departemen" />
          <Card className={css.depts}>
            {data.departments.map(item => <ProgressBar key={item.department} thin label={item.department} value={item.percent} valueText={`${item.percent}%`} />)}
          </Card>
          <p className={css.lockNote}><Lock aria-hidden />Nama yang tidak hadir hanya terlihat oleh panitia.</p>
        </ScreenSection>}
      </>}
  </ScreenContent>;
}
