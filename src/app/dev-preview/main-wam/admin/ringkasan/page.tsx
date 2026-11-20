import { notFound } from "next/navigation";
import { WamAcaraHome } from "@/components/admin/wam-acara/WamAcaraHome";
import { sampleSettings } from "@/lib/main-wam/sample";
import type { MainWamMode } from "@/lib/main-wam/types";
import { AdminPreviewFrame } from "../Frame";

export const dynamic = "force-dynamic";

/** Admin WAM 2027 → Ringkasan in the real console frame, sample numbers, no sign-in, 404 in production: ?mode=pra|uji|semua, ?tampil=1, ?migrasi=belum. */
export default async function DevAdminRingkasan({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { mode, tampil, migrasi } = await searchParams;
  const settings = sampleSettings({ mode: (["pra", "uji", "semua"].includes(mode ?? "") ? mode : "uji") as MainWamMode });
  const migrated = migrasi !== "belum";
  return <AdminPreviewFrame current="ringkasan">
    <WamAcaraHome settings={settings} testers={3} staff={{ count: migrated ? 6 : 0, migrated }} shown={tampil === "1"} />
  </AdminPreviewFrame>;
}
