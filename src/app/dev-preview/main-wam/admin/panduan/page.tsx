import { notFound } from "next/navigation";
import { GuidesEditor } from "@/components/admin/wam/main-wam/isi/GuidesEditor";
import { sampleAdminGuides } from "@/lib/main-wam/admin/sample";
import { AdminPreviewFrame, previewFlags } from "../Frame";

export const dynamic = "force-dynamic";

/** Admin WAM → Main WAM → Panduan without signing in (404 in production): ?isi=kosong, ?migrasi=belum, ?penyimpanan=0. */
export default async function DevAdminPanduan({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const { waiting, empty } = previewFlags(params);
  return <AdminPreviewFrame current="mw-panduan">
    <GuidesEditor key={JSON.stringify(params)} initial={{ guides: empty || waiting ? [] : sampleAdminGuides, links: {}, storage: params.penyimpanan !== "0" }} migrated={!waiting}
      crumbs={[{ label: "Admin WAM", href: "#" }, { label: "Main WAM" }, { label: "Isi acara", href: "#" }, { label: "Panduan" }]} title="Main WAM · Panduan" />
  </AdminPreviewFrame>;
}
