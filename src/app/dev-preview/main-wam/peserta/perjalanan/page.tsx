import { notFound } from "next/navigation";
import { previewLang } from "@/components/main-wam/dev/lang";
// The frame (theme) first, so its reset comes before the screen's styles, as the app's layout does.
import { Frame } from "../Frame";
import { TravelScreen } from "@/components/main-wam/peserta/saya/TravelScreen";
import { TravelSkeleton } from "@/components/main-wam/peserta/Skeletons";
import { t } from "@/lib/main-wam/i18n";
import { contactLinks } from "@/lib/main-wam/peserta/contact";
import { directionLabel, travelDirection, travelSteps } from "@/lib/main-wam/peserta/travel";
import { samplePeople, sampleSeats, sampleSettings, sampleTrips } from "@/lib/main-wam/sample";
import { mainWamPath } from "@/lib/routes";
import { previewTime, previewViewer } from "../sample";

export const dynamic = "force-dynamic";

/** L03 Perjalanan with sample data (dev-preview): ?arah=pulang, ?status=memuat|kosong|berubah, ?waktu=. */
export default async function PreviewTravel({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const lang = previewLang(params);
  const now = previewTime({ waktu: params.waktu ?? "berangkat" });
  if (params.status === "memuat") return <Frame path={mainWamPath.travel()} now={now} lang={lang}><TravelSkeleton /></Frame>;
  const viewer = previewViewer("peserta");
  const trips = params.status === "kosong" ? [] : sampleTrips;
  const seats = sampleSeats.filter(seat => seat.employeeId === viewer.id);
  const bima = { id: samplePeople.bima.id, name: "Bima", role: t(lang, "peserta.travel.roleCoordinator"), photo: null, ...contactLinks("0800-0000-0003") };
  return <Frame path={mainWamPath.travel()} now={now} lang={lang}>
    <TravelScreen initial={travelDirection(params.arah, now, sampleSettings().event)}
      labels={{ berangkat: directionLabel("berangkat", sampleTrips, lang), pulang: directionLabel("pulang", sampleTrips, lang) }}
      steps={{ berangkat: travelSteps(trips, seats, "berangkat", viewer.room?.name ?? null, lang), pulang: travelSteps(trips, seats, "pulang", viewer.room?.name ?? null, lang) }}
      coordinators={{ berangkat: bima, pulang: bima }} changed={params.status === "berubah" ? { berangkat: t(lang, "peserta.travel.gatherChanged", { time: lang === "en" ? "05:45" : "05.45" }) } : {}} migrated />
  </Frame>;
}
