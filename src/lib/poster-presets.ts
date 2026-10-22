import { tzLabel } from "./timezones";
import { emptyPoster, posterDate, posterDuration, posterTime, type PosterBox, type PosterField, type PosterFormat, type PosterSettings } from "./poster";
import type { EventRecord } from "./types";

/**
 * Ready-made poster templates. A preset carries its own background per format (drawn by
 * scripts/poster-backgrounds.mjs into public/poster/) until the admin uploads one from Figma,
 * and the boxes that sit on it. To add a preset: add an entry here and its backgrounds.
 */
export type PosterPreset = { key: string; name: string; description: string; backgrounds: Record<PosterFormat, string>; fields: (event: EventRecord) => PosterField[] };

const GREEN = "#0f4a3a", INK = "#1f2a24", BODY = "#2f3a33", MUTED = "#5d6157", CREAM = "#fbf7ef";

type Style = Partial<Omit<PosterField, "key" | "label" | "hint" | "box">>;
const base: Omit<PosterField, "key" | "label" | "hint" | "box"> = {
  kind: "text", editable: true, value: "", maxLength: 120, font: "nunito", weight: 600, color: INK,
  align: "left", uppercase: false, letterSpacing: 0, sizeMax: 24, sizeMin: 14, lineHeight: 1.25, maxLines: 1, radius: 0, fill: "#e9dfcb",
};
const field = (key: string, label: string, hint: string, post: PosterBox | null, story: PosterBox | null, style: Style = {}): PosterField =>
  ({ ...base, ...style, key, label, hint, box: { post, story } });
const at = (x: number, y: number, w: number, h: number): PosterBox => ({ x, y, w, h });

/** After the JCWF example "Meramu Rempah Nusantara": cream, deep green and gold. */
const rempah: PosterPreset = {
  key: "rempah-nusantara",
  name: "Rempah Nusantara",
  description: "Krem, hijau tua, dan emas. Judul berkait di atas, foto lebar, rincian sesi di bawah.",
  backgrounds: { post: "/poster/rempah-nusantara-post.svg", story: "/poster/rempah-nusantara-story.svg" },
  fields: event => [
    field("title", "Judul sesi", "Judul sesi", at(64, 40, 620, 172), at(72, 210, 936, 270), { font: "playfair", weight: 400, color: GREEN, sizeMax: 96, sizeMin: 52, lineHeight: 1.02, maxLines: 3, maxLength: 60 }),
    field("category", "Kategori", "Kategori sesi", at(730, 142, 290, 40), at(72, 515, 936, 44), { uppercase: true, letterSpacing: 0.16, color: GREEN, sizeMax: 24, sizeMin: 15, maxLength: 40 }),
    field("photo", "Foto utama", "Unggah foto utama", at(0, 215, 1080, 660), at(0, 590, 1080, 620), { kind: "photo" }),
    field("with_label", "Label \"Bersama\"", "Bersama", at(64, 905, 300, 26), at(72, 1240, 400, 28), { editable: false, value: "Bersama", uppercase: true, letterSpacing: 0.2, weight: 700, color: MUTED, sizeMax: 16, sizeMin: 12 }),
    field("host", "Fasilitator / komunitas", "Nama fasilitator", at(64, 932, 395, 66), at(72, 1268, 936, 70), { font: "playfair", weight: 400, color: GREEN, sizeMax: 46, sizeMin: 28, lineHeight: 1.1, maxLength: 50 }),
    field("host_photo", "Foto fasilitator", "Foto fasilitator", at(64, 1015, 150, 180), at(72, 1345, 140, 160), { kind: "photo", radius: 10, fill: "#f3ead8" }),
    field("description", "Deskripsi", "Ceritakan sesi ini dalam 2–3 kalimat", at(232, 1015, 228, 300), at(236, 1345, 772, 160), { weight: 400, color: BODY, sizeMax: 22, sizeMin: 15, lineHeight: 1.4, maxLines: 12, maxLength: 320 }),
    field("date", "Hari & tanggal", "Hari, tanggal", at(580, 922, 185, 78), at(130, 1525, 400, 60), { value: posterDate(event.starts_at, event.timezone), sizeMax: 25, sizeMin: 16, maxLines: 2, maxLength: 40 }),
    field("time", "Jam", "Jam", at(580, 1030, 185, 48), at(610, 1525, 398, 60), { value: posterTime(event.starts_at, event.timezone, tzLabel(event.timezone)), sizeMax: 25, sizeMin: 16, maxLength: 20 }),
    field("duration", "Durasi", "Durasi", at(580, 1130, 185, 48), at(130, 1600, 400, 60), { value: posterDuration(event.starts_at, event.ends_at), sizeMax: 25, sizeMin: 16, maxLength: 30 }),
    field("venue", "Tempat", "Tempat, kota", at(580, 1222, 185, 84), at(610, 1600, 398, 72), { value: event.venue_name, sizeMax: 25, sizeMin: 15, maxLines: 2, maxLength: 80 }),
    field("price", "Biaya & kuota", "Berbayar · Kuota maks. 15 peserta", at(864, 930, 160, 72), at(140, 1722, 345, 66), { color: CREAM, sizeMax: 21, sizeMin: 14, maxLines: 2, maxLength: 60 }),
    field("reservation", "Reservasi & informasi", "Reservasi & informasi", at(862, 1078, 168, 96), at(590, 1712, 418, 48), { editable: false, value: "Reservasi & informasi", weight: 400, color: BODY, sizeMax: 20, sizeMin: 12, maxLines: 3, maxLength: 120 }),
    field("socials", "Instagram & website", "@instagram | website", at(862, 1222, 168, 48), at(590, 1764, 418, 40), { editable: false, sizeMax: 21, sizeMin: 12, maxLength: 60 }),
  ],
};

export const posterPresets: PosterPreset[] = [rempah];
export const presetOf = (key: string) => posterPresets.find(preset => preset.key === key);

/** A preset's poster for an event: its boxes, with the date, time and venue taken from the event. */
export function presetPoster(key: string, event: EventRecord, enabled = true): PosterSettings {
  const preset = presetOf(key) ?? posterPresets[0];
  return { ...emptyPoster(), enabled, preset: preset.key, fields: preset.fields(event) };
}
