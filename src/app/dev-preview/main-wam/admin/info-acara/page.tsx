import { notFound } from "next/navigation";
import { wamAcaraCrumbs } from "@/components/admin/wam-acara/sections";
import { EventInfoEditor } from "@/components/admin/wam-acara/isi/EventInfoEditor";
import { sampleAdminPeople, sampleAdminSettings } from "@/lib/main-wam/admin/sample";
import { defaultSettings } from "@/lib/main-wam/settings";
import { AdminPreviewFrame, previewFlags } from "../Frame";

export const dynamic = "force-dynamic";

/** Admin WAM 2027 → Info acara without signing in (404 in production): ?isi=kosong, ?migrasi=belum, ?tagihan=final. */
export default async function DevAdminInfoAcara({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const { waiting, empty } = previewFlags(params);
  const settings = waiting ? defaultSettings() : empty ? { ...defaultSettings(), migrated: true }
    : sampleAdminSettings(params.tagihan === "final" ? { carbon: { listrikKwh: 18_400, airM3: 620, lpgKg: 310, sampahKg: 950, final: true } } : {});
  return <AdminPreviewFrame current="info">
    <EventInfoEditor key={JSON.stringify(params)} initial={settings} people={sampleAdminPeople}
      crumbs={wamAcaraCrumbs("info")} title="Info acara" />
  </AdminPreviewFrame>;
}
