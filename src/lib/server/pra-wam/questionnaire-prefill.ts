import "server-only";
import { highestPost, prefillAnswers, type PrefillPerson } from "@/lib/pra-wam/questionnaire-prefill";
import type { Answers, QQuestion } from "@/lib/pra-wam/questionnaire";
import { jobsOf } from "../employee-jobs";
import { listEmployees } from "../employees";

/**
 * What Data karyawan fills in on this person's questionnaire (see questionnaire-prefill.ts). The
 * position is left to the person when they are BOD (no option fits) or have no job in Data
 * karyawan. Nothing when Data karyawan cannot be read: the questions are then simply empty.
 */
export async function prefillFor(employeeId: string, questions: QQuestion[], answers: Answers, departments: string[], { bod = false }: { bod?: boolean } = {}): Promise<Answers> {
  try {
    const { employees } = await listEmployees(true);
    const person = employees.find(item => item.id === employeeId);
    if (!person) return {};
    const jobs = bod ? [] : await jobsOf(person).catch(() => []);
    const known: PrefillPerson = {
      fullName: person.full_name, nickname: person.nickname ?? "", phone: person.phone ?? "", gender: person.gender ?? "",
      department: person.department ?? "", post: bod ? null : highestPost(jobs.map(job => job.post)), category: person.category,
    };
    return prefillAnswers(questions, answers, known, departments);
  } catch {
    return {};
  }
}
