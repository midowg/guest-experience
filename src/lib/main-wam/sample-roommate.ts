import type { RoomPerson } from "./types";
import { roommateAnswers, type RoommateView } from "./peserta/roommate";

/*
 * Made-up roommate profiles for Mode demo and the dev-preview (the repo is public): every answer is an
 * "Contoh ...". The first roommate has filled the questionnaire, the second has not (the empty state).
 */

const ANSWERS = [
  { key: "17", prompt: "Kamu paling suka ngapain di luar kerjaan?", lines: ["Musik", "Kuliner & masak", "Traveling"] },
  { key: "18", prompt: "Lebih spesifiknya? Atau topik yang bikin kamu betah ngobrol berjam-jam.", lines: ["Contoh: kopi manual brew dan film lawas"] },
  { key: "20", prompt: "Di acara kelompok, kamu paling nyaman di mana?", lines: ["Kelompok kecil"] },
  { key: "21", prompt: "Aktivitas bareng yang paling kamu nikmati?", lines: ["Kuliner", "Santai tanpa agenda"] },
  { key: "21b", prompt: "Makanan atau camilan yang paling kamu suka, apa pun itu?", lines: ["Contoh: martabak manis dan es kopi susu"] },
  { key: "22", prompt: "Satu hal tentang kamu yang jarang diketahui orang kantor?", lines: ["Contoh: pernah ikut lomba memasak tingkat kota"] },
  { key: "37", prompt: "Lagu yang selalu bikin kamu semangat?", lines: ["Contoh: judul lagu dan penyanyi rekaan"] },
  { key: "E7", prompt: "Satu keahlianmu yang mungkin belum diketahui departemen lain, dan boleh mereka mintai tolong?", lines: ["Contoh: rumus Excel dan edit video sederhana"] },
];

/** The sample profile of a roommate: the one at an even place has filled in, the next has not. */
export function sampleRoommate(person: RoomPerson & { photo?: string | null }, index = 0): RoommateView {
  const base = { id: person.id, name: person.name, department: person.department, photo: person.photo ?? null };
  if (index % 2 === 1) return { person: base, card: null, answers: [], filled: false };
  return { person: base, card: { name: "Contoh Tokoh", kind: "Penjelajah", tier: "Rare" }, answers: roommateAnswers(ANSWERS), filled: true };
}
