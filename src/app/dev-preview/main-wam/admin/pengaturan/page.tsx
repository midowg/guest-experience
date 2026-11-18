import { notFound } from "next/navigation";
import { MainWamSettings } from "@/components/admin/wam/main-wam/MainWamSettings";
import { sampleSettings, samplePeople } from "@/lib/main-wam/sample";
import { defaultSettings } from "@/lib/main-wam/settings";
import type { MainWamMode } from "@/lib/main-wam/types";
import { AdminPreviewFrame } from "../Frame";

export const dynamic = "force-dynamic";

/**
 * Admin WAM → Main WAM → Pengaturan in the real console frame, without signing in (404 in production):
 * ?mode=pra|uji|semua, ?migrasi=belum, ?modul=0 with every module off, ?demo=1 (mode demo on).
 */
export default async function DevAdminPengaturan({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { mode, migrasi, modul, demo } = await searchParams;
  const base = sampleSettings({ mode: (["pra", "uji", "semua"].includes(mode ?? "") ? mode : "pra") as MainWamMode });
  const settings = { ...base, migrated: migrasi !== "belum", ...(modul === "0" ? { modules: defaultSettings().modules } : {}),
    ...(demo === "1" ? { moduleConfig: { ...base.moduleConfig, demo: true } } : {}) };
  const people = Object.values(samplePeople).map(person => ({ id: person.id, fullName: person.fullName, department: person.department }));
  const testers = [{ employeeId: samplePeople.sari.id, fullName: samplePeople.sari.fullName, department: "HRGA", addedBy: "Admin Contoh", addedAt: "2026-11-17T10:00:00Z" }];
  return <AdminPreviewFrame current="mw-pengaturan">
    <MainWamSettings initial={settings} testers={testers} testersMigrated={settings.migrated} people={people} forms={[{ slug: "survei-wam", name: "Survei WAM" }]} storage
      crumbs={[{ label: "Admin WAM", href: "#" }, { label: "Main WAM" }, { label: "Pengaturan" }]} title="Main WAM · Pengaturan" />
  </AdminPreviewFrame>;
}
