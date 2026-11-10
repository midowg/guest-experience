import "server-only";
import { normalizeRoles } from "@/lib/pra-wam/roles";
import { ServiceError } from "../config";
import { listAccounts, setRoles } from "../pra-wam/accounts";
import { listRooms } from "../pra-wam/appraisal";
import { createRoom, saveRoom } from "../pra-wam/rooms";
import { rolesOf, type Member } from "../pra-wam/session";

/*
 * Booking Kantor → Kelola, the administration staff's settings (11 Nov 2026): the rooms (the same
 * pw_rooms as Admin WAM → Ruang dan denah, so both see one list) and who is Admin Booking. What
 * belongs to WAM only stays there: a room's floor plan spot and its fewest people (Booking Kantor
 * has no fewest-people rule), which are kept as they are when a room is saved here.
 */

export type OfficeRoomPatch = { name: string; capacity: number | null; bookable: boolean; facilities: string[]; departments: string[] };

/** Saves one room's name, capacity, facilities, departments and whether it can be booked. */
export async function saveOfficeRoom(id: string, patch: OfficeRoomPatch): Promise<void> {
  const room = (await listRooms()).find(item => item.id === id);
  if (!room) throw new ServiceError(404, "Ruangan tidak ditemukan.");
  // Its fewest people must not end above a smaller capacity, or WAM's own rule refuses the save.
  const minPeople = room.minPeople != null && patch.capacity != null && room.minPeople > patch.capacity ? null : room.minPeople;
  await saveRoom(id, { ...patch, name: patch.name === room.name ? undefined : patch.name, minPeople, planKey: room.planKey });
}

/** A new room, bookable at once (Admin WAM's own starts closed until it is set up). */
export async function createOfficeRoom(name: string, capacity: number | null): Promise<string> {
  const id = await createRoom({ name, kind: "utama" });
  await saveRoom(id, { capacity, minPeople: null, bookable: true, planKey: null });
  return id;
}

export type AccessRow = { employeeId: string; name: string; department: string; hasAccount: boolean; booking: boolean; wamAdmin: boolean };

/** Everyone active with their Booking Kantor access: Admin Booking (given here) or Admin WAM (always, set in Admin WAM). */
export async function accessList(): Promise<{ rows: AccessRow[]; migrated: boolean }> {
  const { rows, migrated } = await listAccounts();
  return {
    migrated,
    rows: rows.filter(row => row.active).map(row => ({
      employeeId: row.employeeId, name: row.name, department: row.department, hasAccount: row.hasAccount,
      booking: row.roles.includes("ga"), wamAdmin: row.roles.includes("admin"),
    })),
  };
}

/** Gives or takes Admin Booking, keeping the person's other roles. Nobody takes their own away (someone else must). */
export async function setBookingAdmin(employeeId: string, on: boolean, viewer: Member): Promise<void> {
  if (!on && employeeId === viewer.id) throw new ServiceError(422, "Akses sendiri tidak bisa dicabut. Minta Admin Booking lain.");
  const current = await rolesOf(employeeId);
  const next = on ? [...current, "ga" as const] : current.filter(role => role !== "ga");
  // Before migration 202611100006 the database refuses the role; setRoles answers with its own error then.
  await setRoles(employeeId, normalizeRoles(next));
}
