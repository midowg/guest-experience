import { notFound } from "next/navigation";
import { ConsoleTheme, PageHeader, PageTabs } from "@/components/console";
import { AwardsAdmin } from "@/components/admin/wam/main-wam/modul/AwardsAdmin";
import { SilentAdmin } from "@/components/admin/wam/main-wam/modul/SilentAdmin";
import { mainWamModuleTabs } from "@/components/admin/wam/main-wam/tabs";
import { sampleApprovals, sampleCounts } from "@/lib/main-wam/modul/sample";
import { rankTally, totalVotes } from "@/lib/main-wam/modul/awards";
import { sampleAwards, sampleGroups, samplePeople, sampleSessions, sampleSilentQuestion } from "@/lib/main-wam/sample";
import type { AdminAwards, AdminSilent } from "@/lib/server/main-wam/modul/admin";

export const dynamic = "force-dynamic";

function awards(): AdminAwards {
  const counts = sampleCounts();
  return {
    migrated: true, categories: sampleAwards, approvals: Object.values(sampleApprovals(true)),
    tallies: sampleAwards.filter(category => category.method === "voting").map(category => {
      const rows = rankTally(category.nominees, new Map(Object.entries(counts[category.id] ?? {})));
      return { categoryId: category.id, total: totalVotes(rows), rows: rows.map(row => ({ nomineeId: row.nominee.id, votes: row.votes, rank: row.rank })) };
    }),
    sessions: sampleSessions.map(({ id, title, startsAt, status }) => ({ id, title, startsAt, status })),
    people: Object.values(samplePeople).map(person => ({ id: person.id, fullName: person.fullName, department: person.department })),
    groups: sampleGroups.map(group => `Kelompok ${group.number} · ${group.name}`), departments: ["CoE", "Finance", "HRGA"],
    photos: [], approverNames: { [samplePeople.arman.id]: "Arman Contoh", [samplePeople.wulan.id]: "Wulan Contoh" },
  };
}
function silent(): AdminSilent {
  return {
    migrated: true, questions: [{ ...sampleSilentQuestion, count: 47, people: 41 }],
    sessions: sampleSessions.map(({ id, title, startsAt, endsAt, status, module }) => ({ id, title, startsAt, endsAt, status, module })),
  };
}

/** Admin WAM → Main WAM → Awarding / Silent Meeting with sample data, no sign-in, 404 in production: ?tab=awarding|silent-meeting. */
export default async function DevModulAdmin({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const tab = (await searchParams).tab === "silent-meeting" ? "silent-meeting" : "awarding";
  return <ConsoleTheme canvas>
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 24 }} className="stack">
      <PageHeader title={`Main WAM · ${tab === "awarding" ? "Awarding" : "Silent Meeting"}`} subtitle="Pratinjau dengan data contoh." />
      <PageTabs tabs={mainWamModuleTabs} current={tab} label="Modul acara" />
      {tab === "awarding" ? <AwardsAdmin initial={awards()} /> : <SilentAdmin initial={silent()} />}
    </main>
  </ConsoleTheme>;
}
