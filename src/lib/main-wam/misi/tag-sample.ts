import { samplePeople } from "@/lib/main-wam/sample";
import type { TagCandidate } from "./rules";

/** The people a sample asker may tag: Arman and Wulan are BOD, Sari and Dewi share her room, Bima sits next to her on the train. */
export function sampleTagCandidates(meId: string): TagCandidate[] {
  const roommates = new Set(["sari", "dewi"]), seatmates = new Set(["bima"]);
  return Object.entries(samplePeople).filter(([, person]) => person.id !== meId).map(([key, person]) => ({
    id: person.id, name: person.name, department: person.department, bod: person.department === "BOD", roommate: roommates.has(key), seatmate: seatmates.has(key),
  }));
}
