import "server-only";
import { ServiceError, isSupabaseConfigured } from "../../config";
import { currentForm } from "../../pra-wam/questionnaire";
import { mwMissing } from "../errors";
import { mainWamPeople } from "../people";
import { adminFail, db } from "./common";

/*
 * Admin WAM → Main WAM → Kamar (agen E). The rooms and who shares them come from HR's pairing
 * (Kuesioner → Kamar: cq_stay_rooms and cq_stay_members of the questionnaire, any number of people
 * up to the room's capacity); this page only reads them, with names, and adds what the handbook
 * shows besides: the floor and a note (mw_stay_room_details). The stay answers themselves (Data HR)
 * are never read here.
 */

export type AdminRoom = {
  id: string; name: string; kind: string; capacity: number; floor: string; note: string;
  people: { id: string; fullName: string; department: string }[];
};
export type AdminRoomBoard = {
  /** The questionnaire the pairing belongs to; null when there is none yet. */
  form: { id: string; name: string; published: boolean; stayDeleteOn: string | null } | null;
  rooms: AdminRoom[];
  /** False before HR's room migration (202611050001). */
  stayReady: boolean;
  /** False before Main WAM's migration (floor and note). */
  migrated: boolean;
};

const stayMissing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") && /cq_stay|rooms_published_at/.test(error.message ?? "");

export async function adminRooms(): Promise<AdminRoomBoard> {
  const empty: AdminRoomBoard = { form: null, rooms: [], stayReady: false, migrated: false };
  if (!isSupabaseConfigured()) return empty;
  const form = await currentForm();
  if (!form) return { ...empty, stayReady: true, migrated: await detailsReady() };
  const client = db();
  const [published, rooms, members, details, people] = await Promise.all([
    client.from("cq_forms").select("rooms_published_at").eq("id", form.id).maybeSingle(),
    client.from("cq_stay_rooms").select("id,name,kind,capacity,sort").eq("form_id", form.id).order("sort").order("name").limit(2000),
    client.from("cq_stay_members").select("room_id,employee_id").eq("form_id", form.id).limit(5000),
    client.from("mw_stay_room_details").select("room_id,floor,note").limit(2000),
    mainWamPeople(),
  ]);
  for (const result of [published, rooms, members]) {
    if (result.error) { if (stayMissing(result.error)) return { ...empty, migrated: !details.error }; adminFail(result.error); }
  }
  if (details.error && !mwMissing(details.error)) adminFail(details.error);
  const detail = new Map(((details.error ? [] : details.data) ?? []).map(row => [row.room_id as string, row as { floor: string; note: string }]));
  const byRoom = new Map<string, AdminRoom["people"]>();
  for (const row of (members.data ?? []) as { room_id: string; employee_id: string }[]) {
    const person = people.get(row.employee_id);
    const list = byRoom.get(row.room_id) ?? [];
    list.push({ id: row.employee_id, fullName: person?.fullName ?? "Tanpa nama", department: person?.department ?? "" });
    byRoom.set(row.room_id, list);
  }
  return {
    form: { id: form.id, name: form.name, published: !!(published.data as { rooms_published_at: string | null } | null)?.rooms_published_at, stayDeleteOn: form.stayDeleteOn },
    stayReady: true,
    migrated: !details.error,
    rooms: ((rooms.data ?? []) as { id: string; name: string; kind: string; capacity: number }[]).map(room => ({
      id: room.id, name: room.name, kind: room.kind, capacity: room.capacity,
      floor: detail.get(room.id)?.floor ?? "", note: detail.get(room.id)?.note ?? "",
      people: (byRoom.get(room.id) ?? []).sort((a, b) => a.fullName.localeCompare(b.fullName, "id")),
    })),
  };
}

async function detailsReady(): Promise<boolean> {
  const { error } = await db().from("mw_stay_room_details").select("room_id").limit(1);
  return !error;
}

/** Lantai and catatan of one room of the current pairing. */
export async function saveRoomDetail(roomId: string, input: { floor: string; note: string }): Promise<{ id: string; floor: string; note: string }> {
  const form = await currentForm();
  if (!form) throw new ServiceError(404, "Pembagian kamar belum ada. Isi dulu di Kuesioner → Kamar.");
  const { data: room, error: roomError } = await db().from("cq_stay_rooms").select("id").eq("id", roomId).eq("form_id", form.id).maybeSingle();
  if (roomError) { if (stayMissing(roomError)) throw new ServiceError(503, "Kamar menunggu migrasi 202611050001_wam_stay_rooms.sql."); adminFail(roomError); }
  if (!room) throw new ServiceError(404, "Kamar tidak ditemukan. Muat ulang halaman.");
  const { error } = await db().from("mw_stay_room_details").upsert({ room_id: roomId, floor: input.floor, note: input.note, updated_at: new Date().toISOString() }, { onConflict: "room_id" });
  if (error) adminFail(error, { invalid: "Lantai paling panjang 40 karakter, catatan 200." });
  return { id: roomId, floor: input.floor, note: input.note };
}
