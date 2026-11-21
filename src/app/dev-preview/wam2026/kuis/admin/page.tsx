import { notFound } from "next/navigation";
import { ConsoleTheme, PageHeader, PageTabs } from "@/components/console";
import { QuizEditor } from "@/components/admin/wam-acara/kuis/QuizEditor";
import { QuizList } from "@/components/admin/wam-acara/kuis/QuizList";
import { mainWamModuleTabs } from "@/components/admin/wam-acara/tabs";
import { SAMPLE_QUESTIONS } from "@/lib/main-wam/kuis/sample";
import { samplePeople } from "@/lib/main-wam/sample";
import type { AdminQuiz } from "@/lib/server/main-wam/kuis/admin";

export const dynamic = "force-dynamic";

const QUIZ_ID = "00000000-0000-4000-a000-0000000000aa";
const people = Object.values(samplePeople).map(person => ({ id: person.id, fullName: person.fullName, department: person.department }));
const quiz: AdminQuiz = {
  quiz: { id: QUIZ_ID, title: "Kuis WAM 2026", screenHint: "x7Qa" },
  questions: SAMPLE_QUESTIONS.map((question, sort) => ({ ...question, sort })),
  hosts: people.slice(0, 2),
  runs: [
    { id: "00000000-0000-4000-a000-000000000002", number: 2, phase: "lobi", index: -1, count: 8, players: 37, createdAt: "2027-01-05T12:20:00Z", endedAt: null },
    { id: "00000000-0000-4000-a000-000000000001", number: 1, phase: "selesai", index: 7, count: 8, players: 112, createdAt: "2027-01-05T11:40:00Z", endedAt: "2027-01-05T12:05:00Z" },
  ],
  people,
};

/** Admin WAM 2026 → Kuis live with sample data, no sign-in, 404 in production: ?layar=daftar|kuis&modul=mati. */
export default async function DevKuisAdmin({ searchParams }: { searchParams: Promise<{ layar?: string; modul?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const moduleOn = params.modul !== "mati";
  return <ConsoleTheme canvas>
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 24 }} className="stack">
      <PageHeader title={params.layar === "kuis" ? quiz.quiz.title : "Kuis live"} subtitle="Pratinjau dengan data contoh." />
      <PageTabs tabs={mainWamModuleTabs} current="kuis" label="Modul acara" />
      {params.layar === "kuis" ? <QuizEditor initial={quiz} moduleOn={moduleOn} />
        : <QuizList moduleOn={moduleOn} migrated initial={[{ id: QUIZ_ID, title: "Kuis WAM 2026", questions: 8, hosts: 2, screenHint: "x7Qa", live: { number: 2, phase: "lobi" }, games: 2, createdAt: "2027-01-05T10:00:00Z" }]} />}
    </main>
  </ConsoleTheme>;
}
