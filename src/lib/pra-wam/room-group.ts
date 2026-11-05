import type { Room } from "./appraisal";

/**
 * The three kinds of room in the admin's words. The database knows only "utama" and "area"; a
 * main room for at most SMALL_ROOM_MAX people (CFC Ananta, Antareja) counts as a small room. A room
 * whose capacity is not filled in stays a main room until it is. The admin's room list and the
 * plan's chair colours both read this, so they always agree.
 */
export type RoomGroup = "utama" | "kecil" | "area";
export const SMALL_ROOM_MAX = 4;
export function roomGroup(room: Pick<Room, "kind" | "capacity">): RoomGroup {
  if (room.kind === "area") return "area";
  return room.capacity != null && room.capacity <= SMALL_ROOM_MAX ? "kecil" : "utama";
}
export const roomGroupLabels: Record<RoomGroup, string> = { utama: "Ruang utama", kecil: "Ruang kecil", area: "Area" };
