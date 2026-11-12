import { notFound } from "next/navigation";
import { Questionnaire } from "@/components/pra-wam/questionnaire/Questionnaire";
import type { QQuestion, QSection } from "@/lib/pra-wam/questionnaire";

export const dynamic = "force-dynamic";

const section = (id: string, title: string, sort: number): QSection => ({ id, key: id, title, short: title, hello: `Halo, ${title}`, intro: "", tease: "", anonymous: false, sort, hidden: false });
const question = (key: string, sectionId: string, sort: number, rest: Partial<QQuestion>): QQuestion => ({
  id: `q-${key}`, sectionId, key, prompt: key, kind: "text", required: false, visibility: "rekan", options: [], maxChoices: null, matrixRows: [], scale: [],
  placeholder: "", note: "", react: "", showIf: null, sort, hidden: false, ...rest,
});

/**
 * Layout check for the participant's questionnaire without signing in (12 Nov 2026): the section
 * numbers at the top to jump with, a position filled in from Data karyawan, and "Lainnya" written
 * in. Saving is refused without a session.
 */
export default function DevQuestionnaireFillPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const sections = [section("s0", "Kenalan", 1), section("s1", "Tentang kamu", 2), section("s2", "Menginap", 3)];
  const questions = [
    question("1", "s0", 1, { prompt: "Siapa nama lengkap dan nama panggilanmu?", required: true }),
    question("3", "s0", 2, { prompt: "Posisimu sekarang?", kind: "single", required: true, visibility: "hr", options: ["Staff", "Leader", "HOD", " GM"] }),
    question("17", "s1", 3, { prompt: "Kamu paling suka ngapain di luar kerjaan?", kind: "multi", options: ["Olahraga & outdoor", "Musik", "Game", "Lainnya"] }),
    question("20", "s1", 4, { prompt: "Di acara kelompok, kamu paling nyaman di mana?", kind: "single", options: ["Kelompok besar", "Kelompok kecil", "Lainnya"] }),
    question("10", "s2", 5, { prompt: "AC yang nyaman buatmu?", kind: "single", options: ["Dingin sekali", "Sedang", "Bebas"] }),
  ];
  return <Questionnaire form={{ id: "f-preview", name: "Cerita Kita", intro: "Contoh untuk cek tampilan.", minutes: 5, editUntil: null }}
    sections={sections} questions={questions} departments={[]} people={[]} initial={{ answers: {}, anonymousSent: false }}
    nickname="Dewi" home="/dev-preview" preview prefill={{ 1: "Dewi Lestari (Dewi)", 3: "Leader" }} />;
}
