import { notFound } from "next/navigation";
import { wamAcaraCrumbs } from "@/components/admin/wam-acara/sections";
import { RoomsEditor } from "@/components/admin/wam-acara/isi/RoomsEditor";
import { stayLine } from "@/components/admin/wam-acara/isi/stay";
import { sampleAdminRooms, sampleAdminSettings } from "@/lib/main-wam/admin/sample";
import { AdminPreviewFrame, previewFlags } from "../Frame";

export const dynamic = "force-dynamic";

/** Admin WAM 2027 → Kamar without signing in (404 in production): ?isi=kosong, ?migrasi=belum, ?hapus=awal (HR's delete date before the event ends). */
export default async function DevAdminKamar({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const { waiting, empty } = previewFlags(params);
  const settings = sampleAdminSettings();
  const board = {
    form: { id: "00000000-0000-4000-8099-000000000001", name: "Kuesioner WAM (contoh)", published: params.terbit !== "0", stayDeleteOn: params.hapus === "awal" ? "2027-01-05" : "2027-01-20" },
    rooms: empty ? [] : sampleAdminRooms(), stayReady: true, migrated: !waiting,
  };
  return <AdminPreviewFrame current="kamar">
    <RoomsEditor key={JSON.stringify(params)} board={board} eventEnd={settings.event.endDate} stay={stayLine(settings.event)} hrRoomsHref="#" infoHref="#"
      crumbs={wamAcaraCrumbs("kamar")} title="Kamar" />
  </AdminPreviewFrame>;
}
