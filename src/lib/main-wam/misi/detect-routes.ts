import { mainWamApi } from "@/lib/routes";

/*
 * The addresses of mission detection from Momen photos. Built on the Misi and Momen APIs of routes.ts, so
 * a change of the base there moves these too.
 */
const enc = encodeURIComponent;
const MISI = mainWamApi.missions;
const MOMEN = mainWamApi.photosSeen.replace(/\/dilihat$/, "");

export const misiDetectApi = {
  /** GET: my switch "Deteksi misi otomatis"; PUT {on}: change it. */
  switch: `${MISI}/deteksi`,
  /** POST: "Periksa fotoku": look at my newest photos that were never looked at (at most 30). */
  checkMine: `${MISI}/periksa`,
  /** POST {photoId}: send this Momen photo for this mission ("Ajukan" on a suggestion); DELETE {photoId}: "Abaikan" it. */
  submit: (missionId: string) => `${MISI}/${enc(missionId)}/ajukan`,
  /** DELETE: take back the proof made from a Momen photo (while nobody has decided). */
  takeBack: (missionId: string) => `${MISI}/${enc(missionId)}/otomatis`,
  /** GET: what detection found for one photo of mine (the toast after sending). */
  ofPhoto: (photoId: string) => `${MOMEN}/${enc(photoId)}/deteksi`,
};
