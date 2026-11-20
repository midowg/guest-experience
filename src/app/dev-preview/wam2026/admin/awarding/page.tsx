import { notFound } from "next/navigation";
import { PageHeader, PageTabs } from "@/components/console";
import { AwardsAdmin } from "@/components/admin/wam-acara/modul/AwardsAdmin";
import { mainWamModuleTabs } from "@/components/admin/wam-acara/tabs";
import { sampleApprovals, sampleCounts } from "@/lib/main-wam/modul/sample";
import { closedTally } from "@/lib/main-wam/modul/awards";
import { at } from "@/lib/main-wam/modul/sample";
import { sampleAwards, sampleGroups, samplePeople, sampleSessions } from "@/lib/main-wam/sample";
import type { AdminAwards } from "@/lib/server/main-wam/modul/admin";
import { AdminPreviewFrame } from "../Frame";

export const dynamic = "force-dynamic";

/** At 16.00 on 6 Jan both voting categories have closed (counts shown); `buka` = 10.00, still open (no counts, audit M1). */
function awards(open: boolean): AdminAwards {
  const counts = sampleCounts();
  const now = at("2027-01-06", open ? "10:00" : "16:00");
  return {
    migrated: true, categories: sampleAwards, approvals: open ? [] : Object.values(sampleApprovals(true)),
    tallies: sampleAwards.flatMap(category => {
      const tally = closedTally(category, new Map(Object.entries(counts[category.id] ?? {})), now);
      return tally ? [{ categoryId: category.id, ...tally }] : [];
    }),
    sessions: sampleSessions.map(({ id, title, startsAt, status }) => ({ id, title, startsAt, status })),
    people: Object.values(samplePeople).map(person => ({ id: person.id, fullName: person.fullName, department: person.department })),
    groups: sampleGroups.map(group => `Kelompok ${group.number} · ${group.name}`), departments: ["CoE", "Finance", "HRGA"],
    photos: [], approverNames: { [samplePeople.arman.id]: "Arman Contoh", [samplePeople.wulan.id]: "Wulan Contoh" },
  };
}

/** Admin WAM 2026 → Awarding in the real console frame, sample data, no sign-in, 404 in production: ?saat=buka. */
export default async function DevAdminAwarding({ searchParams }: { searchParams: Promise<{ saat?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const open = (await searchParams).saat === "buka";
  return <AdminPreviewFrame current="modul">
    <PageHeader title="Awarding" subtitle="Kategori, jendela voting, nominasi, dan perolehan suara untuk persetujuan BOD." />
    <PageTabs tabs={mainWamModuleTabs} current="awarding" label="Modul acara" />
    <AwardsAdmin initial={awards(open)} now={at("2027-01-06", open ? "10:00" : "16:00").toISOString()} />
  </AdminPreviewFrame>;
}
