import { notFound } from "next/navigation";
import { previewLang } from "@/components/main-wam/dev/lang";
// The frame (theme) first, so its reset comes before the screen's styles, as the app's layout does.
import { Frame } from "../Frame";
import { CarbonScreen } from "@/components/main-wam/peserta/karbon/CarbonScreen";
import { CarbonSkeleton } from "@/components/main-wam/peserta/Skeletons";
import { carbonView } from "@/lib/main-wam/peserta/carbon";
import { sampleCarbon } from "@/lib/main-wam/peserta/sample";
import { mainWamPath } from "@/lib/routes";
import { previewTime } from "../sample";

export const dynamic = "force-dynamic";

/**
 * E01 Jejak karbon with sample data (dev-preview): ?dari=saya (Saya's tab lit), ?status=memuat|belum,
 * ?kecil=1 (a small event, kilograms), ?tagihan=1 (the hotel's bills are in), ?cara=1 (Cara menghitung open).
 */
export default async function PreviewCarbon({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const lang = previewLang(params);
  const now = previewTime({ waktu: "pemaparan" });
  const path = mainWamPath.carbon(params.dari === "saya" ? "saya" : undefined);
  if (params.status === "memuat") return <Frame path={path} now={now} lang={lang}><CarbonSkeleton /></Frame>;
  const result = params.status === "belum" ? null
    : params.kecil === "1" ? sampleCarbon({ people: 6, roomNights: 6, rooms: 3, nights: 2, trainLegs: [], busLegs: [], portions: 12 })
      : params.tagihan === "1" ? sampleCarbon({ bills: { listrikKwh: 4000, airM3: 600, lpgKg: 200, sampahKg: 900 } }) : sampleCarbon();
  return <Frame path={path} now={now} lang={lang}>
    <CarbonScreen view={carbonView(result, now, lang)} howOpen={params.cara === "1"} />
  </Frame>;
}
