import "server-only";
import { after } from "next/server";
import type { TaggedIn } from "@/lib/main-wam/misi/missions";
import type { TagCandidate } from "@/lib/main-wam/misi/rules";
import { seatmatesOf } from "@/lib/main-wam/misi/tags";
import { MISSIONS_PHOTO_MIGRATION } from "@/lib/main-wam/misi/types";
import { mainWamPath } from "@/lib/routes";
import { ServiceError } from "../../config";
import { createPrivilegedClient } from "../../supabase/admin";
import { mwFail, mwMissing, type DbError } from "../errors";
import type { MainWamContext } from "../gate";
import { trySendMainWamNote } from "../notes";
import { mainWamEventPeople, mainWamPeople } from "../people";
import { listTrips, seatsOf } from "../read";
import { viewerRoom } from "../viewer";

/*
 * Tagging friends on a mission photo (docs/main-wam/KONTRAK.md §13). Only an active participant of the
 * event can be tagged (never someone without a WAM account, never the person themselves), the tagged
 * person is told ("Kamu ditandai di foto misi ...") once the photo is shown, and they can lift their own
 * tag. Tags live in mw_photo_tags {photo_id, employee_id, tagged_by, created_at, removed_at}: a removed
 * tag stays as a row with removed_at so a re-sent photo never tags the person again.
 */

const db = () => createPrivilegedClient();

/** Everyone the person could tag, with what the rules need to know about each (BOD, seat and room mates). */
export async function loadTagPool(context: Pick<MainWamContext, "viewer">): Promise<Map<string, TagCandidate>> {
  const meId = context.viewer.id;
  const [event, people, room] = await Promise.all([mainWamEventPeople(), mainWamPeople(), viewerRoom(meId).catch(() => null)]);
  const roommates = new Set((room?.people ?? []).filter(person => !person.me).map(person => person.id));
  const seatmates = await seatmatesFor(meId).catch(() => new Set<string>());
  const pool = new Map<string, TagCandidate>();
  for (const id of event.accounts) {
    const person = people.get(id);
    if (id === meId || !person || !person.active) continue;
    pool.set(id, { id, name: person.name, department: person.department, bod: event.bod.has(id), seatmate: seatmates.has(id), roommate: roommates.has(id), photo: person.photo ?? null });
  }
  return pool;
}

/** The people next to me on the train: same coach and row on the same train step (mw_trip_seats). */
async function seatmatesFor(meId: string): Promise<Set<string>> {
  const [mine, trips] = await Promise.all([seatsOf(meId), listTrips()]);
  const trains = new Set(trips.data.filter(trip => trip.kind === "kereta").map(trip => trip.id));
  const myTrains = [...new Set(mine.data.filter(seat => trains.has(seat.tripId) && seat.seat).map(seat => seat.tripId))];
  if (!myTrains.length) return new Set();
  const { data, error } = await db().from("mw_trip_seats").select("trip_id,employee_id,seat").in("trip_id", myTrains).limit(5000);
  if (error) return new Set();
  const all = ((data ?? []) as { trip_id: string; employee_id: string; seat: string }[]).map(row => ({ tripId: row.trip_id, employeeId: row.employee_id, seat: row.seat }));
  // Mode demo: the sample's seats only hold the asker's own; the real table is empty then, so there are no seatmates (the demo screens bring their own).
  return seatmatesOf(meId, [...mine.data.filter(seat => myTrains.includes(seat.tripId)), ...all]);
}

/** The people tagged, looked up in the pool; anyone who is not a participant (or is the person) is a 422. */
export function resolveTags(pool: ReadonlyMap<string, TagCandidate>, ids: readonly string[]): TagCandidate[] {
  const unique = [...new Set(ids.map(id => id.toLowerCase()))];
  const found = unique.map(id => pool.get(id));
  if (found.some(person => !person)) throw new ServiceError(422, "Orang yang ditandai harus peserta acara yang aktif.");
  return found as TagCandidate[];
}

/** Keeps the tags of a photo (a person already tagged, or who lifted their tag, is left as it is). */
export async function savePhotoTags(photoId: string, taggedBy: string, tags: readonly TagCandidate[]): Promise<void> {
  if (!tags.length) return;
  const { error } = await db().from("mw_photo_tags").upsert(tags.map(tag => ({ photo_id: photoId, employee_id: tag.id, tagged_by: taggedBy })), { onConflict: "photo_id,employee_id", ignoreDuplicates: true });
  if (error) mwFail(error as DbError, MISSIONS_PHOTO_MIGRATION);
}

/** The words of "you were tagged": about a mission photo, or (no mission title) about a regular Momen photo. */
const taggedWords = (taggerName: string, missionTitle: string | null) => missionTitle
  ? { title: `Kamu ditandai di foto misi ${missionTitle}`, body: `${taggerName} menandaimu di foto misi ${missionTitle}. Kamu bisa melepas tag dari halaman Misi.` }
  : { title: "Kamu ditandai di sebuah foto", body: `${taggerName} menandaimu di foto Momen. Kamu bisa melepas tag dari halaman Misi.` };

/** Tells every tag still on the photo (never throws). */
export async function tellTagged(photoId: string, taggerName: string, missionTitle: string | null): Promise<void> {
  const { data, error } = await db().from("mw_photo_tags").select("employee_id").eq("photo_id", photoId).is("removed_at", null);
  if (error || !data?.length) return;
  await trySendMainWamNote({
    kind: "lain", ...taggedWords(taggerName, missionTitle),
    to: { people: data.map(row => row.employee_id as string), label: "Orang yang ditandai" }, link: mainWamPath.missions, by: null, tag: `tag-${photoId}`,
  });
}

/** "Kamu ditandai di foto misi <judul>", to every tag still on the photo (never throws; after the response when it can). */
export async function notifyTagged(photoId: string, taggerName: string, missionTitle: string): Promise<void> {
  const send = () => tellTagged(photoId, taggerName, missionTitle);
  try { after(send); } catch { await send(); }
}

/** A person lifting their own tag off a photo. 404 when they are not tagged there (or already lifted it). */
export async function removeMyTag(context: Pick<MainWamContext, "viewer">, photoId: string): Promise<void> {
  const { data, error } = await db().from("mw_photo_tags").update({ removed_at: new Date().toISOString() }).eq("photo_id", photoId).eq("employee_id", context.viewer.id).is("removed_at", null).select("photo_id");
  if (error) mwFail(error as DbError, MISSIONS_PHOTO_MIGRATION);
  if (!data?.length) throw new ServiceError(404, "Tag tidak ditemukan.");
}

export type PhotoTag = { id: string; name: string };

/**
 * For Momen (to be wired by its screens): who is tagged on each of these photos, by the name Momen shows
 * ("Bersama Sari, Dewi"), only tags still on. A photo without tags is not in the map; before the migration
 * the map is empty.
 */
export async function tagsOfPhotos(photoIds: readonly string[]): Promise<Map<string, PhotoTag[]>> {
  const out = new Map<string, PhotoTag[]>();
  const ids = [...new Set(photoIds)].filter(id => /^[0-9a-f-]{36}$/i.test(id));
  if (!ids.length) return out;
  const { data, error } = await db().from("mw_photo_tags").select("photo_id,employee_id,created_at").in("photo_id", ids).is("removed_at", null).order("created_at").limit(2000);
  if (error) { if (mwMissing(error)) return out; mwFail(error as DbError, MISSIONS_PHOTO_MIGRATION); }
  const people = await mainWamPeople();
  for (const row of (data ?? []) as { photo_id: string; employee_id: string }[]) {
    const person = people.get(row.employee_id);
    if (!person) continue;
    out.set(row.photo_id, [...(out.get(row.photo_id) ?? []), { id: person.id, name: person.name }]);
  }
  return out;
}

/** The photos I am tagged in (still on), for the Misi page's "Kamu ditandai" list. Quiet before the migration. */
export async function taggedInOf(employeeId: string): Promise<TaggedIn[]> {
  const { data, error } = await db().from("mw_photo_tags").select("photo_id,tagged_by").eq("employee_id", employeeId).is("removed_at", null).order("created_at", { ascending: false }).limit(20);
  if (error || !data?.length) return [];
  const rows = data as { photo_id: string; tagged_by: string }[];
  const photos = await db().from("mw_photos").select("id,mission_id").in("id", rows.map(row => row.photo_id)).eq("status", "tampil");
  if (photos.error) return [];
  const shown = new Set((photos.data ?? []).map(photo => photo.id as string));
  const missionIds = [...new Set((photos.data ?? []).map(photo => photo.mission_id as string | null).filter((id): id is string => !!id))];
  const missions = missionIds.length ? await db().from("mw_missions").select("id,title").in("id", missionIds) : { data: [], error: null };
  if (missions.error) return [];
  const titles = new Map((missions.data ?? []).map(mission => [mission.id as string, mission.title as string]));
  const missionOf = new Map((photos.data ?? []).map(photo => [photo.id as string, photo.mission_id as string | null]));
  const people = await mainWamPeople();
  return rows.flatMap(row => {
    if (!shown.has(row.photo_id)) return [];
    const missionId = missionOf.get(row.photo_id);
    // A photo made for a mission has its title; a regular Momen photo has none (an empty title says so).
    const title = missionId ? titles.get(missionId) : "";
    return title !== undefined && title !== null ? [{ photoId: row.photo_id, byName: people.get(row.tagged_by)?.name ?? "Rekan", missionTitle: title }] : [];
  });
}
