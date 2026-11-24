import { notFound } from "next/navigation";
import { ConsoleShell } from "@/components/console";
import { MissionsAdmin, type Tab } from "@/components/admin/wam-acara/misi/MissionsAdmin";
import { sampleMissions, sampleReviewQueue } from "@/lib/main-wam/misi/sample";
import { DEFAULT_MISSION_SETTINGS } from "@/lib/main-wam/misi/types";
import type { AdminMisi } from "@/lib/server/main-wam/misi/admin";
import admin from "@/components/admin/admin.module.css";

export const dynamic = "force-dynamic";

const TABS: Tab[] = ["misi", "tinjauan", "bukti", "peringkat", "pengaturan"];

/*
 * Layout check for Admin WAM 2026 → Misi with the sample missions and review queue, without signing in.
 * ?tab=misi|tinjauan|bukti|peringkat|pengaturan  ?kosong=1 (nothing waiting). Saving calls the real API,
 * which refuses without a session. 404 in production.
 */
export default async function DevMisiAdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; kosong?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { tab, kosong } = await searchParams;
  const initial: AdminMisi = {
    migrated: true, settings: DEFAULT_MISSION_SETTINGS, missions: sampleMissions.map((mission, index) => ({ ...mission, done: index % 4, pending: index % 3, rejected: index % 2 })),
    completions: [], reviewQueue: kosong ? [] : sampleReviewQueue(), leaderboard: [], manual: [], sessions: [], people: [],
  };
  const initialTab = TABS.find(item => item === tab) ?? "misi";
  return <ConsoleShell theme="admin" area="Admin WAM 2026" storageKey="dev-misi-wam" className={admin.shell} person={{ name: "Admin Contoh", sub: "Werkudara" }}
    groups={[{ label: "Main WAM", items: [{ key: "misi", label: "Misi", href: "/dev-preview/wam2026/admin-misi" }] }]} current="misi" pageTitle="Misi">
    <MissionsAdmin initial={initial} initialTab={initialTab} />
  </ConsoleShell>;
}
