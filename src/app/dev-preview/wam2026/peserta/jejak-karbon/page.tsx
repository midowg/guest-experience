import { notFound } from "next/navigation";
import { previewLang } from "@/components/main-wam/dev/lang";
// The frame (theme) first, so its reset comes before the screen's styles, as the app's layout does.
import { Frame } from "../Frame";
import { CarbonScreen } from "@/components/main-wam/peserta/karbon/CarbonScreen";
import { CarbonSkeleton } from "@/components/main-wam/peserta/Skeletons";
import { sampleCarbon, sampleCarbonAnswer, sampleCarbonModel, sampleCarbonOwnAnswer } from "@/lib/main-wam/peserta/sample";
import { mainWamPath } from "@/lib/routes";
import { previewTime } from "../sample";

export const dynamic = "force-dynamic";

/**
 * E01 Jejak karbon with sample data (dev-preview), a calculator like Pra WAM's: ?dari=saya (Saya's tab lit),
 * ?status=memuat|belum, ?isi=1 (small things typed and saved) | sendiri (also an own trip by car, a long way: above the
 * average), ?sendiri=1 (the "Berangkat sendiri" sheet open), ?tutup=1 (answers closed), ?simpan=menunggu (no storage yet),
 * ?kecil=1 (a small event, kilograms), ?tagihan=1 (the hotel's bills are in), ?cara=1 (Katalog emisi open, which opens
 * Detail keseluruhan), ?detail=1 (Detail keseluruhan open), ?saya=belum (nothing to count for the person yet, the
 * event's numbers there), ?tiket=belum (the person's ticket and room not listed: counted as assumed), ?tanpa=1 (a person
 * with no room, as the average). Always marked "Contoh"; nothing is saved.
 */
export default async function PreviewCarbon({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const lang = previewLang(params);
  const now = previewTime({ waktu: "pemaparan" });
  const path = mainWamPath.carbon(params.dari === "saya" ? "saya" : undefined);
  if (params.status === "memuat") return <Frame path={path} now={now} lang={lang}><CarbonSkeleton /></Frame>;
  const overall = params.status === "belum" ? null
    : params.kecil === "1" ? sampleCarbon({ people: 6, roomNights: 6, rooms: 3, nights: 2, trainLegs: [], busLegs: [], portions: 12 })
      : params.tagihan === "1" ? sampleCarbon({ bills: { listrikKwh: 4000, airM3: 600, lpgKg: 200, sampahKg: 900 } }) : sampleCarbon();
  const data = params.status === "belum" || params.saya === "belum" ? null
    : params.kecil === "1" ? { legs: [], nights: 2, roomOccupants: 2, meals: 12, hotelAverageKg: 94 }
      : params.tiket === "belum" ? { legs: [{ mode: "kereta" as const, km: 520, sharedBy: 1, listed: false }, { mode: "kereta" as const, km: 520, sharedBy: 1, listed: false }], roomOccupants: 0 }
        : params.tagihan === "1" ? { hotelFromBills: true, hotelAverageKg: 140 }
          : params.tanpa === "1" ? { roomOccupants: 0 } : {};
  const answer = params.isi === "sendiri" ? sampleCarbonOwnAnswer : params.isi === "1" ? sampleCarbonAnswer : null;
  const model = sampleCarbonModel({ data, overall, answer, open: params.tutup !== "1", storage: params.simpan === "menunggu" ? "waiting" : "ok", now: now.toISOString() });
  return <Frame path={path} now={now} lang={lang}>
    <CarbonScreen model={model} howOpen={params.cara === "1"} overallOpen={params.detail === "1"} initialSheet={params.sendiri === "1"} sample />
  </Frame>;
}
