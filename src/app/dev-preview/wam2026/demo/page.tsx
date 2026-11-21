import { notFound } from "next/navigation";
import { DevFrame } from "@/components/main-wam/dev/DevFrame";
import { previewLang } from "@/components/main-wam/dev/lang";
import { BerandaScreen } from "@/components/main-wam/peserta/beranda/BerandaScreen";
import { SayaScreen } from "@/components/main-wam/peserta/saya/SayaScreen";
import { PanitiaHub } from "@/components/main-wam/panitia/PanitiaHub";
import { clock } from "@/lib/main-wam/panitia/format";
import { profileLine, roomRow } from "@/lib/main-wam/peserta/saya";
import { sampleTime, sampleViewer } from "@/lib/main-wam/sample";
import { parseDemoRole } from "@/lib/main-wam/demo";
import { mainWamPath } from "@/lib/routes";
import { previewHome } from "../peserta/sample";
import { AbsenStandIn, MomenStandIn } from "../peserta/standins";
import { panitiaHome } from "../panitia/sample";

export const dynamic = "force-dynamic";

/**
 * Mode demo, drawn from sample data (no sign-in; 404 in production): the banner, Saya's "Lihat sebagai" card
 * and what the choice changes. ?layar=saya|beranda|panitia, ?peran=peserta|panitia|bod (the role drawn), ?lang=en.
 * An admin who is only a peserta picks Panitia: the bottom bar gets its fifth tab and Beranda is the committee's.
 */
export default async function PreviewDemo({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const lang = previewLang(params);
  const role = parseDemoRole(params.peran) ?? "peserta";
  const viewer = sampleViewer(role);
  const now = sampleTime(role === "panitia" ? "panitia" : role === "bod" ? "bod" : "pemaparan");
  const layar = params.layar ?? "saya";
  if (layar === "beranda") {
    return <DevFrame path={mainWamPath.home} peran={role} waktu={role === "panitia" ? "panitia" : role === "bod" ? "bod" : "pemaparan"} lang={lang} demo>
      <BerandaScreen data={previewHome(now, viewer)} serverNow={now.toISOString()} since={clock(now.toISOString())} live={false} slots={{ absen: <AbsenStandIn />, bod: null, momen: <MomenStandIn /> }} />
    </DevFrame>;
  }
  if (layar === "panitia") {
    return <DevFrame path={mainWamPath.committee} peran={role} waktu="panitia" lang={lang} demo>
      <PanitiaHub tiles={panitiaHome.tiles} attention={panitiaHome.attention} running={panitiaHome.running} />
    </DevFrame>;
  }
  return <DevFrame path={mainWamPath.me} peran={role} waktu="pemaparan" lang={lang} demo>
    <SayaScreen name={viewer.name} fullName={viewer.fullName} line={profileLine(viewer)} photo={null} room={viewer.room ? roomRow(viewer.room, lang) : null} carbon demo={role} />
  </DevFrame>;
}
