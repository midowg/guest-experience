import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { DevFrame } from "@/components/main-wam/dev/DevFrame";
import { BerandaScreen } from "@/components/main-wam/peserta/beranda/BerandaScreen";
import { AbsenManual } from "@/components/main-wam/panitia/AbsenManual";
import { AnnounceForm } from "@/components/main-wam/panitia/AnnounceForm";
import { Moderation } from "@/components/main-wam/panitia/Moderation";
import { PanitiaHub } from "@/components/main-wam/panitia/PanitiaHub";
import { RundownLive } from "@/components/main-wam/panitia/RundownLive";
import { AbsenSkeleton, AnnounceSkeleton, ModerationSkeleton, PanitiaSkeleton, RundownSkeleton } from "@/components/main-wam/panitia/Skeletons";
import { clock } from "@/lib/main-wam/panitia/format";
import { sampleTime, sampleViewer } from "@/lib/main-wam/sample";
import { mainWamPath } from "@/lib/routes";
import { previewHome } from "../peserta/sample";
import { AbsenStandIn, MomenStandIn } from "../peserta/standins";
import { PreviewApi } from "./PreviewApi";
import { TabletPreview, type TabletVariant } from "./TabletPreview";
import {
  announceSample, attendanceData, moderationHidden, moderationReported, panitiaHome, rundownHistory, rundownSessions, sampleDays, tabletSample,
} from "./sample";

export const dynamic = "force-dynamic";

const at = (time: string, date = "2027-01-05") => `${date}T${time}:00+07:00`;

/** Beranda whole, as the app draws it ((app)/page.tsx): agen A's BerandaScreen with its preview data, Absen and Momen as A's stand-ins (audit T-K04). */
function Beranda({ peran, waktu }: { peran: "panitia" | "bod"; waktu: string }) {
  const now = sampleTime(waktu);
  return <BerandaScreen data={previewHome(now, sampleViewer(peran))} serverNow={now.toISOString()} since={clock(now.toISOString())} live={false}
    slots={{ absen: <AbsenStandIn />, momen: <MomenStandIn /> }} />;
}

type Screen = { path: string; peran: string; waktu?: string; body: ReactNode };

/**
 * Area C (panitia) in the real frame, sample data, no sign-in, 404 in production:
 * ?layar=hub|beranda|k02|k05|k05t|k06|k08 &varian=… (see each case). Buttons answer through a stand-in API.
 */
export default async function DevMainWamPanitia({ searchParams }: { searchParams: Promise<{ layar?: string; varian?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { layar = "hub", varian = "" } = await searchParams;
  const screens: Record<string, () => Screen> = {
    // K01 Panitia, the fifth tab's hub. ?varian=tenang (nothing to watch), kosong (nothing running), memuat.
    hub: () => varian === "memuat"
      ? { path: mainWamPath.committee, peran: "panitia", waktu: "panitia", body: <PanitiaSkeleton /> }
      : { path: mainWamPath.committee, peran: "panitia", waktu: "panitia", body:
        <PanitiaHub tiles={panitiaHome.tiles} attention={varian === "tenang" ? [] : panitiaHome.attention} running={varian === "tenang" || varian === "kosong" ? [] : panitiaHome.running} /> },
    // Beranda of a panitia: the same as a peserta's, no card of the tools.
    beranda: () => ({ path: mainWamPath.home, peran: "panitia", waktu: "panitia", body: <Beranda peran="panitia" waktu="panitia" /> }),
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
    // K05b Absen mode tablet, a fake camera with made-up faces. ?varian=intro, ditolak, tanpa-wajah, belum-terdaftar, offline, belum-dibuka, ditutup, tanpa-sesi.
    k05t: () => {
      const data = tabletSample(varian === "belum-dibuka" ? "belum" : varian === "ditutup" ? "tutup" : "buka", varian === "tanpa-sesi");
      return { path: mainWamPath.attendanceTablet(), peran: "panitia", body: <TabletPreview data={data} rows={data.rows} variant={varian as TabletVariant} /> };
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
  };
  const screen = (screens[layar] ?? screens.hub)();
  return <DevFrame path={screen.path} peran={screen.peran} waktu={screen.waktu}>{screen.body}</DevFrame>;
}
