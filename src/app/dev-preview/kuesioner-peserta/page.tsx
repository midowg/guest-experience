import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/shared/AdminShell";
import { QuestionnaireSettings } from "@/components/admin/wam/questionnaire/QuestionnaireSettings";
import type { QForm } from "@/lib/pra-wam/questionnaire";

export const dynamic = "force-dynamic";

/** Layout check for Kuesioner → Pengaturan → Untuk siapa, with sample people. ?pilih=1 starts with chosen people; saving is refused without a session. */
export default async function DevQuestionnaireAudiencePage({ searchParams }: { searchParams: Promise<{ pilih?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const chosen = (await searchParams).pilih === "1";
  const departments = ["Comms", "Finance", "Human Capital", "Business Operations", "Creative", "IT"];
  const names = ["Ayu Lestari", "Bima Putra", "Citra Dewi", "Dimas Pratama", "Eka Sari", "Fajar Nugroho", "Gita Maharani", "Hendra Wijaya", "Indah Permata", "Joko Santoso", "Kartika Ayu", "Lukman Hakim", "Maya Anggraini", "Nanda Putri", "Oki Saputra", "Putri Wulandari", "Rizky Ramadhan", "Sinta Melati"];
  const people = names.map((name, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name: `Contoh ${name}`, department: departments[index % departments.length] }));
  const form: QForm = {
    id: "f1", name: "Cerita Kita", slug: "kuesioner", oldSlugs: [], status: "buka", intro: "", cardText: "", minutes: 15, editUntil: null, stayDeleteOn: null, hrAccess: [],
    audience: chosen ? "pilih" : "semua", audienceIds: chosen ? people.filter(person => person.department === "Comms").map(person => person.id) : [],
  };
  return <AdminShell bare><QuestionnaireSettings initial={form} people={people} audienceReady /></AdminShell>;
}
