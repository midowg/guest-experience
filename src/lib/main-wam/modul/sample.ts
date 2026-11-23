import { samplePeople, samplePhotos, sampleAwards, sampleSessions, sampleSilentQuestion } from "../sample";
import type { MwAwardApproval, MwSilentQuestion } from "../types";
import type { NomineeView } from "./awards";
import type { PanitiaContact } from "./contact";
import { pickSilent, type SilentView } from "./silent";

/*
 * Sample data of agen D's screens for dev-preview and tests, from the prototype (SPEC A01–A05,
 * T01–T03, V01–V02, B05, B06). Made-up names only (public repo). Never used outside dev-preview and tests.
 */

export const at = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);

/** Dimas, panitia acara (number is a placeholder). */
export const sampleContact: PanitiaContact = { name: "Dimas", role: "Panitia acara", photo: null, local: "081234567890", international: "6281234567890" };

/** The Silent Meeting at a moment: belum (12.00), buka (13.45), tutup (15.10). Its session in the prototype runs 13.30–15.00. */
export function sampleSilentView(moment: "belum" | "buka" | "tutup", question: Partial<MwSilentQuestion> = {}): SilentView {
  const sessions = sampleSessions.map(session => (session.id === sampleSilentQuestion.sessionId ? { ...session, startsAt: "2027-01-05T13:30:00+07:00", endsAt: "2027-01-05T15:00:00+07:00" } : session));
  const now = moment === "belum" ? at("2027-01-05", "10:05") : moment === "buka" ? at("2027-01-05", "13:45") : at("2027-01-05", "15:10");
  return pickSilent([{ ...sampleSilentQuestion, ...question }], sessions, now)!;
}

/** Every nominee of the sample categories as the screens show them. */
export function sampleNominees(): Record<string, NomineeView> {
  const people = Object.values(samplePeople);
  const out: Record<string, NomineeView> = {};
  for (const category of sampleAwards) for (const nominee of category.nominees) {
    if (nominee.employeeId) {
      const person = people.find(item => item.id === nominee.employeeId)!;
      out[nominee.id] = { id: nominee.id, kind: "orang", name: person.name, department: person.department, photo: null, reason: nominee.reason, ownerId: person.id, image: null };
    } else if (nominee.photoId) {
      const photo = samplePhotos.find(item => item.id === nominee.photoId)!;
      out[nominee.id] = { id: nominee.id, kind: "foto", name: photo.owner.name, department: "", photo: null, reason: "", ownerId: photo.ownerId, image: null };
    } else {
      out[nominee.id] = { id: nominee.id, kind: "label", name: nominee.label, department: "", photo: null, reason: nominee.reason, ownerId: null, image: null };
    }
  }
  return out;
}

/** B06's count: Rekan paling suportif 96 (31 · 24 · 17 · 14 · 10), Foto Momen terbaik 31 · 22 · 15. */
export function sampleCounts(): Record<string, Record<string, number>> {
  const [suportif, foto] = sampleAwards;
  return {
    [suportif.id]: Object.fromEntries(suportif.nominees.map((nominee, index) => [nominee.id, [31, 24, 17, 14, 10][index] ?? 0])),
    [foto.id]: Object.fromEntries(foto.nominees.map((nominee, index) => [nominee.id, [31, 22, 15][index] ?? 0])),
  };
}

/** The jury category approved by Wulan at 15.40 (B06); with `suportif`, Sari approved by Arman at 16.02. */
export function sampleApprovals(suportif = false): Record<string, MwAwardApproval> {
  const [first, , juri] = sampleAwards;
  const out: Record<string, MwAwardApproval> = {
    [juri.id]: { categoryId: juri.id, nomineeId: juri.nominees[0].id, approvedBy: samplePeople.wulan.id, approvedAt: at("2027-01-06", "15:40").toISOString() },
  };
  if (suportif) out[first.id] = { categoryId: first.id, nomineeId: first.nominees[0].id, approvedBy: samplePeople.arman.id, approvedAt: at("2027-01-06", "16:02").toISOString() };
  return out;
}
