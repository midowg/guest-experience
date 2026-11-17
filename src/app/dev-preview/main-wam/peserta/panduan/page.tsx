import { notFound } from "next/navigation";
// The frame (theme) first, so its reset comes before the screen's styles, as the app's layout does.
import { Frame } from "../Frame";
import { GuideScreen } from "@/components/main-wam/peserta/panduan/GuideScreen";
import { GuidesScreen } from "@/components/main-wam/peserta/panduan/GuidesScreen";
import { ListSkeleton } from "@/components/main-wam/peserta/Skeletons";
import { hhmm } from "@/lib/main-wam/peserta/format";
import { shownGuides } from "@/lib/main-wam/peserta/guides";
import { sampleGuides, sampleSettings } from "@/lib/main-wam/sample";
import { mainWamPath } from "@/lib/routes";
import { previewTime } from "../sample";

export const dynamic = "force-dynamic";

/** L04 Panduan with sample data (dev-preview): ?status=memuat|offline|kosong, ?isi=<slug> (one guide's page). */
export default async function PreviewGuides({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const now = previewTime({ waktu: "pemaparan" });
  const one = params.isi ? sampleGuides.find(guide => guide.slug === params.isi) : null;
  if (one) {
    const event = sampleSettings().event;
    return <Frame path={mainWamPath.guide(one.slug)} now={now}>
      <GuideScreen guide={{ ...one, file: one.kind === "denah" ? null : one.file }} hotel={one.kind === "hotel" ? { name: event.hotel, address: event.address } : null} />
    </Frame>;
  }
  if (params.status === "memuat") return <Frame path={mainWamPath.guides} now={now}><ListSkeleton label="Memuat panduan" groups={[4]} /></Frame>;
  return <Frame path={mainWamPath.guides} now={now}>
    <GuidesScreen migrated guides={params.status === "kosong" ? [] : shownGuides(sampleGuides)} since={hhmm(new Date(now.getTime() - 120_000).toISOString())} forceOffline={params.status === "offline"} />
  </Frame>;
}
