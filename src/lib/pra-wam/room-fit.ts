import type { Room } from "./appraisal";

/*
 * Which rooms a booking may take, by how many people come (the booker and the participants). A
 * room holds at most `capacity` and is meant for at least `minPeople`, so a one-on-one never takes
 * the big meeting room. A room the super admin has not filled in yet is allowed, with a note. The
 * form and the server both use this, so they never disagree.
 *
 * Over capacity (6 Nov 2026): the largest room (`largest`, from largestCapacity) may still be taken
 * by more people than it holds, say all 56 in Limasan for 50, once the booker confirms (`over`).
 */

export type RoomFit =
  | { ok: true; note: string | null; over?: boolean }
  | { ok: false; reason: "kecil" | "besar" | "tutup"; text: string };

/** The booker plus each participant, counted once. */
export const headcount = (participants: number) => Math.max(1, participants + 1);

/** The capacity of the largest room that can be booked; null when none has one. */
export function largestCapacity(rooms: Pick<Room, "bookable" | "capacity">[]): number | null {
  const sizes = rooms.filter(room => room.bookable && room.capacity != null).map(room => room.capacity as number);
  return sizes.length ? Math.max(...sizes) : null;
}

export function roomFit(room: Pick<Room, "bookable" | "capacity" | "minPeople">, people: number, largest: number | null = null): RoomFit {
  if (!room.bookable) return { ok: false, reason: "tutup", text: "Tidak bisa dibooking" };
  if (room.capacity != null && people > room.capacity && largest != null && room.capacity >= largest) {
    return { ok: true, over: true, note: `Melebihi kapasitas ${room.capacity} orang` };
  }
  if (room.capacity != null && people > room.capacity) return { ok: false, reason: "kecil", text: `Terlalu kecil: muat ${room.capacity} orang` };
  if (room.minPeople != null && people < room.minPeople) return { ok: false, reason: "besar", text: `Untuk minimal ${room.minPeople} orang` };
  if (room.capacity == null) return { ok: true, note: "Kapasitas belum diisi" };
  return { ok: true, note: `Muat ${room.capacity} orang` };
}

/** Allowed, but over the room's capacity (needs the booker's yes). */
export const isOver = (fit: RoomFit) => fit.ok && fit.over === true;

/** "1-on-1" for two, else "6 orang". */
export const peopleLabel = (people: number) => (people === 2 ? "2 orang (one-on-one)" : `${people} orang`);
