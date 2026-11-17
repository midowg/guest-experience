import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { DevFrame } from "@/components/main-wam/dev/DevFrame";
import { BerandaScreen } from "@/components/main-wam/peserta/beranda/BerandaScreen";
import { AbsenManual } from "@/components/main-wam/panitia/AbsenManual";
import { AnnounceForm } from "@/components/main-wam/panitia/AnnounceForm";
import { KelolaCards, RingkasanCard, RingkasanSkeleton } from "@/components/main-wam/panitia/BerandaCards";
import { Kehadiran } from "@/components/main-wam/panitia/Kehadiran";
import { Moderation } from "@/components/main-wam/panitia/Moderation";
import { RundownLive } from "@/components/main-wam/panitia/RundownLive";
import { AbsenSkeleton, AnnounceSkeleton, KehadiranSkeleton, ModerationSkeleton, RundownSkeleton } from "@/components/main-wam/panitia/Skeletons";
import { ScreenContent } from "@/components/main-wam/shell";
import { Banner, Text } from "@/components/main-wam/ui";
import { clock } from "@/lib/main-wam/panitia/format";
import { sampleTime, sampleViewer } from "@/lib/main-wam/sample";
import { mainWamPath } from "@/lib/routes";
import { previewHome } from "../peserta/sample";
import { AbsenStandIn, MomenStandIn } from "../peserta/standins";
import { PreviewApi } from "./PreviewApi";
import {
  announceSample, attendanceData, attendanceDaySample, bodRows, moderationHidden, moderationReported, panitiaHome, rundownHistory, rundownSessions, sampleDays,
} from "./sample";

export const dynamic = "force-dynamic";

const at = (time: string, date = "2027-01-05") => `${date}T${time}:00+07:00`;

/**
 * Beranda whole, as the app draws it ((app)/page.tsx): agen A's BerandaScreen with its preview data,
 * area C's card in the role's slot, Absen and Momen as A's stand-ins (audit T-K04).
 */
function Beranda({ peran, waktu, card }: { peran: "panitia" | "bod"; waktu: string; card: ReactNode }) {
  const now = sampleTime(waktu);
  return <BerandaScreen data={previewHome(now, sampleViewer(peran))} serverNow={now.toISOString()} since={clock(now.toISOString())} live={false}
    slots={{ absen: <AbsenStandIn />, panitia: peran === "panitia" ? card : null, bod: peran === "bod" ? card : null, momen: <MomenStandIn /> }} />;
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
    k01: () => ({ path: mainWamPath.home, peran: "panitia", waktu: "panitia", body:
      <Beranda peran="panitia" waktu="panitia" card={<KelolaCards tiles={panitiaHome.tiles} attention={varian === "tenang" ? [] : panitiaHome.attention} />} /> }),
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
    b01: () => ({ path: mainWamPath.home, peran: "bod", waktu: "bod", body: varian !== "status"
      ? <Beranda peran="bod" waktu="bod" card={<RingkasanCard rows={bodRows.biasa} />} />
      // The card's states one under the other (not a screen of its own).
      : <ScreenContent>
          <Text variant="caption-strong" color="2">Ringkasan · memuat</Text>
          <RingkasanSkeleton rows={4} />
          <Text variant="caption-strong" color="2">Ringkasan · belum ada data (Sen, 4 Jan)</Text>
          <RingkasanCard rows={bodRows.kosong} />
          <Text variant="caption-strong" color="2">Ringkasan · semua beres</Text>
          <RingkasanCard rows={bodRows.beres} />
          <Text variant="caption-strong" color="2">Ringkasan · modul Voting dan Jejak karbon mati</Text>
          <RingkasanCard rows={bodRows.modulMati} />
          <Text variant="caption-strong" color="2">Ringkasan · Jejak karbon di bawah 0,1 t (kg)</Text>
          <RingkasanCard rows={bodRows.karbonKecil} />
          <Text variant="caption-strong" color="2">Ringkasan · menunggu pembaruan sistem</Text>
          <RingkasanCard rows={[]}><Banner tone="info" title="Menunggu pembaruan sistem">Ringkasan tampil setelah pembaruan sistem dijalankan.</Banner></RingkasanCard>
      </ScreenContent> }),
    b02: () => varian === "memuat"
      ? { path: mainWamPath.attendanceSummary(3), peran: "bod", body: <KehadiranSkeleton /> }
      : { path: mainWamPath.attendanceSummary(3), peran: "bod", body: <Kehadiran data={varian === "kosong" ? { ...attendanceDaySample, average: null, firstStart: "06.00", departments: [], sessions: attendanceDaySample.sessions.map(session => ({ ...session, percent: null, state: "upcoming" as const })) } : attendanceDaySample} /> },
  };
  const screen = (screens[layar] ?? screens.k01)();
  return <DevFrame path={screen.path} peran={screen.peran} waktu={screen.waktu}>{screen.body}</DevFrame>;
}
