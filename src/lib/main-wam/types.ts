/*
 * Main WAM's shared types (docs/main-wam/KONTRAK.md §4). One file, owned by the fondasi: every area
 * (A peserta, B momen, C panitia/BOD, D modul, E admin) reads these and adds its own types in its
 * own folder (src/lib/main-wam/<area>/). A field added here is a change to the contract.
 *
 * Names follow the tables (supabase/migrations/202611200001–0003): mw_sessions → MwSession, and so
 * on, in camelCase. Times are ISO instants (timestamptz); dates are "YYYY-MM-DD" in WIB.
 */
import type { PraWamRole } from "@/lib/pra-wam/roles";

/* ── Settings ─────────────────────────────────────────────────────────────────────────────────── */

/** Mode acara (Admin WAM → Main WAM → Pengaturan): who sees Main WAM, and where /wam goes. */
export const MAIN_WAM_MODES = ["pra", "uji", "semua"] as const;
export type MainWamMode = (typeof MAIN_WAM_MODES)[number];
export const mainWamModeLabels: Record<MainWamMode, string> = { pra: "Pra WAM", uji: "Main WAM (uji)", semua: "Main WAM (semua)" };

/** The modules an admin switches on; a module that is off leaves no trace in the app. */
/** kuis: Kuis live (docs/rancangan-kuis-wam.md), off by default like every module. */
export const MAIN_WAM_MODULES = ["absen", "voting", "silent", "survei", "mozaik", "karbon", "kuis", "ceklis", "misi"] as const;
export type MainWamModule = (typeof MAIN_WAM_MODULES)[number];
export type ModuleSwitches = Record<MainWamModule, boolean>;

/** Per-module settings that are not data rows. Every field optional; the reader fills defaults. */
export type ModuleConfig = {
  /** Survei: the questionnaire (Kuesioner WAM) it links to, by its address; null = not chosen yet. */
  survei: { formSlug: string | null };
  /** Mozaik: the grid (DESIGN: 40 × 15 = 600 tiles) and how often it is rebuilt. */
  mozaik: { columns: number; rows: number };
  /** Mode demo: every screen with sample data, for trying the app before the event (docs/main-wam/KONTRAK.md §12). Off by default. */
  demo: boolean;
};

/** Theme colour slots (the UI kit's DEFAULT_THEME keys, src/components/main-wam/theme/tokens.ts). */
export const THEME_COLOR_KEYS = [
  "primary", "primaryStrong", "onPrimary", "primaryContainer", "onPrimaryContainer",
  "accent", "onAccent", "onAccent2", "accentContainer", "onAccentContainer",
] as const;
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];
/** KV image slots: splash/login, Beranda's header pattern, a pattern for empty areas, the Mozaik letters, the app icon. */
export const THEME_IMAGE_SLOTS = ["splash", "homeHeader", "pattern", "mosaic", "icon"] as const;
export type ThemeImageSlot = (typeof THEME_IMAGE_SLOTS)[number];
export const themeImageLabels: Record<ThemeImageSlot, string> = {
  splash: "Splash dan Masuk", homeHeader: "Pola kepala Beranda", pattern: "Pola latar", mosaic: "Huruf Mozaik", icon: "Ikon aplikasi",
};
/** One stored image: its private storage key and a version that changes with it (cache busting). */
export type ThemeImageRef = { key: string; version: string; mime: string };
/** What mw_settings.theme holds. */
export type MainWamThemeSettings = {
  colors: Partial<Record<ThemeColorKey, string>>;
  /** A face the app loads (DISPLAY_FONTS of the UI kit); null = the default. */
  displayFont: string | null;
  images: Partial<Record<ThemeImageSlot, ThemeImageRef>>;
};
/**
 * What the layout hands to the UI kit's <MainWamTheme> (its MainWamThemeInput): colours flat,
 * images as addresses on this site.
 */
export type MainWamThemeInput = Partial<Record<ThemeColorKey, string | null>> & {
  displayFont?: string | null;
  images?: Partial<Record<ThemeImageSlot, string | null>> | null;
};

/** The event's facts, shown across the handbook. */
export type MainWamEventInfo = {
  /** "WAM 2026" (the 2026 annual meeting, held in Jan 2027). */
  name: string;
  /** First and last day, WIB ("2027-01-04", "2027-01-07"); from pw_events (kind wam) when it exists. */
  startDate: string;
  endDate: string;
  /** "Kota Batu". */
  venue: string;
  /** "Hotel (contoh), Kota Batu". */
  hotel: string;
  /** The hotel's street address (Admin WAM → Info acara); "" when not filled in. */
  address: string;
  checkInAt: string | null;
  checkOutAt: string | null;
};

/** Who to call for what (employee ids): Bantuan kamar, perjalanan, and the panitia desk. */
export type MainWamContacts = { kamar: string | null; perjalanan: string | null; umum: string | null };

/** Jejak karbon, the hotel's bills after the event (filled in Admin WAM; null = not yet). */
export type CarbonInputs = { listrikKwh: number | null; airM3: number | null; lpgKg: number | null; sampahKg: number | null; final: boolean };

export type MainWamSettings = {
  mode: MainWamMode;
  modules: ModuleSwitches;
  moduleConfig: ModuleConfig;
  theme: MainWamThemeSettings;
  event: MainWamEventInfo;
  contacts: MainWamContacts;
  /** Kelompok are shown to participants (L01); before, "Kelompok belum diterbitkan". */
  groupsPublished: boolean;
  carbon: CarbonInputs;
  /**
   * Mode demo only (readMainWamSettings, never in what Admin saves): the rundown is empty, so the sample
   * rundown is shown and the event's dates follow it (src/lib/main-wam/demo.ts). False everywhere else.
   */
  sampleRundown: boolean;
  updatedAt: string | null;
  /** False before migration 202611200001: everything above is the default, nothing can be saved. */
  migrated: boolean;
};

/* ── Who is looking ───────────────────────────────────────────────────────────────────────────── */

/** The roles Main WAM tells apart. Peserta is everyone; HOD is not a role here. */
export type MainWamRole = "peserta" | "panitia" | "bod" | "admin";

export type ViewerGroup = { id: string; number: number; name: string; coordinator: boolean; size: number };
export type RoomPerson = { id: string; name: string; department: string; me: boolean };
/** The person's room from HR's published pairing (Kuesioner → Kamar), everyone in it. */
export type ViewerRoom = { id: string; name: string; kind: string; floor: string; note: string; people: RoomPerson[] };

/** The roles the "Lihat sebagai" switch offers in Mode demo. */
export const DEMO_ROLES = ["peserta", "panitia", "bod"] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];
/** Mode demo's part of a viewer: whether the switch shows, the role drawn, and the account's real roles (what the server really allows). */
export type ViewerDemo = { canSwitch: boolean; role: DemoRole; simulated: boolean; realRoles: PraWamRole[] };

/** The signed-in person as Main WAM sees them (mainWamViewer, src/lib/server/main-wam/viewer.ts). */
export type MainWamViewer = {
  id: string;
  /** Nama panggilan (callName): what colleagues see and the greeting uses. */
  name: string;
  /** For Profil and admin views only. */
  fullName: string;
  department: string;
  photo: string | null;
  /** What Main WAM draws for: in Mode demo a penguji's chosen role stands in for the account's own (see `demo`). */
  roles: PraWamRole[];
  /** Set only while Mode demo is on (src/lib/main-wam/demo.ts); absent otherwise, so nothing else changes. */
  demo?: ViewerDemo;
  /** On the penguji list, or panitia/admin (who always test). */
  tester: boolean;
  group: ViewerGroup | null;
  /**
   * The room, filled only on the screens that show it (Saya and below: requireMainWamPage reads it
   * there); null everywhere else, APIs included (audit S5). Elsewhere: viewerRoom(id), viewer.ts.
   */
  room: ViewerRoom | null;
};

/** A colleague as shown anywhere in Main WAM: nama panggilan and department, never more. */
export type MwPerson = { id: string; name: string; department: string; photo?: string | null };

/* ── Rundown ──────────────────────────────────────────────────────────────────────────────────── */

/** sesi: the agenda; makan: meals (no check-in, not picked for the Sekarang card over a real session); perjalanan: kumpul, kereta, shuttle. */
export const SESSION_KINDS = ["sesi", "makan", "perjalanan"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];
/** draf: admin only; terbit: in the app; batal: kept, shown struck through. */
export const SESSION_STATUSES = ["draf", "terbit", "batal"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
/** The module a session hosts (its action in P04 and the module's own timing). */
export const SESSION_MODULES = ["silent", "voting", "survei"] as const;
export type SessionModule = (typeof SESSION_MODULES)[number];
/** "Urutan tampil": "08.00 Sales & Marketing". */
export type LineupItem = { time: string; label: string };

export type MwSession = {
  id: string;
  title: string;
  kind: SessionKind;
  status: SessionStatus;
  startsAt: string;
  /** Null for a moment without an end ("14.30 Shuttle ke hotel"); sessionEnd() gives it 30 minutes. */
  endsAt: string | null;
  /** "Aula Utama · lantai 1". */
  place: string;
  /** The guide (Denah) the place's "Denah" button opens. */
  mapGuideId: string | null;
  dresscode: string;
  /** "Yang perlu dibawa": short text, no checkboxes. */
  bring: string;
  lineup: LineupItem[];
  /** Konsumsi: "10.00 Rehat · tenongan, kopi, teh". */
  meal: string;
  /** Kontak panitia of the session. */
  contactId: string | null;
  /** "Pakai absen" (module Absen QR). */
  usesAttendance: boolean;
  /** Wajib: K01 counts who has not checked in. */
  required: boolean;
  /** "Opsional" (Batu Night Spectacular). */
  optional: boolean;
  module: SessionModule | null;
  description: string;
  sort: number;
  /** "diubah Dimas · 08.05": the last change in Rundown live. */
  changedAt: string | null;
  changedBy: string | null;
};

/** One entry of Riwayat perubahan (mw_rundown_log). */
export type RundownField = "startsAt" | "endsAt" | "place" | "status";
export type RundownChange = {
  id: string;
  sessionId: string;
  changes: { field: RundownField; from: string | null; to: string | null }[];
  /** "Kabari peserta" was on: a notification went out. */
  notified: boolean;
  recipients: number;
  changedBy: string | null;
  changedAt: string;
};

export const ATTENDANCE_METHODS = ["qr", "manual"] as const;
export type MwAttendanceMethod = (typeof ATTENDANCE_METHODS)[number];
export type MwAttendance = { sessionId: string; employeeId: string; checkedInAt: string; method: MwAttendanceMethod; recordedBy: string | null };

/* ── Kelompok ─────────────────────────────────────────────────────────────────────────────────── */

export type MwGroupMember = { employeeId: string; coordinator: boolean };
/** "Kelompok 4 · Arjuno". */
export type MwGroup = { id: string; number: number; name: string; sort: number; members: MwGroupMember[] };
/** Kelompok kegiatan: a post, a minibus, a table, per session. */
export const ACTIVITY_GROUP_KINDS = ["pos", "angkot", "meja", "lain"] as const;
export type ActivityGroupKind = (typeof ACTIVITY_GROUP_KINDS)[number];
export type MwActivityGroup = { id: string; sessionId: string; kind: ActivityGroupKind; label: string; note: string; sort: number; members: string[] };

/* ── Perjalanan ───────────────────────────────────────────────────────────────────────────────── */

export const TRIP_DIRECTIONS = ["berangkat", "pulang"] as const;
export type TripDirection = (typeof TRIP_DIRECTIONS)[number];
export const TRIP_KINDS = ["kumpul", "kereta", "bus", "tiba", "lain"] as const;
export type TripKind = (typeof TRIP_KINDS)[number];
/** One step of the way (L03), with the person's own seat when they have one. */
export type MwTrip = {
  id: string;
  direction: TripDirection;
  kind: TripKind;
  title: string;
  place: string;
  startsAt: string | null;
  endsAt: string | null;
  /** "KA (contoh) · Ekonomi". */
  detail: string;
  /** "Tunjukkan KTP saat naik kereta." */
  note: string;
  mapUrl: string;
  coordinatorId: string | null;
  /** The rundown session of this step (kumpul with absen). */
  sessionId: string | null;
  /** For Jejak karbon: km of the leg, and how many buses. */
  distanceKm: number | null;
  vehicles: number | null;
  sort: number;
};
/** "Gerbong 3 · Kursi 12A", "Bus 2". */
export type MwTripSeat = { tripId: string; employeeId: string; seat: string; vehicle: string };

/* ── Panduan ──────────────────────────────────────────────────────────────────────────────────── */

export const GUIDE_KINDS = ["denah", "hotel", "dresscode", "tata_tertib", "lain"] as const;
export type GuideKind = (typeof GUIDE_KINDS)[number];
export type MwGuide = {
  id: string;
  slug: string;
  kind: GuideKind;
  title: string;
  /** Plain text with line breaks (no HTML). */
  body: string;
  /** An image or PDF in private storage; opened through mainWamApi.guideFile. */
  file: { mime: string; size: number; version: string } | null;
  sort: number;
  published: boolean;
};

/* ── Notifikasi and pengumuman ────────────────────────────────────────────────────────────────── */

/** What a Main WAM note is about (mw_notes.kind): its icon in N01 and its push topic. */
export const NOTE_KINDS = ["pengumuman", "jadwal", "absen", "momen", "kamar", "silent", "voting", "survei", "lain", "kuis"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];
/** How a note reads on Beranda's banner and in N01: plain news, or a change to act on (noteTone, notify.ts). */
export const NOTE_TONES = ["info", "warning"] as const;
export type NoteTone = (typeof NOTE_TONES)[number];
/** Who a panitia's announcement is for (K06). */
export type AnnouncementAudience =
  | { type: "semua" }
  | { type: "departemen"; departments: string[] }
  | { type: "panitia" };
export type MwNotification = {
  id: string;
  kind: NoteKind;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  /** The app path tapping it opens; null = open in place. */
  link: string | null;
  /** Pinned on Beranda until (pengumuman penting); null = not pinned. */
  pinnedUntil: string | null;
  /** A Pra WAM note (no Main WAM metadata): shown plainly. */
  fromPraWam: boolean;
  /** Info or warning (a schedule change, or a panitia's announcement marked so); filled by the readers in notes.ts. */
  tone?: NoteTone;
};
/** A pengumuman penting still pinned (pinnedForMe): always with its tone, for Beranda's banner. */
export type PinnedNote = MwNotification & { pinnedUntil: string; tone: NoteTone };

/* ── Momen ────────────────────────────────────────────────────────────────────────────────────── */

/** "Untuk: Semua" (also the Mozaik) or "Untuk: Kelompokku". */
export const PHOTO_AUDIENCES = ["semua", "kelompok"] as const;
export type PhotoAudience = (typeof PHOTO_AUDIENCES)[number];
/** tampil; ditinjau: hidden for now after reports, panitia decides; disembunyikan: hidden by panitia. */
export const PHOTO_STATUSES = ["tampil", "ditinjau", "disembunyikan"] as const;
export type PhotoStatus = (typeof PHOTO_STATUSES)[number];
export const REPORT_REASONS = ["tidak_setuju", "tidak_pantas", "data_pribadi", "lainnya"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const reportReasonLabels: Record<ReportReason, string> = {
  tidak_setuju: "Saya ada di foto ini dan tidak setuju",
  tidak_pantas: "Tidak pantas atau menyinggung",
  data_pribadi: "Memperlihatkan data pribadi atau rahasia",
  lainnya: "Lainnya",
};
export type MwPhoto = {
  id: string;
  ownerId: string;
  audience: PhotoAudience;
  /** The owner's kelompok when it was sent "Untuk: Kelompokku". */
  groupId: string | null;
  /** The session tag; null = Umum. */
  sessionId: string | null;
  width: number;
  height: number;
  /** When it was taken on the phone (a queued photo keeps its own time). */
  takenAt: string;
  createdAt: string;
  /** Shown to others from here (5 s after sending: the Batalkan window). */
  visibleAt: string;
  status: PhotoStatus;
};

/* ── Modul ────────────────────────────────────────────────────────────────────────────────────── */

export const AWARD_METHODS = ["voting", "juri", "otomatis"] as const;
export type AwardMethod = (typeof AWARD_METHODS)[number];
export const NOMINEE_KINDS = ["orang", "foto", "tim", "departemen"] as const;
export type NomineeKind = (typeof NOMINEE_KINDS)[number];
export type MwAwardNominee = { id: string; categoryId: string; employeeId: string | null; photoId: string | null; label: string; reason: string; sort: number };
export type MwAwardCategory = {
  id: string;
  title: string;
  /** "Pilih satu rekan yang paling banyak membantu orang lain tahun ini." */
  description: string;
  method: AwardMethod;
  nomineeKind: NomineeKind;
  opensAt: string | null;
  closesAt: string | null;
  announceAt: string | null;
  sessionId: string | null;
  sort: number;
  published: boolean;
  nominees: MwAwardNominee[];
};
export type MwAwardApproval = { categoryId: string; nomineeId: string; approvedBy: string; approvedAt: string };

/**
 * A Silent Meeting question: open from its session's start to its end. Panitia may open it before
 * the start and close it before the end, each once; closed is final (never opens again).
 */
export type MwSilentQuestion = {
  id: string;
  sessionId: string;
  question: string;
  topics: string[];
  /** "Buka sekarang" before the start (set once). */
  openedAt: string | null;
  /** Closed for good: "Tutup sekarang", or stamped once its hours passed. */
  closedAt: string | null;
};
