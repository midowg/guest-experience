import { notFound } from "next/navigation";
import { wamAcaraCrumbs } from "@/components/admin/wam-acara/sections";
import { MainWamSettings } from "@/components/admin/wam-acara/MainWamSettings";
import { ConsoleTheme } from "@/components/console";
import { sampleSettings, samplePeople } from "@/lib/main-wam/sample";
import { defaultSettings } from "@/lib/main-wam/settings";
import type { MainWamMode } from "@/lib/main-wam/types";

export const dynamic = "force-dynamic";

/**
 * Layout check for Admin WAM 2026 → Pengaturan without signing in (404 in production):
 * ?mode=pra|uji|semua, ?migrasi=belum before the migration, ?modul=0 with every module off.
 */
export default async function DevMainWamSettings({ searchParams }: { searchParams: Promise<{ mode?: string; migrasi?: string; modul?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { mode, migrasi, modul } = await searchParams;
  const base = sampleSettings({ mode: (["pra", "uji", "semua"].includes(mode ?? "") ? mode : "pra") as MainWamMode });
  const settings = { ...base, migrated: migrasi !== "belum", ...(modul === "0" ? { modules: defaultSettings().modules } : {}) };
  const people = Object.values(samplePeople).map(person => ({ id: person.id, fullName: person.fullName, department: person.department }));
  const testers = [{ employeeId: samplePeople.sari.id, fullName: samplePeople.sari.fullName, department: "HRGA", addedBy: "Admin Contoh", addedAt: "2026-11-17T10:00:00Z" }];
  return <ConsoleTheme canvas><div style={{ maxWidth: 1180, margin: "0 auto", padding: 24 }}>
    <MainWamSettings initial={settings} testers={testers} testersMigrated={settings.migrated} people={people} forms={[{ slug: "survei-wam", name: "Survei WAM" }]} storage
      crumbs={wamAcaraCrumbs("pengaturan")} title="Pengaturan" />
  </div></ConsoleTheme>;
}
