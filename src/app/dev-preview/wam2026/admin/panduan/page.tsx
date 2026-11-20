import { notFound } from "next/navigation";
import { wamAcaraCrumbs } from "@/components/admin/wam-acara/sections";
import { GuidesEditor } from "@/components/admin/wam-acara/isi/GuidesEditor";
import { sampleAdminGuides } from "@/lib/main-wam/admin/sample";
import { AdminPreviewFrame, previewFlags } from "../Frame";

export const dynamic = "force-dynamic";

/** Admin WAM 2026 → Panduan without signing in (404 in production): ?isi=kosong, ?migrasi=belum, ?penyimpanan=0. */
export default async function DevAdminPanduan({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const { waiting, empty } = previewFlags(params);
  return <AdminPreviewFrame current="panduan">
    <GuidesEditor key={JSON.stringify(params)} initial={{ guides: empty || waiting ? [] : sampleAdminGuides, links: {}, storage: params.penyimpanan !== "0" }} migrated={!waiting}
      crumbs={wamAcaraCrumbs("panduan")} title="Panduan" />
  </AdminPreviewFrame>;
}
