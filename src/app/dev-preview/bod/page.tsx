import { notFound } from "next/navigation";
import { BodSummary } from "@/components/pra-wam/BodSummary";
import { AccountStatus, ForumStatus } from "@/components/pra-wam/BodPeople";
import { attentionItems } from "@/lib/pra-wam/bod";
import type { BodSummary as Summary } from "@/lib/server/pra-wam/dashboard";
import base from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";

const forum = (id: string, title: string, present: number, expected: number, startsAt: string, live = false) => ({ id: `00000000-0000-4000-8000-00000000000${id}`, title, present, expected, startsAt, live });
const forums = [
  forum("1", "Review data dept.", 55, 57, "2026-11-10T02:00:00Z"),
  forum("2", "Rekonsiliasi ACC", 52, 57, "2026-11-11T02:00:00Z"),
  forum("3", "Meeting budget", 49, 57, "2026-11-13T02:00:00Z"),
  forum("4", "HOD Meeting", 12, 12, "2026-11-24T02:00:00Z"),
  forum("5", "CSM & CAPEX", 44, 57, "2026-11-26T02:00:00Z", true),
];
const unit = (id: string, name: string, present: number, expected: number, leads: string[]) => ({ id, name, businessUnits: [], present, expected, leads, members: expected });
const sample: Summary = {
  migrated: true, attendanceReady: true, people: 57, departments: 12, businessUnits: 3,
  active: forums[4], accounts: 57, signedIn: 51, published: 9, drafts: 2, openRequests: 3, forums,
  units: [
    unit("a", "Sales & Marketing", 14, 18, []), unit("b", "Center of Excellence", 6, 6, ["Sofyan"]),
    unit("c", "Business & Administrative Services", 2, 2, ["Yulia"]), unit("d", "Art & Creative Support", 1, 3, ["Sofyan"]),
    unit("e", "Business Operations", 3, 4, []), unit("f", "Finance", 4, 5, []),
  ],
  attention: attentionItems({ lowUnits: ["Art & Creative Support"], openRequests: 3, drafts: 2, notSignedIn: 6, deadline: "2026-12-23", today: "2026-11-26" }),
};

/**
 * Layout check for the BOD pages with sample numbers (Penpot "B1", "E3", status pills of "B2").
 * ?keadaan=kosong shows a summary before any forum; ?keadaan=absen, one before migration 05;
 * ?tema=gelap, the dark theme.
 */
export default async function DevBodPage({ searchParams }: { searchParams: Promise<{ keadaan?: string; tema?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { keadaan, tema } = await searchParams;
  const data: Summary = keadaan === "kosong"
    ? { ...sample, active: null, forums: [], units: [], signedIn: 0, attention: [] }
    : keadaan === "absen" ? { ...sample, attendanceReady: false } : sample;
  return <div data-wam-theme={tema === "gelap" ? "dark" : "light"}><div className={base.app} style={{ minHeight: "100vh", padding: 20 }}>
    <BodSummary data={data} greeting="Selamat pagi, Fadli" date="Kamis, 26 November" />
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 24 }}>
      <AccountStatus state="aktif" /><AccountStatus state="belum-masuk" /><AccountStatus state="tanpa-akun" />
      <ForumStatus title="Review data" mark="hadir" /><ForumStatus title="Meeting budget" mark="tidak-hadir" /><ForumStatus title="HOD Meeting" mark="berlangsung" />
    </div>
  </div></div>;
}
