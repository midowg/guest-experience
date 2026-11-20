import { notFound } from "next/navigation";
import { ConsoleTheme, PageHeader, PageTabs } from "@/components/console";
import { AwardsAdmin } from "@/components/admin/wam-acara/modul/AwardsAdmin";
import { SilentAdmin } from "@/components/admin/wam-acara/modul/SilentAdmin";
import { mainWamModuleTabs } from "@/components/admin/wam-acara/tabs";
import { sampleApprovals, sampleCounts } from "@/lib/main-wam/modul/sample";
import { closedTally } from "@/lib/main-wam/modul/awards";
import { at } from "@/lib/main-wam/modul/sample";
import { sampleAwards, sampleGroups, samplePeople, sampleSessions, sampleSilentQuestion } from "@/lib/main-wam/sample";
import type { AdminAwards, AdminSilent } from "@/lib/server/main-wam/modul/admin";

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
/** Closed with 47 feedbacks (count shown), or open (`buka`: its state only, audit H2). */
function silent(open: boolean): AdminSilent {
  return {
    migrated: true, questions: [{ ...sampleSilentQuestion, state: open ? "buka" : "tutup", count: open ? null : 47, locked: true }],
    sessions: sampleSessions.map(({ id, title, startsAt, endsAt, status, module }) => ({ id, title, startsAt, endsAt, status, module })),
  };
}

/** Admin WAM 2026 → Awarding / Silent Meeting with sample data, no sign-in, 404 in production: ?tab=awarding|silent-meeting&saat=buka. */
export default async function DevModulAdmin({ searchParams }: { searchParams: Promise<{ tab?: string; saat?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const tab = params.tab === "silent-meeting" ? "silent-meeting" : "awarding";
  const open = params.saat === "buka";
  return <ConsoleTheme canvas>
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 24 }} className="stack">
      <PageHeader title={tab === "awarding" ? "Awarding" : "Silent Meeting"} subtitle="Pratinjau dengan data contoh." />
      <PageTabs tabs={mainWamModuleTabs} current={tab} label="Modul acara" />
      {tab === "awarding" ? <AwardsAdmin initial={awards(open)} now={at("2027-01-06", open ? "10:00" : "16:00").toISOString()} /> : <SilentAdmin initial={silent(open)} />}
    </main>
  </ConsoleTheme>;
}
