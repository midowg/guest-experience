import type { TagCandidate } from "@/lib/main-wam/misi/rules";
import { DEFAULT_CAMERA_TONE, type CameraToneId } from "./camera-filters";
import { DEFAULT_SIGN, type SignId } from "./camera-templates";

/*
 * The rules of "Periksa fotomu" (docs/main-wam/KONTRAK.md §38), the editor between the shutter and Kirim. Pure and tested:
 * the look (sign + tone) of each photo and "Terapkan ke semua foto", the one list of people (BOD first, a search over name
 * and department, no limit on how many are chosen) and the name of the original saved on the phone.
 */

/** What is drawn on a photo when it is sent: a sign (frame, words, mark) and a colour tone. The picture itself is never changed. */
export type Look = { sign: SignId; tone: CameraToneId };
export const DEFAULT_LOOK: Look = { sign: DEFAULT_SIGN, tone: DEFAULT_CAMERA_TONE };

/** A change of look: to the chosen photo, or to every photo when "Terapkan ke semua foto" is on. */
export function changeLook<T extends Look>(photos: readonly T[], index: number, change: Partial<Look>, all: boolean): T[] {
  return photos.map((photo, at) => (all || at === index ? { ...photo, ...change } : photo));
}

/** "Terapkan ke semua foto" switched on: every photo takes the look of the chosen one. */
export function lookToAll<T extends Look>(photos: readonly T[], index: number): T[] {
  const from = photos[index];
  return from ? photos.map(photo => ({ ...photo, sign: from.sign, tone: from.tone })) : [...photos];
}

/** The photo that stays chosen when one is dropped or the list changes (never out of range). */
export const clampIndex = (index: number, count: number) => Math.max(0, Math.min(index, count - 1));

/**
 * The one list of people: everyone matching the search (name or department), BOD first, then by name. There is no
 * "suggested" block and no limit on how many are chosen: the list is the people of the event, a few hundred at most.
 */
export function listPeople(candidates: readonly TagCandidate[], query: string): TagCandidate[] {
  const needle = query.trim().toLowerCase();
  return candidates
    .filter(person => !needle || person.name.toLowerCase().includes(needle) || person.department.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.bod) - Number(a.bod) || a.name.localeCompare(b.name, "id"));
}

/** A person chosen or taken off (the order of choosing is kept). */
export const toggleId = (ids: readonly string[], id: string): string[] => (ids.includes(id) ? ids.filter(other => other !== id) : [...ids, id]);

/** The ids that still belong to a person in the list (an old choice never goes to the server for someone who is gone). */
export const knownIds = (ids: readonly string[], candidates: readonly TagCandidate[]): string[] => {
  const known = new Set(candidates.map(person => person.id));
  return ids.filter(id => known.has(id));
};

/** The name of the original copy kept on the phone: wam-momen-20270105-152003.jpg (numbered when there are several). */
export function originalName(at: Date, index = 0): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  return `wam-momen-${stamp}${index > 0 ? `-${index + 1}` : ""}.jpg`;
}
