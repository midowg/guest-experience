import { defaultSettings } from "./settings";
import type {
  MainWamSettings, MainWamViewer, MwActivityGroup, MwAttendance, MwAwardCategory, MwGroup, MwGuide, MwNotification, MwPerson, MwPhoto, MwSession,
  MwSilentQuestion, MwTrip, MwTripSeat, RundownChange, SessionKind, ViewerRoom,
} from "./types";

/*
 * Main WAM's sample data for dev-preview pages and tests (docs/main-wam/KONTRAK.md §7), from the
 * prototype (SPEC_LAYAR §0.4, revisi 16 Nov malam): WAM 2026, Sen–Kam 4–7 Jan 2027 in Kota Batu,
 * the four-day rundown, Kelompok 4 · Arjuno, Kamar 208 with three people and a room of five.
 * Every name is made up (the repo is public). Never used outside dev-preview and tests.
 */

/** A fixed, valid uuid per sample row, so pages that check ids accept them. */
const uid = (kind: number, n: number) => `00000000-0000-4000-8${String(kind).padStart(3, "0")}-${String(n).padStart(12, "0")}`;
const at = (date: string, time: string) => `${date}T${time}:00+07:00`;
const D1 = "2027-01-04", D2 = "2027-01-05", D3 = "2027-01-06", D4 = "2027-01-07";

/* ── People ───────────────────────────────────────────────────────────────────────────────────── */

const PEOPLE: [key: string, name: string, department: string][] = [
  ["rani", "Rani", "CoE"], ["sari", "Sari", "HRGA"], ["dewi", "Dewi", "Art & Creative Support"], ["fajar", "Fajar", "Sales & Marketing"],
  ["bima", "Bima", "Finance"], ["ayu", "Ayu", "CoE"], ["raka", "Raka", "CoE"], ["lina", "Lina", "CoE"], ["tari", "Tari", "Art & Creative Support"],
  ["wawan", "Wawan", "Sales & Marketing"], ["nina", "Nina", "Sales & Marketing"], ["dimas", "Dimas", "Corporate"], ["yoga", "Yoga", "CoE"],
  ["gilang", "Gilang", "CoE"], ["putri", "Putri", "HRGA"], ["hana", "Hana", "Finance"], ["maya", "Maya", "CoE"], ["hadi", "Hadi", "Sales & Marketing"],
  ["arman", "Arman", "BOD"], ["wulan", "Wulan", "BOD"],
];
export const samplePeople: Record<string, MwPerson & { fullName: string }> = Object.fromEntries(PEOPLE.map(([key, name, department], index) =>
  [key, { id: uid(1, index + 1), name, fullName: `${name} Contoh`, department, photo: null }]));
const person = (key: string) => samplePeople[key];
export const samplePeopleList = (): MwPerson[] => Object.values(samplePeople).map(({ id, name, department, photo }) => ({ id, name, department, photo }));

/* ── Kelompok and kamar ───────────────────────────────────────────────────────────────────────── */

const GROUP_NAMES = ["Bromo", "Kawi", "Welirang", "Arjuno", "Panderman", "Butak", "Semeru", "Wilis", "Lawu", "Raung", "Penanggungan", "Ijen"];
const ARJUNO = ["fajar", "rani", "sari", "bima", "ayu", "raka", "lina", "tari", "wawan", "nina"];
export const sampleGroups: MwGroup[] = GROUP_NAMES.map((name, index) => ({
  id: uid(2, index + 1), number: index + 1, name, sort: index,
  members: index === 3 ? ARJUNO.map((key, position) => ({ employeeId: person(key).id, coordinator: position === 0 }))
    : index === 1 ? [{ employeeId: person("dimas").id, coordinator: true }]
      : index === 2 ? [{ employeeId: person("dewi").id, coordinator: false }]
        : index === 5 ? [{ employeeId: person("yoga").id, coordinator: false }] : [],
}));
export const sampleGroup4 = sampleGroups[3];

/** Kamar 208 · Lantai 2 · 3 orang (Rani, Sari, Dewi), as Rani sees it. */
export const sampleRoom3: ViewerRoom = {
  id: uid(3, 208), name: "208", kind: "Triple", floor: "Lantai 2", note: "",
  people: [{ id: person("rani").id, name: "Rani", department: "CoE", me: true }, { id: person("sari").id, name: "Sari", department: "HRGA", me: false }, { id: person("dewi").id, name: "Dewi", department: "Art & Creative Support", me: false }],
};
/** A room of five (L01__status): Yoga's. */
export const sampleRoom5: ViewerRoom = {
  id: uid(3, 315), name: "315", kind: "Family", floor: "Lantai 3", note: "Kamar keluarga, dua ranjang tambahan.",
  people: ["yoga", "gilang", "raka", "wawan", "bima"].map((key, index) => ({ id: person(key).id, name: person(key).name, department: person(key).department, me: index === 0 })),
};
/** BOD alone (B01). */
export const sampleRoomBod: ViewerRoom = { id: uid(3, 101), name: "101", kind: "Suite", floor: "Lantai 1", note: "", people: [{ id: person("arman").id, name: "Arman", department: "BOD", me: true }] };

/* ── Who is looking ───────────────────────────────────────────────────────────────────────────── */

const viewer = (key: string, roles: MainWamViewer["roles"], room: ViewerRoom | null, group: MainWamViewer["group"]): MainWamViewer => ({
  id: person(key).id, name: person(key).name, fullName: person(key).fullName, department: person(key).department, photo: null, roles, tester: roles.some(role => role === "panitia" || role === "admin"), group, room,
});
export const sampleViewers = {
  peserta: viewer("rani", [], sampleRoom3, { id: sampleGroup4.id, number: 4, name: "Arjuno", coordinator: false, size: 10 }),
  panitia: viewer("dimas", ["panitia"], null, { id: sampleGroups[1].id, number: 2, name: "Kawi", coordinator: true, size: 10 }),
  bod: viewer("arman", ["bod"], sampleRoomBod, null),
  admin: viewer("hadi", ["admin"], null, null),
};
export type SampleRole = keyof typeof sampleViewers;
/** ?peran=peserta|panitia|bod|admin in a dev-preview page. */
export const sampleViewer = (role?: string | null): MainWamViewer => sampleViewers[(role && role in sampleViewers ? role : "peserta") as SampleRole];

/* ── Rundown ──────────────────────────────────────────────────────────────────────────────────── */

type SessionSeed = [key: string, date: string, start: string, end: string | null, title: string, place: string, extra?: Partial<MwSession> & { kind?: SessionKind }];
const SESSIONS: SessionSeed[] = [
  ["kumpul", D1, "05:30", "06:15", "Kumpul di Stasiun Tugu", "Stasiun Tugu · pintu selatan", { kind: "perjalanan", usesAttendance: true, required: true, bring: "KTP, kaos WAM, obat pribadi" }],
  ["kereta-pergi", D1, "06:30", "14:00", "Kereta Yogyakarta → Malang", "Stasiun Tugu", { kind: "perjalanan" }],
  ["shuttle", D1, "14:30", null, "Shuttle ke hotel", "Stasiun Malang", { kind: "perjalanan" }],
  ["checkin", D1, "15:30", "16:30", "Check-in & penyambutan", "Lobby hotel", { meal: "Live sate", description: "Penyambutan Reog Ponorogo." }],
  ["pembukaan", D1, "17:00", "18:00", "Pembukaan: Shaping Tomorrow", "Aula Utama", { usesAttendance: true, dresscode: "Kaos WAM" }],
  ["makan-malam-1", D1, "18:30", "19:30", "Makan malam", "Resto lantai 1", { kind: "makan" }],
  ["sharing-ai", D1, "19:30", "21:00", "Sharing session: AI dalam dunia kerja", "Aula Utama", { usesAttendance: true }],
  ["wellness", D2, "06:00", "06:45", "Wellness pagi", "Taman hotel", { dresscode: "Pakaian olahraga" }],
  ["sarapan-2", D2, "07:00", "08:00", "Sarapan", "Resto lantai 1", { kind: "makan" }],
  ["pemaparan", D2, "08:00", "12:00", "Pemaparan departemen", "Aula Utama · lantai 1", {
    usesAttendance: true, required: true, dresscode: "Kaos WAM", bring: "Kartu identitas karyawan, laptop dan charger", meal: "10.00 Rehat · tenongan, kopi, teh",
    lineup: [{ time: "08.00", label: "Sales & Marketing" }, { time: "08.40", label: "CoE" }, { time: "09.20", label: "HRGA" }, { time: "10.00", label: "Rehat · tenongan" }, { time: "10.20", label: "Finance" }, { time: "11.00", label: "Art & Creative Support" }, { time: "11.40", label: "Tanya jawab" }],
  }],
  ["makan-siang-2", D2, "12:00", "13:00", "Makan siang", "Resto lantai 1", { kind: "makan" }],
  ["silent", D2, "13:00", "14:30", "Silent Meeting", "Aula Utama", { module: "silent", usesAttendance: true }],
  ["team-building", D2, "15:00", "17:00", "Team building", "Lawn", { dresscode: "Kaos tim, sepatu olahraga", bring: "Kaos tim, sepatu olahraga" }],
  ["makan-malam-2", D2, "18:30", "19:30", "Makan malam", "Resto lantai 1", { kind: "makan" }],
  ["bns", D2, "19:30", "22:00", "Batu Night Spectacular", "Kumpul lobby 19.15", { optional: true }],
  ["trekking", D3, "06:00", "10:00", "Trekking Coban Rondo", "Coban Rondo (angkot)", { usesAttendance: true, bring: "Sepatu trekking, jas hujan" }],
  ["sharing-hospitality", D3, "10:30", "12:00", "Sharing session: Hospitality", "Aula Utama", { usesAttendance: true }],
  ["makan-siang-3", D3, "12:00", "13:00", "Makan siang", "Resto lantai 1", { kind: "makan" }],
  ["komitmen", D3, "13:00", "15:30", "Penetapan komitmen", "Aula Utama", { usesAttendance: true }],
  ["refleksi", D3, "16:00", "17:30", "Refleksi & arah bersama", "Aula Utama", { usesAttendance: true }],
  ["gala", D3, "19:00", "22:00", "Gala Dinner & Awarding", "Ballroom", { module: "voting", dresscode: "Batik formal" }],
  ["sarapan-4", D4, "07:00", "08:00", "Sarapan", "Resto lantai 1", { kind: "makan" }],
  ["penutupan", D4, "08:00", "09:30", "Survei evaluasi & penutupan", "Aula Utama", { module: "survei", usesAttendance: true }],
  ["checkout", D4, "10:00", null, "Check-out", "Lobby hotel"],
  ["pasar", D4, "10:30", "12:00", "Pasar Among Tani", "Pasar Among Tani"],
  ["shuttle-pulang", D4, "12:30", null, "Shuttle ke St. Malang", "Lobby hotel", { kind: "perjalanan" }],
  ["kereta-pulang", D4, "14:30", "22:00", "Kereta Malang → Yogyakarta", "Stasiun Malang", { kind: "perjalanan" }],
];
export const sampleSessionIds: Record<string, string> = Object.fromEntries(SESSIONS.map(([key], index) => [key, uid(4, index + 1)]));
export const sampleSessions: MwSession[] = SESSIONS.map(([key, date, start, end, title, place, extra = {}], index) => ({
  id: sampleSessionIds[key], title, kind: "sesi", status: "terbit", startsAt: at(date, start), endsAt: end ? at(date, end) : null, place, mapGuideId: null,
  dresscode: "", bring: "", lineup: [], meal: "", contactId: person("dimas").id, usesAttendance: false, required: false, optional: false, module: null,
  description: "", sort: index, changedAt: null, changedBy: null, ...extra,
}));
export const sampleSession = (key: string) => sampleSessions.find(session => session.id === sampleSessionIds[key])!;

/**
 * The schedule after panitia's change (Sel, 5 Jan · 10.20, SPEC §0.4): Pemaparan to 12.30, Makan
 * siang 12.30–13.30, Silent Meeting 13.30–15.00, marked "diubah Dimas · 10.20".
 */
export function sampleSessionsChanged(): MwSession[] {
  const moved: Record<string, [string, string]> = { pemaparan: ["08:00", "12:30"], "makan-siang-2": ["12:30", "13:30"], silent: ["13:30", "15:00"] };
  return sampleSessions.map(session => {
    const key = Object.keys(moved).find(name => sampleSessionIds[name] === session.id);
    if (!key) return session;
    return { ...session, startsAt: at(D2, moved[key][0]), endsAt: at(D2, moved[key][1]), changedAt: at(D2, "10:20"), changedBy: person("dimas").id };
  });
}
export const sampleRundownLog: RundownChange[] = [{
  id: uid(5, 1), sessionId: sampleSessionIds.pemaparan, changes: [{ field: "endsAt", from: at(D2, "12:00"), to: at(D2, "12:30") }], notified: true, recipients: 122, changedBy: person("dimas").id, changedAt: at(D2, "10:20"),
}];

/** Rani's check-ins by Sel, 5 Jan · 10.05. */
export const sampleAttendance: MwAttendance[] = [
  { sessionId: sampleSessionIds.kumpul, employeeId: person("rani").id, checkedInAt: at(D1, "05:24"), method: "qr", recordedBy: null },
  { sessionId: sampleSessionIds.pembukaan, employeeId: person("rani").id, checkedInAt: at(D1, "16:52"), method: "qr", recordedBy: null },
  { sessionId: sampleSessionIds.pemaparan, employeeId: person("rani").id, checkedInAt: at(D2, "07:52"), method: "qr", recordedBy: null },
  { sessionId: sampleSessionIds.pemaparan, employeeId: person("sari").id, checkedInAt: at(D2, "08:10"), method: "manual", recordedBy: person("dimas").id },
];

/* ── Kelompok kegiatan, perjalanan, panduan ───────────────────────────────────────────────────── */

export const sampleActivityGroups: MwActivityGroup[] = [
  { id: uid(6, 1), sessionId: sampleSessionIds["team-building"], kind: "pos", label: "Pos 2", note: "", sort: 2, members: ARJUNO.map(key => person(key).id) },
  { id: uid(6, 2), sessionId: sampleSessionIds.trekking, kind: "angkot", label: "Angkot 3", note: "Kumpul lobby 05.45", sort: 3, members: [person("rani").id, person("sari").id] },
  { id: uid(6, 3), sessionId: sampleSessionIds.gala, kind: "meja", label: "Meja 7", note: "", sort: 7, members: [person("rani").id, person("dewi").id] },
];

export const sampleTrips: MwTrip[] = [
  { id: uid(7, 1), direction: "berangkat", kind: "kumpul", title: "Kumpul", place: "Stasiun Tugu Yogyakarta · pintu selatan", startsAt: at(D1, "05:30"), endsAt: null, detail: "", note: "", mapUrl: "https://maps.google.com/?q=Stasiun+Tugu", coordinatorId: person("bima").id, sessionId: sampleSessionIds.kumpul, distanceKm: null, vehicles: null, sort: 1 },
  { id: uid(7, 2), direction: "berangkat", kind: "kereta", title: "Kereta", place: "Yogyakarta → Malang", startsAt: at(D1, "06:30"), endsAt: at(D1, "14:00"), detail: "KA (contoh) · Ekonomi", note: "Tunjukkan KTP saat naik kereta.", mapUrl: "", coordinatorId: person("bima").id, sessionId: sampleSessionIds["kereta-pergi"], distanceKm: 350, vehicles: null, sort: 2 },
  { id: uid(7, 3), direction: "berangkat", kind: "bus", title: "Shuttle", place: "St. Malang → hotel", startsAt: at(D1, "14:30"), endsAt: null, detail: "±45 menit", note: "", mapUrl: "", coordinatorId: person("bima").id, sessionId: sampleSessionIds.shuttle, distanceKm: 22, vehicles: 4, sort: 3 },
  { id: uid(7, 4), direction: "berangkat", kind: "tiba", title: "Tiba di hotel", place: "Hotel (contoh), Kota Batu", startsAt: at(D1, "15:30"), endsAt: null, detail: "Check-in 15.30", note: "", mapUrl: "", coordinatorId: null, sessionId: sampleSessionIds.checkin, distanceKm: null, vehicles: null, sort: 4 },
  { id: uid(7, 5), direction: "pulang", kind: "bus", title: "Shuttle", place: "Hotel → St. Malang", startsAt: at(D4, "12:30"), endsAt: null, detail: "", note: "", mapUrl: "", coordinatorId: person("bima").id, sessionId: sampleSessionIds["shuttle-pulang"], distanceKm: 22, vehicles: 4, sort: 1 },
  { id: uid(7, 6), direction: "pulang", kind: "kereta", title: "Kereta", place: "Malang → Yogyakarta", startsAt: at(D4, "14:30"), endsAt: at(D4, "22:00"), detail: "KA (contoh) · Ekonomi", note: "", mapUrl: "", coordinatorId: person("bima").id, sessionId: sampleSessionIds["kereta-pulang"], distanceKm: 350, vehicles: null, sort: 2 },
];
export const sampleSeats: MwTripSeat[] = [
  { tripId: uid(7, 2), employeeId: person("rani").id, seat: "Gerbong 3 · Kursi 12A", vehicle: "" },
  { tripId: uid(7, 3), employeeId: person("rani").id, seat: "", vehicle: "Bus 2" },
  { tripId: uid(7, 6), employeeId: person("rani").id, seat: "Gerbong 5 · Kursi 8C", vehicle: "" },
];

export const sampleGuides: MwGuide[] = [
  { id: uid(8, 1), slug: "denah-venue", kind: "denah", title: "Denah venue", body: "Aula Utama di lantai 1, lewat lobby timur.\nLawn di belakang resto.", file: { mime: "image/webp", size: 640_000, version: "1" }, sort: 1, published: true },
  { id: uid(8, 2), slug: "hotel", kind: "hotel", title: "Hotel & fasilitas", body: "Sarapan 06.30–09.30 di Resto lantai 1.\nKolam renang 07.00–20.00.\nWi-Fi: WAM2026 (kata sandi di kartu kamar).", file: null, sort: 2, published: true },
  { id: uid(8, 3), slug: "dress-code", kind: "dresscode", title: "Dress code per hari", body: "Sen: kaos WAM\nSel: kaos WAM, sore kaos tim\nRab: pakaian trekking, malam batik formal\nKam: bebas rapi", file: null, sort: 3, published: true },
  { id: uid(8, 4), slug: "tata-tertib", kind: "tata_tertib", title: "Tata tertib kegiatan", body: "Hadir 10 menit sebelum sesi.\nTrekking: ikuti koordinator angkot, jangan berpisah dari kelompok.", file: null, sort: 4, published: true },
];

/* ── Notifikasi ───────────────────────────────────────────────────────────────────────────────── */

export const sampleNotifications: MwNotification[] = [
  { id: uid(9, 1), kind: "pengumuman", title: "Team building mulai 15.00 di Lawn", body: "Pakai kaos tim dan sepatu olahraga. Kumpul per kelompok di pos masing-masing.", createdAt: at(D2, "10:30"), readAt: null, link: null, pinnedUntil: at(D2, "15:00"), fromPraWam: false },
  { id: uid(9, 2), kind: "jadwal", title: "Jadwal berubah", body: "Pemaparan selesai 12.30. Makan siang dan Silent Meeting mundur 30 menit.", createdAt: at(D2, "10:20"), readAt: null, link: null, pinnedUntil: null, fromPraWam: false },
  { id: uid(9, 3), kind: "momen", title: "Momen", body: "Dimas dan 4 lainnya menyukai fotomu.", createdAt: at(D2, "10:08"), readAt: null, link: null, pinnedUntil: null, fromPraWam: false },
  { id: uid(9, 4), kind: "absen", title: "Absen", body: "Absen tercatat: Pemaparan departemen.", createdAt: at(D2, "07:52"), readAt: at(D2, "08:00"), link: null, pinnedUntil: null, fromPraWam: false },
  { id: uid(9, 5), kind: "pengumuman", title: "Jalan ke Aula Utama lewat lobby timur", body: "Lift barat sedang dirawat.", createdAt: at(D2, "07:10"), readAt: at(D2, "07:20"), link: null, pinnedUntil: null, fromPraWam: false },
  { id: uid(9, 6), kind: "kamar", title: "Kamar", body: "Kamarmu siap: Kamar 208, lantai 2.", createdAt: at(D1, "15:10"), readAt: at(D1, "15:30"), link: null, pinnedUntil: null, fromPraWam: false },
];

/* ── Momen ────────────────────────────────────────────────────────────────────────────────────── */

/** A sample photo with a picture to show (placeholder photography, dev-preview only). */
export type SamplePhoto = MwPhoto & { src: string; owner: MwPerson; hearts: number; hearted: boolean };
const OWNERS = ["dimas", "fajar", "sari", "yoga", "dewi", "rani", "hana", "putri", "gilang", "bima", "ayu", "nina"];
export const samplePhotos: SamplePhoto[] = OWNERS.map((key, index) => {
  const minute = String(59 - index * 4).padStart(2, "0");
  const created = at(D2, `09:${minute}`);
  const kelompok = index % 4 === 1;
  return {
    id: uid(10, index + 1), ownerId: person(key).id, audience: kelompok ? "kelompok" : "semua", groupId: kelompok ? sampleGroup4.id : null,
    sessionId: index < 8 ? sampleSessionIds.pemaparan : null, width: 1600, height: 2000, takenAt: created, createdAt: created, visibleAt: created, status: "tampil",
    src: `https://picsum.photos/seed/main-wam-${index + 1}/800/1000`, owner: { id: person(key).id, name: person(key).name, department: person(key).department, photo: null },
    hearts: [24, 10, 7, 3, 12, 5, 0, 2, 9, 1, 4, 6][index], hearted: index === 1,
  };
});

/* ── Modul ────────────────────────────────────────────────────────────────────────────────────── */

const nominee = (category: number, n: number, key: string, reason: string) => ({ id: uid(11, category * 10 + n), categoryId: uid(12, category), employeeId: person(key).id, photoId: null, label: "", reason, sort: n });
export const sampleAwards: MwAwardCategory[] = [
  { id: uid(12, 1), title: "Rekan paling suportif", description: "Pilih satu rekan yang paling banyak membantu orang lain tahun ini.", method: "voting", nomineeKind: "orang",
    opensAt: at(D3, "08:00"), closesAt: at(D3, "15:00"), announceAt: at(D3, "19:00"), sessionId: sampleSessionIds.gala, sort: 1, published: true,
    nominees: [nominee(1, 1, "sari", "Selalu sigap membantu urusan kamar dan izin."), nominee(1, 2, "bima", "Sabar menjelaskan anggaran ke tim baru."), nominee(1, 3, "nina", "Membantu tim lain menyiapkan pitching."), nominee(1, 4, "yoga", "Membuat panduan alat kerja untuk semua."), nominee(1, 5, "dewi", "Mau lembur bantu desain tim lain.")] },
  { id: uid(12, 2), title: "Foto Momen terbaik", description: "Pilih satu foto Momen yang paling mewakili WAM 2026.", method: "voting", nomineeKind: "foto",
    opensAt: at(D3, "08:00"), closesAt: at(D3, "15:00"), announceAt: at(D3, "19:00"), sessionId: sampleSessionIds.gala, sort: 2, published: true,
    nominees: samplePhotos.slice(0, 3).map((photo, index) => ({ id: uid(11, 20 + index + 1), categoryId: uid(12, 2), employeeId: null, photoId: photo.id, label: "", reason: "", sort: index + 1 })) },
  { id: uid(12, 3), title: "Departemen paling berdampak", description: "Ditentukan juri BOD.", method: "juri", nomineeKind: "departemen",
    opensAt: null, closesAt: null, announceAt: at(D3, "19:00"), sessionId: sampleSessionIds.gala, sort: 3, published: true,
    nominees: ["CoE", "HRGA", "Finance"].map((label, index) => ({ id: uid(11, 30 + index + 1), categoryId: uid(12, 3), employeeId: null, photoId: null, label, reason: "", sort: index + 1 })) },
];

export const sampleSilentQuestion: MwSilentQuestion = {
  id: uid(13, 1), sessionId: sampleSessionIds.silent, question: "Apa yang perlu kita ubah supaya kerja tahun depan lebih ringan?",
  topics: ["Cara kerja", "Komunikasi", "Kesejahteraan", "Lainnya"], override: null, overrideAt: null, overrideBy: null, autoClose: true,
};
export const sampleSilentFeedback = [
  { topic: "Cara kerja", body: "Rapat mingguan terlalu panjang. Usul: maksimal 30 menit dan notulen dikirim hari itu juga." },
  { topic: "Komunikasi", body: "Info proyek sering datang mendadak lewat chat pribadi. Tolong satu kanal resmi." },
  { topic: "Kesejahteraan", body: "Beban lembur saat event besar perlu dibagi lebih rata." },
];

/* ── Settings and moments in time ─────────────────────────────────────────────────────────────── */

/** Main WAM on for everyone with every module, as the prototype shows it. */
export function sampleSettings(overrides: Partial<MainWamSettings> = {}): MainWamSettings {
  const base = defaultSettings();
  return {
    ...base, mode: "semua", migrated: true, groupsPublished: true,
    modules: { absen: true, voting: true, silent: true, survei: true, mozaik: true, karbon: true },
    moduleConfig: { ...base.moduleConfig, survei: { formSlug: "survei-wam" } },
    event: { ...base.event, hotel: "Hotel (contoh), Kota Batu", address: "Jl. Contoh No. 1, Kota Batu", checkInAt: at(D1, "15:30"), checkOutAt: at(D4, "10:00") },
    contacts: { kamar: person("putri").id, perjalanan: person("bima").id, umum: person("dimas").id },
    ...overrides,
  };
}

/** The prototype's sample moments (waktu contoh), for ?waktu= in dev-preview pages. */
export const sampleTimes = {
  /** P02 hari berangkat. */
  berangkat: new Date(at(D1, "05:05")),
  /** P01, P03, P04 before Pemaparan. */
  pagi: new Date(at(D2, "07:40")),
  /** P04 during Pemaparan, Momen. */
  pemaparan: new Date(at(D2, "10:05")),
  /** K01 panitia. */
  panitia: new Date(at(D2, "10:15")),
  /** T01 Silent Meeting open. */
  silent: new Date(at(D2, "13:45")),
  /** U01 camera at Team building. */
  teamBuilding: new Date(at(D2, "15:20")),
  /** B01 BOD. */
  bod: new Date(at(D3, "16:00")),
} as const;
export const sampleTime = (key?: string | null): Date => sampleTimes[(key && key in sampleTimes ? key : "pagi") as keyof typeof sampleTimes];
