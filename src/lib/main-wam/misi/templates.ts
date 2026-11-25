import type { MissionRule } from "./rules";

/*
 * Templat misi: twelve photo missions an admin can start from (Admin WAM → Misi → "Pakai templat"), and
 * the same list is what Mode demo and the dev-preview show. Every mission is confirmed by a photo
 * (docs/main-wam/KONTRAK.md §13): the rules say what the photo must show, who is tagged, where and when.
 * Places are examples ("Contoh"): an admin sets the real points, radius and hours. Points go from 300
 * to 1.500, the most for the hardest (both BOD in one photo). Pure.
 */

export type MissionTemplate = { key: string; title: string; description: string; points: number; rules: MissionRule[] };

const live: MissionRule = { type: "foto_langsung" };
const face = (text = "Wajah semua orang di foto terlihat jelas dan tersenyum."): MissionRule => ({ type: "pose", label: "Wajah jelas", text });
const place = (name: string, latitude: number, longitude: number, radiusM: number): MissionRule => ({ type: "lokasi", name, latitude, longitude, radiusM });
const between = (start: string, end: string): MissionRule => ({ type: "waktu", start: `${start}+07:00`, end: `${end}+07:00` });
const tag = (count: number, relation: Extract<MissionRule, { type: "tag" }>["relation"], required = true): MissionRule => ({ type: "tag", count, relation, required });
const times = (n: number): MissionRule => ({ type: "batas_kali", times: n });

export const MISSION_TEMPLATES: MissionTemplate[] = [
  { key: "bod-berdua", title: "Foto bareng KEDUA BOD", description: "Satu foto berisi kamu dan kedua anggota BOD. Tandai keduanya.", points: 1500,
    rules: [live, tag(2, "bod"), face("Kamu dan kedua anggota BOD terlihat jelas dalam satu foto."), times(3)] },
  { key: "lintas-departemen", title: "Foto lintas departemen", description: "Berfoto dengan dua rekan dari departemen yang berbeda dari departemenmu dan satu sama lain.", points: 900,
    rules: [live, tag(2, "departemen_lain"), face(), times(3)] },
  { key: "plank-jatim-park", title: "Foto plank di Jatim Park", description: "Plank bersama, di Jatim Park. Boleh mengajak teman.", points: 800,
    rules: [live, place("Jatim Park, Batu (contoh)", -7.8856, 112.5296, 150), tag(3, "siapa_saja", false),
      { type: "pose", label: "Pose plank", text: "Orang di foto dalam posisi plank, seluruh badan terlihat." },
      between("2027-01-06T08:00:00", "2027-01-07T18:00:00"), times(2)] },
  { key: "gala-satu-meja", title: "Makan malam gala satu meja", description: "Satu meja gala, empat orang dalam satu foto.", points: 700,
    rules: [live, place("Ballroom hotel (contoh)", -7.8815, 112.5235, 120), tag(3, "siapa_saja"), { type: "pose", label: "Satu meja", text: "Empat orang duduk di satu meja makan malam, wajah terlihat." },
      between("2027-01-07T18:00:00", "2027-01-07T23:00:00"), times(1)] },
  { key: "sebangku-kereta", title: "Selfie dengan teman sebangku di kereta", description: "Selfie di kereta dengan teman sebangkumu. Tandai dia.", points: 600,
    rules: [live, tag(1, "sebangku"), face("Selfie di dalam kereta, wajah dua orang terlihat jelas."), between("2027-01-05T05:00:00", "2027-01-05T15:00:00"), times(3)] },
  { key: "kebun-apel", title: "Petik apel di kebun apel Batu", description: "Foto saat memetik atau memegang apel di kebun apel.", points: 500,
    rules: [live, place("Kebun apel Batu (contoh)", -7.8845, 112.5175, 200), { type: "pose", label: "Apel di tangan", text: "Terlihat memegang atau memetik apel dari pohon." }, times(3)] },
  { key: "sunrise", title: "Sunrise dari hotel", description: "Foto matahari terbit dari sekitar hotel.", points: 500,
    rules: [live, place("Lawn hotel (contoh)", -7.8815, 112.5235, 120), { type: "pose", label: "Matahari terbit", text: "Langit pagi dengan matahari terbit tampak di foto." },
      between("2027-01-07T04:30:00", "2027-01-07T07:00:00"), times(2)] },
  { key: "sekamar", title: "Selfie dengan teman sekamar", description: "Selfie bersama teman sekamarmu. Tandai dia.", points: 400,
    rules: [live, tag(1, "sekamar"), face("Selfie dua orang, wajah terlihat jelas."), times(3)] },
  { key: "kaos-tema", title: "Kaos tema WAM bersama tim", description: "Satu tim kompak mengenakan kaos tema WAM.", points: 400,
    rules: [live, tag(2, "siapa_saja"), { type: "pose", label: "Kaos tema WAM", text: "Semua orang di foto memakai kaos tema WAM." }, times(3)] },
  { key: "tugu-apel", title: "Foto di depan tugu apel Alun-alun Batu", description: "Dirimu atau timmu di depan tugu apel.", points: 400,
    rules: [live, place("Alun-alun Batu (contoh)", -7.8707, 112.5283, 60), { type: "pose", label: "Tugu apel", text: "Tugu apel terlihat di belakang." }, times(3)] },
  { key: "bareng-panitia", title: "Foto dengan panitia", description: "Berfoto dengan salah satu panitia WAM.", points: 300,
    rules: [live, tag(1, "siapa_saja"), { type: "pose", label: "Bersama panitia", text: "Terlihat bersama anggota panitia WAM yang memakai tanda panitia." }, times(3)] },
  { key: "kelompok-lengkap", title: "Foto kelompok lengkap di Lawn", description: "Satu foto dengan sebagian besar anggota kelompokmu.", points: 1000,
    rules: [live, place("Lawn hotel (contoh)", -7.8815, 112.5235, 120), tag(4, "siapa_saja"), face("Anggota kelompok terlihat jelas, minimal lima orang termasuk kamu."), between("2027-01-06T08:00:00", "2027-01-08T12:00:00"), times(2)] },
];

export const templateByKey = (key: string) => MISSION_TEMPLATES.find(template => template.key === key) ?? null;
