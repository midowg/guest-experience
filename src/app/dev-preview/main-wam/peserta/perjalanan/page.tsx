import { notFound } from "next/navigation";
// The frame (theme) first, so its reset comes before the screen's styles, as the app's layout does.
import { Frame } from "../Frame";
import { TravelScreen } from "@/components/main-wam/peserta/saya/TravelScreen";
import { TravelSkeleton } from "@/components/main-wam/peserta/Skeletons";
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
  const now = previewTime({ waktu: params.waktu ?? "berangkat" });
  if (params.status === "memuat") return <Frame path={mainWamPath.travel()} now={now}><TravelSkeleton /></Frame>;
  const viewer = previewViewer("peserta");
  const trips = params.status === "kosong" ? [] : sampleTrips;
  const seats = sampleSeats.filter(seat => seat.employeeId === viewer.id);
  const bima = { id: samplePeople.bima.id, name: "Bima", role: "Koordinator", photo: null, ...contactLinks("0812-9999-0000") };
  return <Frame path={mainWamPath.travel()} now={now}>
    <TravelScreen initial={travelDirection(params.arah, now, sampleSettings().event)}
      labels={{ berangkat: directionLabel("berangkat", sampleTrips), pulang: directionLabel("pulang", sampleTrips) }}
      steps={{ berangkat: travelSteps(trips, seats, "berangkat", viewer.room?.name ?? null), pulang: travelSteps(trips, seats, "pulang", viewer.room?.name ?? null) }}
      coordinators={{ berangkat: bima, pulang: bima }} changed={params.status === "berubah" ? { berangkat: "Jam kumpul berubah · tadinya 05.45" } : {}} migrated />
  </Frame>;
}
