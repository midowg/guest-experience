import { samplePeople } from "@/lib/main-wam/sample";
import type { RankPerson } from "./rank";
import type { TaggedIn } from "./missions";
import { reviewRuleLines, type ReviewItem } from "./review-view";
import type { MissionRule, RuleCheck, RuleType } from "./rules";
import { MISSION_TEMPLATES } from "./templates";
import type { MwCompletion, MwMission } from "./types";

/*
 * Misi's sample data (Mode demo and dev-preview), from the prototype: twelve photo missions (two done, one being checked, one waiting for panitia, one rejected), 118
 * people of whom the asker ranks 7th with 340 points. Every name is made up. Never used outside Mode
 * demo and tests; the server reads it only while the tables are empty.
 */

/** Same shape as sample.ts: a fixed valid uuid per row; sample rows start with 00000000-0000-4000-8. */
const uid = (kind: number, n: number) => `00000000-0000-4000-8${String(kind).padStart(3, "0")}-${String(n).padStart(12, "0")}`;
export const isSampleMission = (id: string) => id.startsWith("00000000-0000-4000-8009");

const lokasiOf = (rules: MwMission["rules"]) => rules.find((rule): rule is Extract<MissionRule, { type: "lokasi" }> => rule.type === "lokasi") ?? null;
const waktuOf = (rules: MwMission["rules"]) => rules.find((rule): rule is Extract<MissionRule, { type: "waktu" }> => rule.type === "waktu") ?? null;

/** The twelve templates as missions (every one a photo mission: Mode demo no longer shows check-in or session missions). */
export const sampleMissions: MwMission[] = MISSION_TEMPLATES.map((template, index) => {
  const lokasi = lokasiOf(template.rules), waktu = waktuOf(template.rules);
  return {
    id: uid(9, index + 1), title: template.title, description: template.description, kind: "foto", points: template.points,
    placeName: lokasi?.name ?? "", latitude: lokasi?.latitude ?? null, longitude: lokasi?.longitude ?? null, radiusM: lokasi?.radiusM ?? null,
    sessionId: null, credit: "panitia", review: false, opensAt: waktu?.start ?? null, closesAt: waktu?.end ?? null, sort: index + 1, active: true, rules: template.rules,
  };
});
export const sampleMissionOf = (key: string): MwMission => sampleMissions[MISSION_TEMPLATES.findIndex(template => template.key === key)];

const done = (employeeId: string, key: string, n: number, extra: Partial<MwCompletion> = {}): MwCompletion => ({
  id: uid(11, n), missionId: sampleMissionOf(key).id, employeeId, source: "foto", status: "disetujui", hasProof: true,
  latitude: null, longitude: null, accuracyM: null, distanceM: null, takenAt: null, note: "", reviewedBy: null, reviewedAt: null, reviewNote: "", createdAt: "2027-01-05T08:00:00+07:00",
  attempts: 1, photoId: null, checkResult: null, ...extra,
});

/** The asker's completions, one of each state: approved (two), being checked, waiting for panitia, rejected (can send again); the rest not sent. */
export const sampleCompletions = (employeeId: string): MwCompletion[] => [
  done(employeeId, "sekamar", 1),
  done(employeeId, "kaos-tema", 2),
  done(employeeId, "kebun-apel", 3, { status: "diperiksa" }),
  done(employeeId, "sunrise", 4, { status: "perlu_ditinjau", checkResult: { checks: [], verifier: { provider: "manual", result: { putusan: "ragu", alasan: ["Menunggu tinjauan panitia."] } }, decidedAt: "2027-01-05T08:00:30+07:00" } }),
  done(employeeId, "bod-berdua", 5, { status: "ditolak", reviewNote: "Hanya satu anggota BOD yang ditandai. Tandai keduanya.", attempts: 1 }),
];

/** A sample "Kamu ditandai" row (Contoh Sari tagged the asker in her roommate selfie). */
export const sampleTaggedIn: TaggedIn[] = [{ photoId: uid(13, 1), byName: "Sari", missionTitle: "Selfie dengan teman sekamar" }];

/** One sample proof in the admin's review queue (Admin WAM → Misi → Tinjauan). Photos are the demo SVGs. */
export const sampleReviewQueue = (): ReviewItem[] => {
  const mission = (key: string) => sampleMissionOf(key);
  const verdict = { provider: "manual", result: { putusan: "ragu" as const, alasan: ["Menunggu tinjauan panitia."] } };
  const check = (ok: (boolean | null)[], types: RuleType[], reasons: string[] = []) => types.map((type, index): RuleCheck => ({ type, ok: ok[index], reason: reasons[index] ?? "" }));
  return [
    { id: uid(12, 1), missionId: mission("bod-berdua").id, missionTitle: mission("bod-berdua").title, points: mission("bod-berdua").points, person: "Contoh Rani", department: "CoE", status: "perlu_ditinjau",
      submittedAt: "2027-01-05T09:12:00+07:00", attempts: 1, maxAttempts: 3, photo: "/wam/demo/foto-05.svg", tags: [{ id: uid(1, 19), name: "Contoh Arman", department: "BOD" }, { id: uid(1, 20), name: "Contoh Wulan", department: "BOD" }],
      rules: reviewRuleLines(mission("bod-berdua")),
      checks: check([true, true, null, true], ["foto_langsung", "tag", "pose", "batas_kali"]), verifier: verdict, reviewNote: "" },
    { id: uid(12, 2), missionId: mission("plank-jatim-park").id, missionTitle: mission("plank-jatim-park").title, points: mission("plank-jatim-park").points, person: "Contoh Sari", department: "HRGA", status: "perlu_ditinjau",
      submittedAt: "2027-01-05T10:40:00+07:00", attempts: 1, maxAttempts: 2, photo: "/wam/demo/foto-12.svg", tags: [{ id: uid(1, 3), name: "Contoh Dewi", department: "Art & Creative Support" }],
      rules: reviewRuleLines(mission("plank-jatim-park")),
      checks: check([true, true, true, null, true, true], ["foto_langsung", "lokasi", "tag", "pose", "waktu", "batas_kali"]), verifier: verdict, reviewNote: "" },
    { id: uid(12, 3), missionId: mission("sunrise").id, missionTitle: mission("sunrise").title, points: mission("sunrise").points, person: "Contoh Bima", department: "Finance", status: "perlu_ditinjau",
      submittedAt: "2027-01-05T06:05:00+07:00", attempts: 1, maxAttempts: 2, photo: "/wam/demo/foto-20.svg", tags: [],
      rules: reviewRuleLines(mission("sunrise")),
      checks: check([true, true, null, true, true], ["foto_langsung", "lokasi", "pose", "waktu", "batas_kali"]), verifier: verdict, reviewNote: "" },
  ];
};

const FIRST = ["Aditya", "Bagas", "Citra", "Dian", "Eka", "Farah", "Galih", "Hesti", "Indra", "Jihan", "Kirana", "Lukman", "Mira", "Nadia", "Oka", "Panji", "Qori", "Rizky", "Salsa", "Tegar", "Umar", "Vina", "Wisnu", "Yuni", "Zaki"];
const LAST = "ABDHKMPRSTW";
const DEPARTMENTS = ["CoE", "Finance", "IT", "Comms", "HRGA", "Sales & Marketing", "Art & Creative Support", "Corporate"];
const TOP = [620, 580, 540, 490, 440, 390];

/** 118 people, Rani (the asker) 7th with 340 points; the others are made up, with a spread of points below her. */
export function sampleBoard(meId: string, meName = samplePeople.rani.name, total = 118): RankPerson[] {
  const people: RankPerson[] = [];
  for (let index = 0; index < total; index++) {
    const me = index === 6;
    const points = index < 6 ? TOP[index] : index === 6 ? 340 : Math.max(0, 335 - (index - 7) * 3);
    people.push({
      id: me ? meId : uid(10, index + 1),
      name: me ? meName : `${FIRST[(index * 7 + 3) % FIRST.length]} ${LAST[(index * 5) % LAST.length]}.`,
      department: DEPARTMENTS[(index * 3) % DEPARTMENTS.length],
      points, missions: Math.max(0, Math.min(5, Math.round(points / 70))),
    });
  }
  return people;
}
