import { notFound } from "next/navigation";
import { MapPin, Clock } from "lucide-react";
import type { ReactNode } from "react";
import { DevFrame } from "@/components/main-wam/dev/DevFrame";
import { AbsenManual } from "@/components/main-wam/panitia/AbsenManual";
import { AnnounceForm } from "@/components/main-wam/panitia/AnnounceForm";
import { KelolaCards, RingkasanCard, RingkasanSkeleton } from "@/components/main-wam/panitia/BerandaCards";
import { Kehadiran } from "@/components/main-wam/panitia/Kehadiran";
import { Moderation } from "@/components/main-wam/panitia/Moderation";
import { RundownLive } from "@/components/main-wam/panitia/RundownLive";
import { AbsenSkeleton, AnnounceSkeleton, KehadiranSkeleton, ModerationSkeleton, RundownSkeleton } from "@/components/main-wam/panitia/Skeletons";
import { ScreenContent } from "@/components/main-wam/shell";
import { Banner, Card, StatusPill, Text } from "@/components/main-wam/ui";
import { mainWamPath } from "@/lib/routes";
import { PreviewApi } from "./PreviewApi";
import {
  announceSample, attendanceData, attendanceDaySample, bodRows, moderationHidden, moderationReported, panitiaHome, rundownHistory, rundownSessions, sampleDays,
} from "./sample";

export const dynamic = "force-dynamic";

const at = (time: string, date = "2027-01-05") => `${date}T${time}:00+07:00`;

/** Beranda's Sekarang card stands in for agen A's (only to place area C's cards as on the prototype). */
function NowStandIn({ title, time, place }: { title: string; time: string; place: string }) {
  return <Card>
    <span><StatusPill status="live" /></span>
    <Text as="h2" variant="headline">{title}</Text>
    <Text variant="body" color="2"><Clock aria-hidden width={16} height={16} /> {time}</Text>
    <Text variant="body" color="2"><MapPin aria-hidden width={16} height={16} /> {place}</Text>
  </Card>;
}

type Screen = { path: string; peran: string; waktu?: string; body: ReactNode };

/**
 * Area C (panitia + BOD) in the real frame, sample data, no sign-in, 404 in production:
 * ?layar=k01|k02|k05|k06|k08|b01|b02 &varian=… (see each case). Buttons answer through a stand-in API.
 */
export default async function DevMainWamPanitia({ searchParams }: { searchParams: Promise<{ layar?: string; varian?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { layar = "k01", varian = "" } = await searchParams;
  const screens: Record<string, () => Screen> = {
    k01: () => ({ path: mainWamPath.home, peran: "panitia", waktu: "panitia", body: <ScreenContent>
      <NowStandIn title="Pemaparan departemen" time="08.00–12.00" place="Aula Utama" />
      <KelolaCards tiles={panitiaHome.tiles} attention={varian === "tenang" ? [] : panitiaHome.attention} />
    </ScreenContent> }),
    k02: () => {
      if (varian === "memuat") return { path: mainWamPath.rundownLive(2), peran: "panitia", body: <RundownSkeleton /> };
      const variant = varian === "disimpan" || varian === "tanpa-kabar" ? "disimpan" : varian === "silent-dibuka" ? "silent-dibuka" : "awal";
      const now = varian === "silent-dibuka" ? at("14:40") : varian ? at("10:20") : at("10:15");
      const toast = varian === "disimpan" ? { text: "Kabar terkirim ke 122 orang", tone: "success" as const } : varian === "tanpa-kabar" ? { text: "Jadwal tersimpan", tone: "success" as const } : undefined;
      return { path: mainWamPath.rundownLive(2), peran: "panitia", body: <PreviewApi toast={toast}>
        <RundownLive migrated={varian !== "migrasi"} day={2} days={sampleDays(2, mainWamPath.rundownLive)} sessions={varian === "kosong" ? [] : rundownSessions(variant)}
          history={rundownHistory} recipients={122} now={now} me="Dimas" />
      </PreviewApi> };
    },
    k05: () => {
      if (varian === "memuat") return { path: mainWamPath.attendanceManual(), peran: "panitia", body: <AbsenSkeleton /> };
      const data = attendanceData(varian === "kosong");
      return { path: mainWamPath.attendanceManual(), peran: "panitia", body: <PreviewApi rows={data.rows}>
        <AbsenManual {...data} initialTab={varian === "hadir" ? "hadir" : "belum"} />
      </PreviewApi> };
    },
    k06: () => varian === "memuat"
      ? { path: mainWamPath.announce, peran: "panitia", body: <AnnounceSkeleton /> }
      : { path: mainWamPath.announce, peran: "panitia", body: <PreviewApi toast={varian === "terkirim" ? { text: "Terkirim ke 122 orang", tone: "success" } : undefined}>
        <AnnounceForm {...announceSample} sent={varian === "terkirim" || varian === "riwayat" ? announceSample.sent : []} now={at("10:28")} />
      </PreviewApi> },
    k08: () => varian === "memuat"
      ? { path: mainWamPath.moderation(), peran: "panitia", body: <ModerationSkeleton /> }
      : { path: mainWamPath.moderation(), peran: "panitia", body: <PreviewApi>
        <Moderation migrated now={at("10:16")} reported={varian === "kosong" ? [] : moderationReported} hidden={moderationHidden} tab={varian === "disembunyikan" ? "disembunyikan" : "dilaporkan"} />
      </PreviewApi> },
    b01: () => ({ path: mainWamPath.home, peran: "bod", waktu: "bod", body: <ScreenContent>
      <NowStandIn title="Refleksi & arah bersama" time="16.00–17.30" place="Aula Utama" />
      {varian === "status"
        ? <>
          <Text variant="caption-strong" color="2">Ringkasan · memuat</Text>
          <RingkasanSkeleton rows={4} />
          <Text variant="caption-strong" color="2">Ringkasan · belum ada data (Sen, 4 Jan)</Text>
          <RingkasanCard rows={bodRows.kosong} />
          <Text variant="caption-strong" color="2">Ringkasan · semua beres</Text>
          <RingkasanCard rows={bodRows.beres} />
          <Text variant="caption-strong" color="2">Ringkasan · modul Voting dan Jejak karbon mati</Text>
          <RingkasanCard rows={bodRows.modulMati} />
          <Text variant="caption-strong" color="2">Ringkasan · menunggu pembaruan sistem</Text>
          <RingkasanCard rows={[]}><Banner tone="info" title="Menunggu pembaruan sistem">Ringkasan tampil setelah pembaruan sistem dijalankan.</Banner></RingkasanCard>
        </>
        : <RingkasanCard rows={bodRows.biasa} />}
    </ScreenContent> }),
    b02: () => varian === "memuat"
      ? { path: mainWamPath.attendanceSummary(3), peran: "bod", body: <KehadiranSkeleton /> }
      : { path: mainWamPath.attendanceSummary(3), peran: "bod", body: <Kehadiran data={varian === "kosong" ? { ...attendanceDaySample, average: null, firstStart: "06.00", departments: [], sessions: attendanceDaySample.sessions.map(session => ({ ...session, percent: null, state: "upcoming" as const })) } : attendanceDaySample} /> },
  };
  const screen = (screens[layar] ?? screens.k01)();
  return <DevFrame path={screen.path} peran={screen.peran} waktu={screen.waktu}>{screen.body}</DevFrame>;
}
