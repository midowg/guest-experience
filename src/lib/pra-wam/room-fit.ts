import type { Room } from "./appraisal";

/*
 * Which rooms a booking may take, by how many people come (the booker and the participants). A
 * room holds at most `capacity` and is meant for at least `minPeople`, so a one-on-one never takes
 * the big meeting room. A room the super admin has not filled in yet is allowed, with a note. The
 * form and the server both use this, so they never disagree.
 */

export type RoomFit =
  | { ok: true; note: string | null }
  | { ok: false; reason: "kecil" | "besar" | "tutup"; text: string };

/** The booker plus each participant, counted once. */
export const headcount = (participants: number) => Math.max(1, participants + 1);

export function roomFit(room: Pick<Room, "bookable" | "capacity" | "minPeople">, people: number): RoomFit {
  if (!room.bookable) return { ok: false, reason: "tutup", text: "Tidak bisa dibooking" };
  if (room.capacity != null && people > room.capacity) return { ok: false, reason: "kecil", text: `Terlalu kecil: muat ${room.capacity} orang` };
  if (room.minPeople != null && people < room.minPeople) return { ok: false, reason: "besar", text: `Untuk minimal ${room.minPeople} orang` };
  if (room.capacity == null) return { ok: true, note: "Kapasitas belum diisi" };
  return { ok: true, note: `Muat ${room.capacity} orang` };
}

/** "1-on-1" for two, else "6 orang". */
export const peopleLabel = (people: number) => (people === 2 ? "2 orang (one-on-one)" : `${people} orang`);
