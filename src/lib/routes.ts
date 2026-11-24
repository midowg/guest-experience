/**
 * Every address in the app is built here, so a change of URL shape is one edit. Guest pages use
 * the event's short code when it has one (`/AB23CD`, `/AB23CD/k7q2mx9p`); before migration
 * 202610210004 events have no code and the older `/e/{slug}` form is used. A guard test fails when
 * a path is written by hand elsewhere.
 */

type EventRef = { id: string; slug: string; code?: string | null; event_kind?: string };
type InvitationRef = { token: string; short_token?: string | null };
const enc = encodeURIComponent;

/* Guest pages */

/**
 * Friday Sharing (CSR) has no code in its addresses: /friday-sharing is the latest published one,
 * and /admin/friday-sharing its admin. It is a yearly event, so there is one at a time.
 */
export const FRIDAY_SHARING_PATH = "/friday-sharing";
const FRIDAY_SHARING_ADMIN = "/admin/friday-sharing";
/**
 * Panduan lokasi has a fixed English address in the same way: /your-visit is the latest published
 * one, /admin/your-visit its editor. One at a time, like Friday Sharing.
 */
export const PLACE_GUIDE_PATH = "/your-visit";
export const PLACE_GUIDE_ADMIN = "/admin/your-visit";
/**
 * Welcome (Kunjungan Kantor) names the guest in its address: /welcome/{slug}, e.g. /welcome/vortex,
 * and /welcome/{slug}/{short} for a personal link. Several visits run at once, so each has its own.
 */
export const WELCOME_PATH = "/welcome";

export function eventPath(event: EventRef): string {
  if (event.event_kind === "csr") return FRIDAY_SHARING_PATH;
  if (event.event_kind === "panduan") return PLACE_GUIDE_PATH;
  if (event.event_kind === "kunjungan") return `${WELCOME_PATH}/${enc(event.slug)}`;
  return event.code ? `/${event.code}` : `/e/${enc(event.slug)}`;
}

export function invitationPath(event: EventRef, invitation: InvitationRef): string {
  if (event.event_kind === "kunjungan" && event.code && invitation.short_token) return `${eventPath(event)}/${invitation.short_token}`;
  return event.code && invitation.short_token ? `/${event.code}/${invitation.short_token}` : `/e/${enc(event.slug)}/i/${invitation.token}`;
}

export const ticketPath = (event: EventRef, invitation: InvitationRef) => `${invitationPath(event, invitation)}/tiket`;
/** The thank-you page the host sends after the visit, whatever the date says; personal when sent to one guest. */
export const thanksPath = (event: EventRef, invitation?: InvitationRef) => `${invitation ? invitationPath(event, invitation) : eventPath(event)}/terima-kasih`;
export const galleryPath = (event: EventRef) => `${eventPath(event)}/galeri`;
export const photoDownloadPath = (event: EventRef, photoId: string) => `${galleryPath(event)}/${photoId}/unduh`;
/** Studio Poster, where a guest makes and downloads their own poster. */
export const posterPath = (event: EventRef) => `${eventPath(event)}/poster`;
export function calendarPath(event: EventRef, query: Record<string, string> = {}): string {
  const search = new URLSearchParams(query).toString();
  return `${eventPath(event)}/kalender.ics${search ? `?${search}` : ""}`;
}

/** The offline copy of guest pages (public/sw.js) and the part of the site it may cover. */
export const guestServiceWorker = { url: "/sw.js", scope: "/", legacyScope: "/e/" } as const;

/** The address a staff phone opens when it scans a guest's ticket QR. */
export const ticketScanPath = (code: string) => `/admin/checkin/${code}`;

/** `origin` + path, for links that leave the site: WhatsApp, QR, calendar, link previews. */
export const absolute = (origin: string, path: string) => `${origin.replace(/\/$/, "")}${path}`;

/* Admin pages */

/** The admin's own pages: the event list, the super admin's dashboard, signing in, and signing out (POST). */
export const ADMIN_HOME = "/admin";
export const SUPER_ADMIN_HOME = "/admin/super";
/** Super admin's places, each a page in its side menu (6 Nov 2026). */
export const superAdminPath = {
  team: "/admin/super/tim",
  templates: "/admin/super/templat",
  /** Older address of Visibilitas acara; it now lives on the templates page. */
  visibility: "/admin/super/visibilitas",
  modules: "/admin/super/modul",
  access: "/admin/akses",
  /** Akses admin (13 Nov 2026): who signs in to the admin with their own account, and what they open. */
  admins: "/admin/super/admin",
  /** Voucher re-roll (18 Nov 2026): every re-roll voucher from WLM's Hadiah, to cancel, refund, restore, or give. */
  vouchers: "/admin/super/voucher",
  /** Halaman utama (26 Nov 2026): which look the front page (journey.werkudara.group) shows. */
  home: "/admin/super/beranda",
};
/** The front page's look: GET, or PUT { style } (super admin). */
export const HOME_STYLE_API = "/api/admin/home-style";
/** Main WAM in Journey (20 Nov 2026): GET whether it shows, PUT { shown } (super admin only; hidden by default). */
export const MAIN_WAM_VISIBILITY_API = "/api/admin/wam2026-tampil";
/** Super admin's voucher re-roll: the list (GET), a voucher by hand (POST), or one voucher's correction (POST <id>). */
export const vouchersApi = (id?: string) => id ? `/api/admin/vouchers/${id}` : "/api/admin/vouchers";
/** The super admin's grants: the list, or one person's (PUT to save, DELETE to revoke). */
export const adminGrantsApi = (employeeId?: string) => employeeId ? `/api/admin/grants/${employeeId}` : "/api/admin/grants";
export const ADMIN_LOGIN = "/admin/login";
export const ADMIN_LOGOUT_API = "/api/auth/logout";

export type AdminTab = "edit" | "invitations" | "responses" | "checkin" | "beo" | "beo-print" | "gallery" | "feedback" | "preview" | "donations" | "donations-report" | "donations-split";
const adminTabPaths: Record<AdminTab, string> = {
  edit: "", invitations: "/undangan", responses: "/rsvp", checkin: "/checkin", beo: "/beo", "beo-print": "/beo/cetak",
  gallery: "/galeri", feedback: "/feedback", preview: "/preview", donations: "/donasi", "donations-report": "/donasi/laporan", "donations-split": "/donasi/pembagian",
};

/**
 * An event's admin page: /admin/acara/{code}/… with the short code, or the id where only the id
 * is at hand or the event has no code yet. Both resolve to the same event.
 */
export function adminEventPath(event: Pick<EventRef, "id" | "code" | "event_kind"> | string, tab: AdminTab = "edit", query: Record<string, string> = {}): string {
  const search = new URLSearchParams(query).toString();
  if (typeof event !== "string" && event.event_kind === "csr") return `${FRIDAY_SHARING_ADMIN}${adminTabPaths[tab]}${search ? `?${search}` : ""}`;
  if (typeof event !== "string" && event.event_kind === "panduan") return `${PLACE_GUIDE_ADMIN}${adminTabPaths[tab]}${search ? `?${search}` : ""}`;
  const ref = typeof event === "string" ? event : event.code || event.id;
  return `/admin/acara/${ref}${adminTabPaths[tab]}${search ? `?${search}` : ""}`;
}

/* APIs */

export const guestApi = {
  rsvp: (event: EventRef, invitation?: InvitationRef) => invitation
    ? `/api/events/${enc(event.slug)}/i/${enc(invitation.token)}/rsvp`
    : `/api/events/${enc(event.slug)}/rsvp`,
  feedback: (event: EventRef) => `/api/events/${enc(event.slug)}/feedback`,
  opened: (event: EventRef, token: string) => `/api/events/${enc(event.slug)}/i/${token}/opened`,
  /** CSR: a donation, sent as a form with an optional proof of transfer. */
  donation: (event: EventRef) => `/api/events/${enc(event.slug)}/donation`,
};

/** Admin API for one event; `part` is the sub-resource, e.g. "beo", "gallery/<id>/complete". */
export function adminApi(eventId: string, part = "", query: Record<string, string> = {}): string {
  const search = new URLSearchParams(query).toString();
  return `/api/admin/events/${eventId}${part ? `/${part}` : ""}${search ? `?${search}` : ""}`;
}
export const adminEventsApi = "/api/admin/events";
/** Studio Poster design library: the list, or one design by id. */
/** Data karyawan: the list and import (super admin), the sheet check, or one person by id. */
export const employeesApi = (part: "" | "parse" | string = "") => `/api/admin/employees${part ? `/${part}` : ""}`;
export const EMPLOYEES_ADMIN = "/admin/super/karyawan";
export const posterDesignsApi = (id?: string) => `/api/admin/poster-designs${id ? `/${id}` : ""}`;
/** Tim Werkudara: the list, or one member by id. */
export const staffApi = (id?: string, query: Record<string, string> = {}) => {
  const search = new URLSearchParams(query).toString();
  return `/api/admin/staff${id ? `/${id}` : ""}${search ? `?${search}` : ""}`;
};

/*
 * WAM: Werkudara's own app for the Annual Meeting and the weeks leading to it (the Pra WAM phase,
 * shown as a notice inside the app, not a separate app). It is not an invitation, so it has no
 * event code: a fixed English address, its own sign-in per person, and its own tables (pw_*). Any
 * admin (HR) sets it up under /admin/wam; only Data karyawan stays with the super admin. The code
 * keeps the "praWam" names it started with.
 */
export const PRA_WAM_PATH = "/wam";
const WAM_API = "/api/wam";
export const praWamPath = {
  home: PRA_WAM_PATH,
  /**
   * Pra WAM's Beranda while Main WAM is on (mode uji for a penguji, mode semua for everyone), when /wam
   * itself opens Main WAM (docs/main-wam/KONTRAK.md §2): Pra WAM stays reachable by its address.
   */
  homePra: `${PRA_WAM_PATH}?versi=pra`,
  /** "Apa itu WAM?": the text written in Admin WAM, opened from Beranda. */
  about: `${PRA_WAM_PATH}/about`,
  /** The same page opened from Pengaturan, so its back arrow returns there. */
  aboutFromSettings: `${PRA_WAM_PATH}/about?dari=pengaturan`,
  login: (next?: string) => `${PRA_WAM_PATH}/login${next ? `?next=${enc(next)}` : ""}`,
  /**
   * Book: who has which room, per day, on the floor plan (was /wam/appraisal). With a booking id
   * that booking's detail opens (an agenda item links there).
   */
  appraisal: (date?: string, booking?: string) => {
    const search = new URLSearchParams(Object.entries({ date, booking }).filter((entry): entry is [string, string] => !!entry[1])).toString();
    return `${PRA_WAM_PATH}/book${search ? `?${search}` : ""}`;
  },
  /** The person's sessions, by day. */
  agenda: `${PRA_WAM_PATH}/agenda`,
  session: (id: string) => `${PRA_WAM_PATH}/sessions/${id}`,
  /** A session opened from Kelola acara: its page with the panitia's tools (9 Nov 2026). */
  managedSession: (id: string) => `${PRA_WAM_PATH}/sessions/${id}?dari=kelola`,
  /** Kelola acara → Dokumen: uploading documents and materials (moved out of the participant app, 9 Nov 2026). */
  manageDocuments: `${PRA_WAM_PATH}/manage/documents`,
  documents: `${PRA_WAM_PATH}/documents`,
  /** Timeline: Pra WAM's forums and events from Kelola acara → Jadwal sesi, for everyone to read. */
  timeline: `${PRA_WAM_PATH}/timeline`,
  notifications: `${PRA_WAM_PATH}/notifications`,
  /** Panitia and BOD: Ringkasan operasional. */
  dashboard: `${PRA_WAM_PATH}/manage`,
  /** BOD: everyone taking part, by department; read only. */
  people: `${PRA_WAM_PATH}/manage/people`,
  /** BOD: one participant's profile (Penpot B2), read only. */
  person: (id: string) => `${PRA_WAM_PATH}/manage/people/${id}`,
  /** BOD and panitia: survey results (Penpot B4); empty until surveys exist. */
  surveyResults: `${PRA_WAM_PATH}/manage/surveys`,
  /** Panitia and admin: food, allergies, prayer, readiness and shirt sizes from the questionnaire. */
  needs: `${PRA_WAM_PATH}/manage/kebutuhan`,
  /** BOD: the panitia's Ringkasan operasional, read only. */
  panitiaView: `${PRA_WAM_PATH}/manage?lihat=panitia`,
  /** BOD (24 Nov 2026): every figure and chart, so Ringkasan keeps what matters only. */
  analytics: `${PRA_WAM_PATH}/analitik`,
  /** Panitia: write announcements and see who has read them. */
  announcements: `${PRA_WAM_PATH}/manage/announcements`,
  /** Panitia: schedule change requests to answer. */
  requests: `${PRA_WAM_PATH}/manage/requests`,
  /** Panitia (and BOD, reading): every session, drafts included; the form to make or change one. */
  sessions: `${PRA_WAM_PATH}/manage/sessions`,
  newSession: `${PRA_WAM_PATH}/manage/sessions/new`,
  editSession: (id: string) => `${PRA_WAM_PATH}/manage/sessions/${id}`,
  /** Panitia: a session's QR to print, and who is present. */
  sessionAttendance: (id: string) => `${PRA_WAM_PATH}/manage/sessions/${id}/attendance`,
  /** Mode tablet (23 Nov 2026): panitia's tablet recognises faces at the door. */
  sessionFaceTablet: (id: string) => `${PRA_WAM_PATH}/manage/sessions/${id}/tablet`,
  /** What a session's printed QR holds: scanning it signs the person in. */
  checkIn: (token: string) => `${PRA_WAM_PATH}/check-in/${enc(token)}`,
  /** The in-app scanner, for phones whose camera app does not open links. */
  scan: `${PRA_WAM_PATH}/check-in`,
  /** Profil: the person's details and photo; settings are a separate page. */
  account: `${PRA_WAM_PATH}/account`,
  /** Pengaturan, pushed from Profil: password (`#password` opens it), theme, about, sign out. */
  settings: `${PRA_WAM_PATH}/settings`,
  /** Right after the first sign-in: pick a new password, or skip for now. */
  newPassword: (next?: string) => `${PRA_WAM_PATH}/new-password${next ? `?next=${enc(next)}` : ""}`,
  /** Forgot password: ask for a link by email. */
  forgot: `${PRA_WAM_PATH}/forgot-password`,
  /** Where the emailed link lands to set a new password. Must be allowed in Supabase Auth redirect URLs. */
  resetPassword: `${PRA_WAM_PATH}/reset-password`,
  /**
   * Book with a sheet open, kept in the address so a reload reopens it: one booking (`booking`),
   * changing one (`edit`), or a new one (`new: "1"`, with the room and hours to start from).
   */
  bookSheet: (query: { date?: string; booking?: string; edit?: string; new?: "1"; room?: string; start?: string; end?: string } = {}) => {
    const search = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => !!entry[1])).toString();
    return `${PRA_WAM_PATH}/book${search ? `?${search}` : ""}`;
  },
  /** The booking form (was /wam/appraisal/book); with a booking id it edits that booking. */
  book: (query: { edit?: string; date?: string; room?: string; start?: string; end?: string } = {}) => {
    const search = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => !!entry[1])).toString();
    return `${PRA_WAM_PATH}/book/new${search ? `?${search}` : ""}`;
  },
  /** The personal questionnaire, at the address HR gives it (bawaannya /wam/kuesioner). */
  questionnaire: (slug: string) => `${PRA_WAM_PATH}/${enc(slug)}`,
  /** Rekan: the character cards of everyone who finished the questionnaire. */
  colleagues: `${PRA_WAM_PATH}/rekan`,
  /** Jejak karbon (24 Nov 2026): the calculator on a page of its own, from Beranda or Ringkasan BoD. */
  carbon: `${PRA_WAM_PATH}/jejak-karbon`,
  /** Meeting HOD: meetings between department heads, for HODs only; a view of Book (the old address redirects there). */
  hod: `${PRA_WAM_PATH}/hod`,
  /** One colleague's card and what they share with colleagues. */
  colleague: (employeeId: string) => `${PRA_WAM_PATH}/rekan/${enc(employeeId)}`,
};
export const praWamApi = {
  login: `${WAM_API}/login`,
  logout: `${WAM_API}/logout`,
  password: `${WAM_API}/password`,
  forgot: `${WAM_API}/forgot-password`,
  resetPassword: `${WAM_API}/reset-password`,
  sessions: (id?: string) => `${WAM_API}/sessions${id ? `/${id}` : ""}`,
  /** PUT: the participant's own part of Jejak karbon (24 Nov 2026). */
  carbon: `${WAM_API}/carbon`,
  sessionStatus: (id: string) => `${WAM_API}/sessions/${id}/status`,
  /** GET (panitia): Linimasa's week or day as PDF, Excel, or the WhatsApp text. */
  sessionsExport: (format: "pdf" | "xlsx" | "text", rentang: string, tanggal: string) => `${WAM_API}/sessions/export?${new URLSearchParams({ format, rentang, tanggal })}`,
  /** Data lengkap: every published meeting between two dates (either may be empty), with everyone in it (13 Nov 2026). */
  sessionsFullExport: (dari: string, sampai: string) => `${WAM_API}/sessions/export?${new URLSearchParams({ format: "lengkap", ...(dari ? { dari } : {}), ...(sampai ? { sampai } : {}) })}`,
  /** GET: everything Detail sesi shows, for the sheet over Agenda and Beranda. */
  sessionDetail: (id: string) => `${WAM_API}/sessions/${id}/detail`,
  /** GET: the session's QR as an A5 PDF to print; POST: a new QR (the printed one stops working). */
  sessionQr: (id: string) => `${WAM_API}/sessions/${id}/qr`,
  /** GET: who is present; POST: panitia marks someone present or not. */
  sessionAttendance: (id: string) => `${WAM_API}/sessions/${id}/attendance`,
  /** GET (panitia and BOD): one online check-in's Zoom screenshot, a redirect to storage. */
  attendanceProof: (sessionId: string, employeeId: string) => `${WAM_API}/sessions/${sessionId}/attendance/${employeeId}/proof`,
  /** POST {mode: "offline"} or {mode: "online", proof}: "Saya hadir", the participant signs in. */
  selfCheckIn: (sessionId: string) => `${WAM_API}/sessions/${sessionId}/check-in`,
  /** POST {mime, size}: an upload address for the Zoom screenshot of an online check-in. */
  selfCheckInProof: (sessionId: string) => `${WAM_API}/sessions/${sessionId}/check-in/proof`,
  /** POST: absen pakai wajah, step one; …/foto {token, mime, size} where the photo goes; …/kirim the face. */
  faceCheckIn: (sessionId: string) => `${WAM_API}/sessions/${sessionId}/check-in/wajah`,
  faceCheckInPhoto: (sessionId: string) => `${WAM_API}/sessions/${sessionId}/check-in/wajah/foto`,
  faceCheckInSubmit: (sessionId: string) => `${WAM_API}/sessions/${sessionId}/check-in/wajah/kirim`,
  faceTablet: (sessionId: string) => `${WAM_API}/sessions/${sessionId}/tablet`,
  faceTabletRecord: (sessionId: string) => `${WAM_API}/sessions/${sessionId}/tablet/catat`,
  /** POST (panitia): agree to a face check-in marked perlu cek. */
  attendanceFaceApprove: (sessionId: string, employeeId: string) => `${WAM_API}/sessions/${sessionId}/attendance/${employeeId}/wajah`,
  /** What holds each room on a day (bookings and sessions), for picking a session's room. */
  roomUses: (date: string) => `${WAM_API}/rooms?date=${date}`,
  /** What the booking form needs (the booking sheet over Timeline and Agenda): ?date= or ?edit=. */
  bookForm: (query: { date?: string; edit?: string; room?: string }) => `${WAM_API}/book-form?${new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => !!entry[1])).toString()}`,
  /** Documents: ask for an upload address, then register the uploaded file; one document by id. */
  documents: (id?: string) => `${WAM_API}/documents${id ? `/${id}` : ""}`,
  documentUpload: `${WAM_API}/documents/upload`,
  /** GET: the person's notifications; POST {id?}: mark one, or all, read. */
  notifications: `${WAM_API}/notifications`,
  /** Notifikasi di HP. GET: the key to subscribe with; POST {subscription, device}: this phone on; DELETE {endpoint}: off. */
  push: `${WAM_API}/push`,
  /** POST: a test notification to the person's own phones. */
  pushTest: `${WAM_API}/push/test`,
  /** GET: which topics reach the person's phones (resolved with the defaults); PUT {prefs}: change them. */
  pushPrefs: `${WAM_API}/push/prefs`,
  /** GET: sent announcements with read counts; POST: send one (panitia). */
  announcements: `${WAM_API}/announcements`,
  /** DELETE: panitia removes one announcement. */
  announcement: (id: string) => `${WAM_API}/announcements/${id}`,
  /** Meeting HOD: POST a new meeting; with an id, POST {accept, note} (an invited HOD answers) or DELETE (the asker cancels). */
  hodMeetings: (id?: string) => `${WAM_API}/hod${id ? `/${id}` : ""}`,
  /** POST: a participant asks to move a session. */
  requestChange: (sessionId: string) => `${WAM_API}/sessions/${sessionId}/reschedule`,
  /** One request: POST {approve, note} (panitia answers), DELETE (the asker withdraws). */
  request: (id: string) => `${WAM_API}/requests/${id}`,
  /** Appraisal bookings: the day's schedule, a new booking, or one booking by id. */
  bookings: (id?: string, query: Record<string, string> = {}) => {
    const search = new URLSearchParams(query).toString();
    return `${WAM_API}/appraisal${id ? `/${id}` : ""}${search ? `?${search}` : ""}`;
  },
  /** Profile photo: DELETE removes the person's own photo. */
  photo: `${WAM_API}/photo`,
  /** POST {mime, size}: an upload address for a new profile photo. */
  photoStart: `${WAM_API}/photo/start`,
  /** POST: the photo is uploaded; check it and keep it. */
  photoConfirm: `${WAM_API}/photo/confirm`,
  /** GET: one person's photo (a redirect to storage); `v` changes with the photo, so caches refresh. */
  photoOf: (employeeId: string, version?: string) => `${WAM_API}/photo/${employeeId}${version ? `?v=${enc(version)}` : ""}`,
  /** GET: my questionnaire answers and progress. */
  questionnaire: `${WAM_API}/questionnaire`,
  /** PUT {question, value}: save one named answer. */
  questionnaireAnswer: `${WAM_API}/questionnaire/answer`,
  /** POST {answers}: send the anonymous section, once. */
  questionnaireAnonymous: `${WAM_API}/questionnaire/anonymous`,
  /** GET: my character card, if drawn; POST: draw it once I have finished (never again after). */
  questionnaireCard: `${WAM_API}/questionnaire/card`,
  /** GET: one picture of the card catalog (a character by id, a look part by number); `v` changes with the picture. */
  cardArt: (kind: string, ref: string, version?: string) => `${WAM_API}/card-art/${enc(kind)}/${enc(ref)}${version ? `?v=${enc(version)}` : ""}`,
};
/** Admin WAM: the WAM settings in the regular admin, one page per section (src/components/admin/wam/sections.ts). */
export const WAM_ADMIN = "/admin/wam";
export const wamAdminPath = {
  /** Ringkasan: the key numbers and a way into every section. */
  home: WAM_ADMIN,
  accounts: `${WAM_ADMIN}/akun`,
  /** Akun dan peran, tab Peran: what each role does and which go together. */
  roles: `${WAM_ADMIN}/akun/peran`,
  /** "Lupa password" requests waiting for an answer. */
  resetRequests: `${WAM_ADMIN}/permintaan-reset`,
  rooms: `${WAM_ADMIN}/ruang`,
  events: `${WAM_ADMIN}/acara`,
  about: `${WAM_ADMIN}/apa-itu-wam`,
  /** Jejak karbon: the group trip, nights and meals, and who travels on their own (24 Nov 2026). */
  carbon: `${WAM_ADMIN}/jejak-karbon`,
  /** The app's theme for everyone: Dream Out Loud or Werkudara, each light and dark. */
  theme: `${WAM_ADMIN}/tema`,
  /** Akun uji (24 Nov 2026): accounts that try Misi Perjalanan and Jejak karbon before the event. */
  testAccounts: `${WAM_ADMIN}/akun-uji`,
  /** TV Announcement: the office TVs, their pictures, and how long each stays. */
  tv: `${WAM_ADMIN}/tv`,
  /** The board as a TV plays it, for the signed-in admin (no TV key). */
  tvPreview: `${WAM_ADMIN}/tv/pratinjau`,
  /** Telegram: the MoM bot, its webhook, and the group of each department (12 Nov 2026). */
  telegram: `${WAM_ADMIN}/telegram`,
  /** Arsip MoM: every sent MoM with its PDF and photos, in folders, with exports (12 Nov 2026). */
  momCabinet: `${WAM_ADMIN}/arsip-mom`,
  /** The personal questionnaire: content, settings, progress, and the HR-locked answers. */
  questionnaire: {
    content: `${WAM_ADMIN}/kuesioner`,
    settings: `${WAM_ADMIN}/kuesioner/pengaturan`,
    progress: `${WAM_ADMIN}/kuesioner/progres`,
    hrData: `${WAM_ADMIN}/kuesioner/data-hr`,
    /** One table: a row per person, a column per question, every answer (11 Nov 2026; was charts and quotes). */
    recap: `${WAM_ADMIN}/kuesioner/rekap`,
    /** Excel per section, by read level; HR answers only with Data HR open. */
    export: `${WAM_ADMIN}/kuesioner/ekspor`,
    /** Room pairing for the stay (Data HR open). */
    rooms: `${WAM_ADMIN}/kuesioner/kamar`,
    /** The character cards: catalog, rules, levels and odds, pictures, and the cards drawn. */
    cards: `${WAM_ADMIN}/kuesioner/kartu`,
  },
};
/** Admin WAM, the questionnaire's content and settings (any admin). */
const QUESTIONNAIRE_ADMIN_API = "/api/admin/wam/questionnaire";
export const praWamQuestionnaireApi = {
  /** PATCH: the form's name, address, status, texts and dates. */
  form: QUESTIONNAIRE_ADMIN_API,
  /** POST: a new section at the end. */
  sections: `${QUESTIONNAIRE_ADMIN_API}/sections`,
  /** PATCH one section; DELETE removes it, or hides it once it has answers. */
  section: (sectionId: string) => `${QUESTIONNAIRE_ADMIN_API}/sections/${sectionId}`,
  /** POST: a new question at the end of a section. */
  questions: `${QUESTIONNAIRE_ADMIN_API}/questions`,
  /** PATCH one question (a move between sections included); DELETE removes it, or hides it once it has answers. */
  question: (questionId: string) => `${QUESTIONNAIRE_ADMIN_API}/questions/${questionId}`,
  /** PUT {sections} or {sectionId, questions}: a new order. */
  order: `${QUESTIONNAIRE_ADMIN_API}/order`,
  /** GET: who started, who finished, by department. */
  progress: `${QUESTIONNAIRE_ADMIN_API}/progress`,
  /** POST: "Hapus sekarang", the stay and health data, from the date set in Pengaturan. */
  purge: `${QUESTIONNAIRE_ADMIN_API}/purge`,
  /** DELETE {who: "pilih", employeeIds} or {who: "semua", confirm}: Rekap's Hapus jawaban (12 Nov 2026). */
  answers: `${QUESTIONNAIRE_ADMIN_API}/answers`,
  /** POST {who}: "Ingatkan yang belum", a WAM notification to those not done. */
  remind: `${QUESTIONNAIRE_ADMIN_API}/remind`,
  /** GET: Rekap's table (one row per person, one column per question, HR included) as .xlsx; logged as `ekspor`. */
  table: `${QUESTIONNAIRE_ADMIN_API}/table`,
  /** GET ?bagian=<section key>: the answers as .xlsx; with HR answers only when Data HR is open, then logged as `ekspor`. */
  export: (section?: string) => `${QUESTIONNAIRE_ADMIN_API}/export${section ? `?bagian=${encodeURIComponent(section)}` : ""}`,
};
/** Admin WAM, room pairing for the WAM stay (admin + Data HR open). Not the meeting rooms (praWamRoomsApi). */
const STAY_ADMIN_API = `${QUESTIONNAIRE_ADMIN_API}/rooms`;
export const praWamStayApi = {
  /** POST {text}: rooms, one per line ("208, Twin bed, 2"). */
  rooms: STAY_ADMIN_API,
  /** PATCH {name?, kind?, capacity?, reviewed?}; DELETE (its people go back to waiting). */
  room: (roomId: string) => `${STAY_ADMIN_API}/${roomId}`,
  /** PUT {employeeId, roomId | null}. */
  place: `${STAY_ADMIN_API}/place`,
  /** POST: fill free beds with a suggestion. */
  suggest: `${STAY_ADMIN_API}/suggest`,
  /** POST: everyone back to waiting. */
  clear: `${STAY_ADMIN_API}/clear`,
  /** PUT {published}. */
  publish: `${STAY_ADMIN_API}/publish`,
};
/** Admin WAM, the character cards of the questionnaire (any admin). */
const CARDS_ADMIN_API = `${QUESTIONNAIRE_ADMIN_API}/cards`;
export const praWamCardsApi = {
  /** GET: the catalog and the cards drawn so far; POST: a new character. */
  catalog: CARDS_ADMIN_API,
  /** PATCH: one character's texts, rules and visibility; DELETE removes it, or hides it once someone has it. */
  character: (cardId: string) => `${CARDS_ADMIN_API}/${cardId}`,
  /** PUT {tiers}: names, colours, odds (adding up to 100 %) and caps of the levels. */
  tiers: `${CARDS_ADMIN_API}/tiers`,
  /** DELETE: the trial cards drawn while the form was a draft. */
  trials: `${CARDS_ADMIN_API}/trials`,
  /** POST {kind, ref, mime, size}: an upload address for one picture of the catalog. */
  /** DELETE: the characters' old anime pictures (13 Nov 2026). */
  characterArt: `${CARDS_ADMIN_API}/art`,
  artStart: `${CARDS_ADMIN_API}/art/start`,
  /** POST: the picture is uploaded; check it and keep it. */
  artConfirm: `${CARDS_ADMIN_API}/art/confirm`,
};
/**
 * Admin WAM, Data HR: opening it with the WAM email of a person on the HR access list (30 minutes
 * on this device) and locking it again, the locked data (who answered HR questions, one person's
 * answers, the access log), and the list itself (the super admin adds and removes people).
 */
const QUESTIONNAIRE_HR_API = `${QUESTIONNAIRE_ADMIN_API}/hr`;
export const praWamHrApi = {
  /** POST {employeeId}: super admin gives one person Data HR access. */
  access: `${QUESTIONNAIRE_HR_API}/access`,
  /** DELETE: super admin takes one person's Data HR access away. */
  accessPerson: (employeeId: string) => `${QUESTIONNAIRE_HR_API}/access/${employeeId}`,
  /** POST {email}: unlock Data HR on this device as that person. */
  unlock: `${QUESTIONNAIRE_HR_API}/unlock`,
  /** POST: lock Data HR on this device now. */
  lock: `${QUESTIONNAIRE_HR_API}/lock`,
  /** GET: people who answered any HR question (unlocked only). */
  people: `${QUESTIONNAIRE_HR_API}/person`,
  /** GET: one person's HR answers (unlocked only; logged). */
  person: (employeeId: string) => `${QUESTIONNAIRE_HR_API}/person/${employeeId}`,
  /** GET: the latest HR access log (unlocked only). */
  log: `${QUESTIONNAIRE_HR_API}/log`,
};
/** Admin WAM: the account list and creating accounts, or one person's roles, email and password reset. */
export const praWamAccountsApi = (employeeId?: string) => `/api/admin/wam/accounts${employeeId ? `/${employeeId}` : ""}`;
/** Admin WAM: GET the "Lupa password" requests; with an id, PATCH {action: "reset" | "tolak"} answers one. */
export const praWamResetRequestsApi = (requestId?: string) => `/api/admin/wam/reset-requests${requestId ? `/${requestId}` : ""}`;
/** Admin WAM: PATCH one room's capacity, fewest people, bookable and floor plan spot. */
export const praWamRoomsApi = (roomId: string) => `/api/admin/wam/rooms/${roomId}`;
/** Admin WAM: add a room (POST). */
export const praWamRoomsCreateApi = "/api/admin/wam/rooms";
/** Admin WAM: import units and positions from the Data karyawan workbook. */
export const praWamUnitsApi = "/api/admin/wam/units";
/** Admin WAM: one event's status and modules. */
export const praWamEventsApi = (eventId: string) => `/api/admin/wam/events/${eventId}`;
/** PUT {forum, rapat, acara, berdua}: which meetings need a MoM (Admin WAM → Acara, any admin). */
export const praWamMinutesRuleApi = "/api/admin/wam/minutes-rule";
/** Admin WAM: PUT saves the "Apa itu WAM?" text, DELETE goes back to the default text. */
export const praWamAboutApi = "/api/admin/wam/about";
/** Admin WAM → Jejak karbon: PUT the setup, POST {id} sends someone back to the group trip. */
export const praWamCarbonApi = "/api/admin/wam/jejak-karbon";
/** Admin WAM: PUT the app settings, e.g. whether Book shows the floor plan. */
export const praWamSettingsApi = "/api/admin/wam/settings";
/** Admin WAM → Tema aplikasi (any admin). */
export const praWamThemeApi = "/api/admin/wam/theme";
/** PUT: the Akun uji list and whether Jejak karbon shows only to them. */
export const praWamTestAccountsApi = "/api/admin/wam/akun-uji";

/*
 * Main WAM (17 Nov 2026, docs/main-wam/KONTRAK.md): the app during WAM itself (4–7 Jan 2027), inside
 * /wam with the same account and the same session, hidden until Admin WAM → Main WAM → Pengaturan
 * turns it on. Every page and API of every screen is listed here at once, so the agents building the
 * screens never edit this file: a new address is a change to the contract (KONTRAK §5).
 * Areas: A peserta, B momen, C panitia/BOD, D modul, E admin; fondasi for what is shared.
 */
/** Published address (21 Nov 2026): /wam2026. next.config.ts rewrites it to the folder src/app/wam/acara and sends the old /wam/acara here. */
export const MAIN_WAM_PATH = "/wam2026";
const MAIN_WAM_API = `${WAM_API}/acara`;
/** "?a=1&b=2" from the values that are set, or "". */
const mwQuery = (values: Record<string, string | number | undefined | null | false>) => {
  const search = new URLSearchParams(Object.entries(values).filter((entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== null && entry[1] !== false && entry[1] !== "").map(([key, value]) => [key, String(value)])).toString();
  return search ? `?${search}` : "";
};
export type MainWamMomentsFilter = { sesi?: string; foto?: string };
export type MainWamGalleryFilter = { lihat?: "semua" | "saya"; sesi?: string };
export const mainWamPath = {
  /* A · peserta */
  /** Beranda (P01/P02; BOD B01 and panitia K01 add their card). */
  home: MAIN_WAM_PATH,
  /** O02 Masuk, Main WAM's own sign-in (same account and API as WAM); `next` is where to go after. */
  login: (next?: string) => `${MAIN_WAM_PATH}/masuk${next ? `?next=${enc(next)}` : ""}`,
  /** O03 Izin notifikasi, once after the first sign-in. */
  onboarding: `${MAIN_WAM_PATH}/mulai`,
  /** N01 Notifikasi, from the bell on Beranda only. */
  notifications: `${MAIN_WAM_PATH}/notifikasi`,
  /** P03 Agenda, on a day of the event (1–4; none = today, or day 1 before the event). */
  agenda: (day?: number) => `${MAIN_WAM_PATH}/agenda${mwQuery({ hari: day })}`,
  /** P03 Agenda on a Persiapan day before the first day ("H-3": `daysBefore` 3; module ceklis). */
  agendaPrep: (daysBefore: number) => `${MAIN_WAM_PATH}/agenda${mwQuery({ hari: `h${daysBefore}` })}`,
  /** P04 Detail sesi. */
  session: (id: string) => `${MAIN_WAM_PATH}/agenda/${enc(id)}`,
  /** P05 Saya (BOD: P05B with Akses MCP). */
  me: `${MAIN_WAM_PATH}/saya`,
  /** L01 Kamar (penghuni berapa pun, check-in/out, bantuan kamar). */
  room: `${MAIN_WAM_PATH}/saya/kamar`,
  /** E01 Jejak karbon (module karbon): total, per person, where it comes from. `from`: the tab it was opened from (Beranda by default, or Saya), so that tab stays lit. */
  carbon: (from?: "saya") => `${MAIN_WAM_PATH}/jejak-karbon${from === "saya" ? "/saya" : ""}`,
  /** L03 Perjalanan, berangkat (default) or pulang. */
  travel: (direction?: "berangkat" | "pulang") => `${MAIN_WAM_PATH}/saya/perjalanan${mwQuery({ arah: direction === "pulang" ? "pulang" : undefined })}`,
  /** L04 Panduan: Denah, Hotel & fasilitas, Dress code, Tata tertib. */
  guides: `${MAIN_WAM_PATH}/saya/panduan`,
  guide: (slug: string) => `${MAIN_WAM_PATH}/saya/panduan/${enc(slug)}`,
  /** S02 Pengaturan: Notifikasi (izin di HP ini), Ganti password, versi. */
  settings: `${MAIN_WAM_PATH}/saya/pengaturan`,
  /** Bantuan: how to use the app, common questions and the panitia contact. A page of its own, not a sheet. */
  help: `${MAIN_WAM_PATH}/saya/bantuan`,

  /* B · momen */
  /** M01–M03 Momen, the stack: Semua or Kelompokku, one session, opening at one photo. */
  moments: (filter: MainWamMomentsFilter = {}) => `${MAIN_WAM_PATH}/momen${mwQuery(filter)}`,
  /** U01–U05 Kamera: `sesi` overrides the automatic tag ("umum" = no tag). */
  camera: (filter: { sesi?: string } = {}) => `${MAIN_WAM_PATH}/momen/kamera${mwQuery(filter)}`,
  /** M05 Galeri: Semua or Fotoku, one session. */
  gallery: (filter: MainWamGalleryFilter = {}) => `${MAIN_WAM_PATH}/momen/galeri${mwQuery(filter)}`,
  /** M06 Mozaik; `mark` turns "Tandai fotoku" on. */
  mosaic: (mark = false) => `${MAIN_WAM_PATH}/momen/mozaik${mwQuery({ tandai: mark ? "1" : undefined })}`,

  /* C · panitia and BOD */
  /** K01 Panitia, the hub behind the fifth tab: Kelola (4 shortcuts) and Perlu perhatian. Panitia only (the tab); the tools below open from it. */
  committee: `${MAIN_WAM_PATH}/kelola`,
  /** K02 Rundown live, on a day (1–4). */
  rundownLive: (day?: number) => `${MAIN_WAM_PATH}/kelola/rundown${mwQuery({ hari: day })}`,
  /** K05 Absen sesi: who is present, Catat hadir. */
  attendanceManual: (sessionId?: string) => `${MAIN_WAM_PATH}/kelola/absen${mwQuery({ sesi: sessionId })}`,
  /** K06 Kirim pengumuman. */
  announce: `${MAIN_WAM_PATH}/kelola/pengumuman`,
  /** K08 Moderasi Momen: Dilaporkan (default) or Disembunyikan. */
  moderation: (tab?: "dilaporkan" | "disembunyikan") => `${MAIN_WAM_PATH}/kelola/moderasi${mwQuery({ lihat: tab === "disembunyikan" ? tab : undefined })}`,

  /* D · modul */
  /** A01 Scan QR absen in the app. */
  scan: `${MAIN_WAM_PATH}/absen`,
  /** What a session's printed QR holds: A02 tercatat, A03 belum dibuka, A04 sudah ditutup. */
  checkIn: (token: string) => `${MAIN_WAM_PATH}/absen/${enc(token)}`,
  /** T01–T03 Silent Meeting (the open one, or the one of a session). */
  silentMeeting: (sessionId?: string) => `${MAIN_WAM_PATH}/silent-meeting${mwQuery({ sesi: sessionId })}`,
  /** V01 Awarding: the categories. */
  awards: `${MAIN_WAM_PATH}/awarding`,
  /** V02 Pilih nominasi in one category. */
  awardCategory: (id: string) => `${MAIN_WAM_PATH}/awarding/${enc(id)}`,
  /** Misi (module misi): my points, the missions, and a mission's detail sheet. */
  missions: `${MAIN_WAM_PATH}/misi`,
  /** Peringkat: everyone ranked by points. */
  missionRank: `${MAIN_WAM_PATH}/misi/peringkat`,
  /** Kerjakan misi: the camera (foto) or the check-in (checkin) of one mission. */
  missionDo: (id: string) => `${MAIN_WAM_PATH}/misi/${enc(id)}/kerjakan`,
  /* F · kuis (Kuis live, module kuis; docs/rancangan-kuis-wam.md) */
  /** A player's game: join, answer, see the result (Beranda's card "Kuis dimulai · Ikut"). */
  quiz: (quizId: string) => `${MAIN_WAM_PATH}/kuis/${enc(quizId)}`,
  /** The MC's control: Lanjut, Jeda, Batalkan (pengendali of the quiz, or Admin WAM). */
  quizControl: (quizId: string) => `${MAIN_WAM_PATH}/kuis/${enc(quizId)}/kendali`,
};
export const mainWamApi = {
  /* fondasi */
  /** GET: one image of the theme (KV slot), through this site; no sign-in (the splash shows before it). */
  themeImage: (slot: string, version?: string) => `${MAIN_WAM_API}/tema/${enc(slot)}${mwQuery({ v: version })}`,

  /* A · peserta (sign-in, password, push and profile photo stay on praWamApi) */
  /** GET: what Beranda shows, for a refresh in place. */
  home: `${MAIN_WAM_API}/beranda`,
  /** GET: the rundown of the four days (published sessions). */
  agenda: `${MAIN_WAM_API}/agenda`,
  /** GET: one session's detail (P04). */
  session: (id: string) => `${MAIN_WAM_API}/agenda/${enc(id)}`,
  /** POST {itemId, checked} or {all: true}: tick an item of an agenda's checklist, or all of them (module ceklis). */
  checklist: (sessionId: string) => `${MAIN_WAM_API}/ceklis/${enc(sessionId)}`,
  /** GET: an item's photo, a redirect to storage (module ceklis). */
  checklistPhoto: (itemId: string, version?: string) => `${MAIN_WAM_API}/ceklis/foto/${enc(itemId)}${mwQuery({ v: version })}`,
  /** GET: my notifications; POST {id?}: mark one, or all, read. */
  notifications: `${MAIN_WAM_API}/notifikasi`,
  /** GET: a guide's file (Denah, PDF), a redirect to storage. */
  guideFile: (id: string) => `${MAIN_WAM_API}/panduan/${enc(id)}/berkas`,

  /* B · momen */
  /** GET: the stack or the gallery (?lihat=&sesi=&sebelum=). */
  photos: (filter: MainWamGalleryFilter & { sebelum?: string } = {}) => `${MAIN_WAM_API}/momen${mwQuery(filter)}`,
  /** POST {clientId, sessionId, size, width, height, takenAt}: an upload address for one photo. */
  photoStart: `${MAIN_WAM_API}/momen/unggah`,
  /** POST {key, token, …}: the photo is uploaded; check it and keep it. */
  photoConfirm: `${MAIN_WAM_API}/momen/simpan`,
  /** POST {ids}: photos the person has seen in the stack. */
  photosSeen: `${MAIN_WAM_API}/momen/dilihat`,
  /** DELETE: Batalkan (within 5 s) or Hapus foto (owner). */
  photo: (id: string) => `${MAIN_WAM_API}/momen/${enc(id)}`,
  /** GET: the photo's file, small (stack, grid) or large; a redirect to storage. */
  /** kecil = 480 px, besar = 1600 px, ubin = 160 px (Mozaik). */
  photoFile: (id: string, size: "kecil" | "besar" | "ubin" = "besar") => `${MAIN_WAM_API}/momen/${enc(id)}/berkas${mwQuery({ ukuran: size })}`,
  /** GET: siapa bereaksi apa (daftar); PUT: bereaksi; DELETE: batal bereaksi. */
  photoReaction: (id: string) => `${MAIN_WAM_API}/momen/${enc(id)}/reaksi`,
  /** POST {reason, note}: Laporkan foto (M04); DELETE: Tampilkan lagi (for the reporter). */
  photoReport: (id: string) => `${MAIN_WAM_API}/momen/${enc(id)}/laporan`,
  /** GET: the mosaic's tiles and progress. */
  mosaic: `${MAIN_WAM_API}/mozaik`,

  /* C · panitia and BOD */
  /** PATCH {action: "jam" | "tempat" | "batal" | "kembali", version, …}: Ubah jam (K03), pindah tempat, batal/kembalikan; panitia. `version` = updated_at (409 bila sudah berubah). */
  rundownSession: (id: string) => `${MAIN_WAM_API}/kelola/rundown/${enc(id)}`,
  /** GET: Riwayat perubahan of the rundown. */
  rundownLog: `${MAIN_WAM_API}/kelola/rundown/riwayat`,
  /** GET: who is present at a session; POST {employeeId, present}: Catat hadir (K05). */
  attendance: (sessionId: string) => `${MAIN_WAM_API}/kelola/absen/${enc(sessionId)}`,
  /** GET: sent announcements; POST: send one (K06). */
  announcements: `${MAIN_WAM_API}/kelola/pengumuman`,
  /** PATCH {pinnedUntil}: unpin; DELETE: remove. */
  announcement: (id: string) => `${MAIN_WAM_API}/kelola/pengumuman/${enc(id)}`,
  /** GET: reported and hidden photos (K08). */
  moderation: `${MAIN_WAM_API}/kelola/moderasi`,
  /** POST {action: "sembunyikan" | "tampilkan" | "hapus", from}: keputusan moderasi (K08), panitia; hapus hanya foto yang sudah disembunyikan. */
  moderatePhoto: (id: string) => `${MAIN_WAM_API}/kelola/moderasi/${enc(id)}`,

  /* D · modul */
  /** POST: check in with a session's QR token (A01 → A02/A03/A04). */
  checkIn: (token: string) => `${MAIN_WAM_API}/absen/${enc(token)}`,
  /** GET: a session's QR as a PDF to print; POST: a new QR (the printed one stops working). Panitia. */
  sessionQr: (sessionId: string) => `${MAIN_WAM_API}/kelola/qr/${enc(sessionId)}`,
  /** GET: the Silent Meeting open now (or of ?sesi=), with its state; POST {questionId}: record that I opened the form (an opener, kept apart from what is sent). */
  silent: `${MAIN_WAM_API}/silent-meeting`,
  /** POST {questionId, topic, body}: one anonymous feedback (T01). */
  silentFeedback: `${MAIN_WAM_API}/silent-meeting/masukan`,
  /** POST {action: "buka" | "tutup"}: panitia opens it early or closes it for good (K02 row); once closed it never opens again. */
  silentControl: (questionId: string) => `${MAIN_WAM_API}/silent-meeting/${enc(questionId)}/kontrol`,
  /** GET: categories, nominees, my votes (and for BOD the counts). */
  awards: `${MAIN_WAM_API}/awarding`,
  /** PUT {nomineeId}: my vote in one category (changeable until it closes). */
  vote: (categoryId: string) => `${MAIN_WAM_API}/awarding/${enc(categoryId)}/suara`,
  /** POST {nomineeId}: a BOD approves the winner. */
  approveAward: (categoryId: string) => `${MAIN_WAM_API}/awarding/${enc(categoryId)}/setujui`,
  /* F · kuis */
  /** GET ?v=: the game as this phone sees it (v = the version it has: unchanged answers "same"); POST {runId}: join. */
  quiz: (quizId: string, version?: string) => `${MAIN_WAM_API}/kuis/${enc(quizId)}${mwQuery({ v: version })}`,
  /** POST {runId, index, choice, tapAt}: an answer (one per question). */
  quizAnswer: (quizId: string) => `${MAIN_WAM_API}/kuis/${enc(quizId)}/jawab`,
  /** GET: the MC's view; POST {runId, rev, action}: Lanjut, Jeda, Lanjutkan, Batalkan soal, Papan skor sekarang. */
  quizControl: (quizId: string) => `${MAIN_WAM_API}/kuis/${enc(quizId)}/kendali`,
  /** GET: my points, my place and the missions with my state (module misi; BOD 404). */
  missions: `${MAIN_WAM_API}/misi`,
  /** GET: the Peringkat (name, department, points; never an id). */
  leaderboard: `${MAIN_WAM_API}/misi/peringkat`,
  /** POST {position}: is this position inside the mission's area? Nothing is saved. */
  missionCheck: (id: string) => `${MAIN_WAM_API}/misi/${enc(id)}/cek`,
  /** POST {position}: check in to a check-in mission (judged on the server). */
  missionCheckIn: (id: string) => `${MAIN_WAM_API}/misi/${enc(id)}/checkin`,
  /** POST {clientId, position, sizes}: upload addresses for a photo mission (two JPEGs) and a token. */
  missionPhotoStart: (id: string) => `${MAIN_WAM_API}/misi/${enc(id)}/foto/unggah`,
  /** POST {…the same, token}: the files are in storage; check them, the position, and keep the proof. */
  missionPhotoConfirm: (id: string) => `${MAIN_WAM_API}/misi/${enc(id)}/foto/simpan`,
};

/**
 * Admin WAM 2026 (20 Nov 2026, KONTRAK §15): the admin of the WAM event itself, its own door apart from
 * Admin Pra WAM (/admin/wam): Ringkasan, Pengaturan (fondasi), Panitia WAM, Isi acara (E), Modul acara (D, F).
 * Its old address /admin/wam/main/** redirects here (next.config.ts).
 */
const MAIN_WAM_ADMIN = "/admin/wam2026";
export const mainWamAdminPath = {
  /** Ringkasan: where Main WAM stands, and a way into every part. */
  home: MAIN_WAM_ADMIN,
  /** The WAM event's committee (pw_event_staff), apart from Pra WAM's. */
  committee: `${MAIN_WAM_ADMIN}/panitia`,
  /** Mode acara, penguji, modul on/off, tema (fondasi). */
  settings: `${MAIN_WAM_ADMIN}/pengaturan`,
  /* E · isi acara */
  rundown: `${MAIN_WAM_ADMIN}/rundown`,
  rooms: `${MAIN_WAM_ADMIN}/kamar`,
  travel: `${MAIN_WAM_ADMIN}/perjalanan`,
  guides: `${MAIN_WAM_ADMIN}/panduan`,
  /** Hotel, alamat, check-in/out, kontak panitia, tagihan hotel (Jejak karbon). */
  eventInfo: `${MAIN_WAM_ADMIN}/info-acara`,
  /* D · modul acara */
  awards: `${MAIN_WAM_ADMIN}/awarding`,
  silent: `${MAIN_WAM_ADMIN}/silent-meeting`,
  /* F · kuis */
  /** The quizzes: make one, its games' results. */
  quizzes: `${MAIN_WAM_ADMIN}/kuis`,
  /** One quiz: questions, pengendali, the big screen's link, games, results with names. */
  quiz: (id: string) => `${MAIN_WAM_ADMIN}/kuis/${enc(id)}`,
  /** Misi: missions, completions and their proofs, manual points, the Peringkat. */
  missions: `${MAIN_WAM_ADMIN}/misi`,
};
const MAIN_WAM_ADMIN_API = "/api/admin/wam2026";
export const mainWamAdminApi = {
  /* fondasi */
  /** GET: Panitia WAM; POST {employeeId, seksi}: add one (or change their seksi). */
  committee: `${MAIN_WAM_ADMIN_API}/panitia`,
  /** PATCH {seksi}; DELETE: one person of Panitia WAM. */
  committeeMember: (employeeId: string) => `${MAIN_WAM_ADMIN_API}/panitia/${enc(employeeId)}`,
  /** PUT {mode?, modules?, moduleConfig?, theme?}: Pengaturan. */
  settings: `${MAIN_WAM_ADMIN_API}/pengaturan`,
  /** POST {employeeId}: add a penguji. */
  testers: `${MAIN_WAM_ADMIN_API}/penguji`,
  /** DELETE: remove one penguji. */
  tester: (employeeId: string) => `${MAIN_WAM_ADMIN_API}/penguji/${enc(employeeId)}`,
  /** POST {slot, mime, size}: an upload address for one KV image. */
  themeImageStart: `${MAIN_WAM_ADMIN_API}/tema/unggah`,
  /** POST {slot, key, token, mime, size}: the image is uploaded; check it and use it. */
  themeImageConfirm: `${MAIN_WAM_ADMIN_API}/tema/simpan`,
  /** DELETE: empty one KV slot. */
  themeImage: (slot: string) => `${MAIN_WAM_ADMIN_API}/tema/${enc(slot)}`,
  /* E · isi acara */
  sessions: `${MAIN_WAM_ADMIN_API}/sesi`,
  session: (id: string) => `${MAIN_WAM_ADMIN_API}/sesi/${enc(id)}`,
  /** PUT {required, items}: an agenda's checklist (the list replaces the old one) and its "wajib lengkap sebelum absen" switch. */
  sessionChecklist: (id: string) => `${MAIN_WAM_ADMIN_API}/sesi/${enc(id)}/ceklis`,
  /** POST {mime, size}: an upload address for one checklist photo. */
  checklistPhotoStart: `${MAIN_WAM_ADMIN_API}/ceklis/unggah`,
  /** POST {key, token, mime, size}: the photo is uploaded; check it. */
  checklistPhotoConfirm: `${MAIN_WAM_ADMIN_API}/ceklis/simpan`,
  /** GET: a checklist item's photo, for the admin (a redirect to storage). */
  checklistPhoto: (itemId: string, version?: string) => `${MAIN_WAM_ADMIN_API}/ceklis/foto/${enc(itemId)}${mwQuery({ v: version })}`,
  groups: `${MAIN_WAM_ADMIN_API}/kelompok`,
  group: (id: string) => `${MAIN_WAM_ADMIN_API}/kelompok/${enc(id)}`,
  groupMembers: (id: string) => `${MAIN_WAM_ADMIN_API}/kelompok/${enc(id)}/anggota`,
  activityGroups: `${MAIN_WAM_ADMIN_API}/kelompok-kegiatan`,
  activityGroup: (id: string) => `${MAIN_WAM_ADMIN_API}/kelompok-kegiatan/${enc(id)}`,
  /** PUT {floor, note}: a room of HR's pairing (Kuesioner → Kamar). */
  roomDetail: (roomId: string) => `${MAIN_WAM_ADMIN_API}/kamar/${enc(roomId)}`,
  trips: `${MAIN_WAM_ADMIN_API}/perjalanan`,
  trip: (id: string) => `${MAIN_WAM_ADMIN_API}/perjalanan/${enc(id)}`,
  tripSeats: (id: string) => `${MAIN_WAM_ADMIN_API}/perjalanan/${enc(id)}/kursi`,
  guides: `${MAIN_WAM_ADMIN_API}/panduan`,
  guide: (id: string) => `${MAIN_WAM_ADMIN_API}/panduan/${enc(id)}`,
  guideFileStart: `${MAIN_WAM_ADMIN_API}/panduan/unggah`,
  guideFileConfirm: `${MAIN_WAM_ADMIN_API}/panduan/simpan`,
  /** PUT {name, venue, hotel, checkInAt, checkOutAt, contacts, groupsPublished, carbon}: the event's facts (E). */
  eventInfo: `${MAIN_WAM_ADMIN_API}/info-acara`,
  /* D · modul acara */
  awardCategories: `${MAIN_WAM_ADMIN_API}/awarding`,
  awardCategory: (id: string) => `${MAIN_WAM_ADMIN_API}/awarding/${enc(id)}`,
  awardNominees: (id: string) => `${MAIN_WAM_ADMIN_API}/awarding/${enc(id)}/nominasi`,
  awardApprove: (id: string) => `${MAIN_WAM_ADMIN_API}/awarding/${enc(id)}/setujui`,
  silentQuestions: `${MAIN_WAM_ADMIN_API}/silent-meeting`,
  silentQuestion: (id: string) => `${MAIN_WAM_ADMIN_API}/silent-meeting/${enc(id)}`,
  /* F · kuis */
  /** GET: the quizzes; POST {title}: a new one. */
  quizzes: `${MAIN_WAM_ADMIN_API}/kuis`,
  /** GET: one quiz with its questions, pengendali, games; PATCH {title}; DELETE. */
  quiz: (id: string) => `${MAIN_WAM_ADMIN_API}/kuis/${enc(id)}`,
  /** POST {level, body, options, correct}: a question. */
  quizQuestions: (id: string) => `${MAIN_WAM_ADMIN_API}/kuis/${enc(id)}/soal`,
  /** PATCH (the same), DELETE: one question. */
  quizQuestion: (id: string, questionId: string) => `${MAIN_WAM_ADMIN_API}/kuis/${enc(id)}/soal/${enc(questionId)}`,
  /** POST {direction: naik|turun}: move a question within its level. */
  quizQuestionMove: (id: string, questionId: string) => `${MAIN_WAM_ADMIN_API}/kuis/${enc(id)}/soal/${enc(questionId)}/pindah`,
  /** POST {employeeId}: a pengendali. */
  quizHosts: (id: string) => `${MAIN_WAM_ADMIN_API}/kuis/${enc(id)}/pengendali`,
  /** DELETE: one pengendali. */
  quizHost: (id: string, employeeId: string) => `${MAIN_WAM_ADMIN_API}/kuis/${enc(id)}/pengendali/${enc(employeeId)}`,
  /** GET: the agenda item the quiz is tied to and the agenda to choose from; PUT {sessionId|null}. */
  quizAgenda: (id: string) => `${MAIN_WAM_ADMIN_API}/kuis/${enc(id)}/agenda`,
  /** POST: a new big-screen link (shown once; the old one stops working). */
  quizScreen: (id: string) => `${MAIN_WAM_ADMIN_API}/kuis/${enc(id)}/layar`,
  /** POST: a new game (the one not over ends; its results stay). */
  quizRuns: (id: string) => `${MAIN_WAM_ADMIN_API}/kuis/${enc(id)}/permainan`,
  /** GET: a game's results with names (for the prizes); `unduh` = the Excel file. */
  quizResults: (id: string, runId: string, download = false) => `${MAIN_WAM_ADMIN_API}/kuis/${enc(id)}/hasil${mwQuery({ permainan: runId, unduh: download ? "1" : undefined })}`,
  /* Misi */
  /** GET: everything the Misi page needs; POST: a new mission. */
  missions: `${MAIN_WAM_ADMIN_API}/misi`,
  /** PATCH: change a mission; DELETE: a mission with no completion. */
  mission: (id: string) => `${MAIN_WAM_ADMIN_API}/misi/${enc(id)}`,
  /** PUT {defaultRadiusM, maxAccuracyM, leaderboardOpen}: the settings. */
  missionSettings: `${MAIN_WAM_ADMIN_API}/misi/pengaturan`,
  /** POST {employeeId, note}: record that a person did a mission (sesi, or a proof by hand). */
  missionGrant: (id: string) => `${MAIN_WAM_ADMIN_API}/misi/${enc(id)}/catat`,
  /** PATCH {status, note}: approve or reject a proof; DELETE: take a completion back. */
  missionCompletion: (id: string) => `${MAIN_WAM_ADMIN_API}/misi/penyelesaian/${enc(id)}`,
  /** GET: a proof photo (redirect to storage). */
  missionProof: (id: string) => `${MAIN_WAM_ADMIN_API}/misi/penyelesaian/${enc(id)}/foto`,
  /** POST {employeeId, points, note}: points by hand. */
  missionPoints: `${MAIN_WAM_ADMIN_API}/misi/poin`,
  /** DELETE: take a manual entry back. */
  missionPoint: (id: string) => `${MAIN_WAM_ADMIN_API}/misi/poin/${enc(id)}`,
};

/**
 * Kuis live's big screen (projector/LED): /kuis/{key}, no sign-in, as an office TV opens /tv/{key}. The key
 * in the address is the secret (kuis_ + 32 random bytes; only its sha256 is kept); it answers only while
 * the module is on. Its feed: GET /api/kuis/{key}.
 */
export const kuisScreenPath = (key: string) => `/kuis/${enc(key)}`;
export const kuisScreenApi = (key: string) => `/api/kuis/${enc(key)}`;

/*
 * Booking Kantor (10 Nov 2026): the office's own booking app, outside WAM, replacing
 * booking.werkudaragroup.com. Rooms first; cars, Zoom and activities come later. It signs in with
 * the WAM account (praWamPath.login) and shares WAM's rooms and bookings (pw_*), so a room is never
 * taken twice. The administration staff (role "ga") manage it under /booking/kelola.
 */
export const BOOKING_PATH = "/booking";
const BOOKING_API = "/api/booking";
const query = (values: Record<string, string | undefined>) => {
  const search = new URLSearchParams(Object.entries(values).filter((entry): entry is [string, string] => !!entry[1])).toString();
  return search ? `?${search}` : "";
};
export const bookingPath = {
  /** Beranda: what can be booked, and the person's next bookings. */
  home: BOOKING_PATH,
  /**
   * Masuk (11 Nov 2026): Booking Kantor's own sign-in page, with the same employee account as WAM
   * (one email, one password) but none of WAM's look or name. `next` is where to go afterwards.
   */
  login: (next?: string) => `${BOOKING_PATH}/masuk${next ? `?next=${enc(next)}` : ""}`,
  /** Lupa password: a request to reset the account to the first password (the same requests as WAM's). */
  forgot: `${BOOKING_PATH}/lupa-password`,
  /** Right after signing in with the first password: pick a new one, or skip for now. */
  newPassword: (next?: string) => `${BOOKING_PATH}/password-baru${next ? `?next=${enc(next)}` : ""}`,
  /**
   * Ruangan: every room on one day, for a start and a length (`start` "10:00", `menit` "60"). `new`
   * opens the form (with a room), `edit` opens one of the person's own bookings.
   */
  rooms: (options: { date?: string; new?: string; edit?: string; start?: string; menit?: string } = {}) => `${BOOKING_PATH}/ruangan${query(options)}`,
  /** Booking saya: made by or inviting the person, from today on. */
  mine: `${BOOKING_PATH}/saya`,
  /**
   * Kelola (administration staff), Ringkasan dan jadwal: the numbers and every room's day, any day;
   * tap an empty half hour to book for someone (`edit` opens a booking to change for its booker).
   */
  manage: (date?: string, edit?: string) => `${BOOKING_PATH}/kelola${query({ date, edit })}`,
  /** Kelola → Semua booking: from `dari` to `sampai`, searched by `q`, one room (`ruang`), `untuk` internal or eksternal. */
  manageBookings: (filters: { dari?: string; sampai?: string; q?: string; ruang?: string; untuk?: string } = {}) => `${BOOKING_PATH}/kelola/booking${query(filters)}`,
  /** Kelola → Ruangan: add rooms, change capacity, facilities, departments, bookable. */
  manageRooms: `${BOOKING_PATH}/kelola/ruangan`,
  /** Kelola → Akses: who is Admin Booking. */
  manageAccess: `${BOOKING_PATH}/kelola/akses`,
};
export const bookingApi = {
  /** POST: a new booking (`forId`: for someone, administration staff only); with an id, PATCH changes it and DELETE {reason} cancels it. */
  bookings: (id?: string) => `${BOOKING_API}/bookings${id ? `/${id}` : ""}`,
  /** Kelola: POST {name, capacity} adds a room; with an id, PATCH saves it. */
  rooms: (id?: string) => `${BOOKING_API}/kelola/rooms${id ? `/${id}` : ""}`,
  /** Kelola: PUT {on} gives or takes one person's Admin Booking. */
  access: (employeeId: string) => `${BOOKING_API}/kelola/access/${employeeId}`,
};

/*
 * WG People (/hr, 20 Nov 2026): the employees' own HR app, apart from WAM. Absensi first (masuk
 * and pulang with the face and the office point); cuti, lembur DW and more to come. It signs in
 * with the same employee account as WAM and Booking Kantor, on its own pages and in its own look.
 * Its admin lives in Journey Admin (/admin/hr), given per person in Super admin → Akses admin.
 */
export const HR_PATH = "/people";
const HR_API = "/api/hr";
export const hrPath = {
  /** Absen: today's masuk and pulang, and the way to clock in; `?daftar=1` opens enrolment. */
  home: HR_PATH,
  /** The bottom menu's other places (21 Nov 2026); switching between them never reloads. */
  history: `${HR_PATH}/riwayat`,
  requests: `${HR_PATH}/pengajuan`,
  profile: `${HR_PATH}/profil`,
  /** Tim (21 Nov 2026): who is on cuti, sakit, izin or dinas, as a calendar or a list. */
  team: `${HR_PATH}/tim`,
  enroll: `${HR_PATH}?daftar=1`,
  login: (next?: string) => `${HR_PATH}/masuk${next ? `?next=${enc(next)}` : ""}`,
  forgot: `${HR_PATH}/lupa-password`,
  newPassword: (next?: string) => `${HR_PATH}/password-baru${next ? `?next=${enc(next)}` : ""}`,
};
export const hrApi = {
  /** GET: the person's absensi today, their face status, the office points, the last 14 days. */
  clockIn: `${HR_API}/absen`,
  /** POST {kind}: a nonce and its liveness steps; then upload {token, mime, size}; then submit. */
  clockInStart: `${HR_API}/absen/start`,
  clockInUpload: `${HR_API}/absen/upload`,
  clockInSubmit: `${HR_API}/absen/submit`,
  /** Enrolment: POST start, then the same upload, then POST {consent, token, embeddings, signals, photo}. */
  enrollStart: `${HR_API}/wajah/start`,
  enroll: `${HR_API}/wajah`,
  /** DELETE: the person withdraws consent; their face data goes. */
  face: `${HR_API}/wajah/saya`,
  /** POST: ask Admin HR to fix an absen (21 Nov 2026); with an id, DELETE withdraws a waiting request. */
  requests: `${HR_API}/revisi`,
  request: (id: string) => `${HR_API}/revisi/${id}`,
  /** GET ?bulan=YYYY-MM: the team's cuti, sakit, izin and dinas that month (21 Nov 2026); POST asks for one; with an id, DELETE withdraws a waiting one. */
  leaves: (month?: string) => `${HR_API}/cuti${month ? `?bulan=${month}` : ""}`,
  leave: (id: string) => `${HR_API}/cuti/${id}`,
};
/** Admin WG People in Journey Admin (20 Nov 2026): one page per section (src/components/hr-admin/sections.ts). */
export const HR_ADMIN = "/admin/hr";
const HR_ADMIN_API = "/api/admin/hr";
export const hrAdminPath = {
  /** Ringkasan: today's numbers, what to set up, and what waits. */
  home: HR_ADMIN,
  /** Perlu dicek: every clock-in that waits for a decision, newest first. */
  waiting: `${HR_ADMIN}/perlu-dicek`,
  /** Absen harian: everyone's masuk and pulang on one day (`tanggal`). */
  day: (date?: string) => `${HR_ADMIN}/absen${date ? `?tanggal=${date}` : ""}`,
  /** Wajah terdaftar: the reference faces, approving them, and Proses foto impor. */
  faces: `${HR_ADMIN}/wajah`,
  /** Titik kantor: the office points and their radius. */
  offices: `${HR_ADMIN}/kantor`,
  /** Revisi: what employees ask to fix, to approve or refuse (21 Nov 2026). */
  requests: `${HR_ADMIN}/revisi`,
  /** Cuti & izin: cuti, sakit, izin and dinas asked for, to approve or refuse (21 Nov 2026). */
  leaves: `${HR_ADMIN}/cuti`,
  /** Rekap bulanan: everyone × every day of a month, coloured like a spreadsheet (`bulan`). */
  month: (month?: string) => `${HR_ADMIN}/rekap${month ? `?bulan=${month}` : ""}`,
};
export const hrAdminApi = {
  /** GET ?tanggal=: everyone's masuk and pulang that day. */
  day: (date: string) => `${HR_ADMIN_API}/absen?tanggal=${date}`,
  /** GET: the clock-ins that wait. */
  waiting: `${HR_ADMIN_API}/absen/perlu-dicek`,
  /** PATCH {status, note}: Setujui or Tolak one clock-in; DELETE: Hapus absen (and its selfie). */
  record: (id: string) => `${HR_ADMIN_API}/absen/${id}`,
  /** GET: a redirect to the clock-in's selfie (five minutes). */
  selfie: (id: string) => `${HR_ADMIN_API}/absen/${id}/selfie`,
  /** POST: this clock-in's selfie becomes the person's reference face. */
  asReference: (id: string) => `${HR_ADMIN_API}/absen/${id}/acuan`,
  /** POST {employeeId, workDate, kind, time, zone, note}: a clock-in recorded by hand. */
  manual: `${HR_ADMIN_API}/absen/manual`,
  /** POST: delete the selfies older than 90 days (the admin presses it; no schedule). */
  oldSelfies: `${HR_ADMIN_API}/absen/selfie-lama`,
  /** GET: every reference face. */
  faces: `${HR_ADMIN_API}/wajah`,
  /** POST {action}: setujui, tolak, reset, or proses (an imported photo's embedding or why it is unreadable). */
  face: (employeeId: string) => `${HR_ADMIN_API}/wajah/${employeeId}`,
  /** GET: the reference photo (same origin, for Proses foto impor); `?lihat=1` redirects to storage. */
  facePhoto: (employeeId: string, view = false) => `${HR_ADMIN_API}/wajah/${employeeId}/foto${view ? "?lihat=1" : ""}`,
  /** POST {mime, size}: where Admin HR's reference photo for this person goes ("Unggah foto acuan"). */
  faceUpload: (employeeId: string) => `${HR_ADMIN_API}/wajah/${employeeId}/unggah`,
  /** GET/POST: the office points; PUT/DELETE one. */
  offices: `${HR_ADMIN_API}/kantor`,
  office: (id: string) => `${HR_ADMIN_API}/kantor/${id}`,
  /** GET: the revision requests; with an id, POST {approve, note} decides one. */
  requests: `${HR_ADMIN_API}/revisi`,
  request: (id: string) => `${HR_ADMIN_API}/revisi/${id}`,
  /** PUT {method}: how everyone clocks in (gerakan or foto). */
  method: `${HR_ADMIN_API}/metode`,
  /** PUT {time}: a masuk after this time (HH:MM, the office's zone) is Telat. */
  lateAfter: `${HR_ADMIN_API}/jam-masuk`,
  /** GET: the cuti/sakit/izin/dinas requests; with an id, POST {approve, note} decides one. */
  leaves: `${HR_ADMIN_API}/cuti`,
  leave: (id: string) => `${HR_ADMIN_API}/cuti/${id}`,
  /** POST {note}: withdraw a waiting or approved one. */
  leaveCancel: (id: string) => `${HR_ADMIN_API}/cuti/${id}/batal`,
  /** GET ?bulan=YYYY-MM: Rekap bulanan's cells. */
  month: (month: string) => `${HR_ADMIN_API}/rekap?bulan=${month}`,
};

/*
 * TV Announcement: an office TV opens /tv/{address} with no sign-in, e.g. /tv/lobi; the address
 * is the TV's short slug, picked by the admin and open on purpose (an older TV's is its long key).
 * Outside /wam and /admin on purpose: no login, no app frame.
 */
export const tvPath = (key: string) => `/tv/${enc(key)}`;
/** The one address for every TV: the same board, without naming a TV (so Admin WAM cannot tell which TV is on). */
export const TV_HOME_PATH = "/tv";
/**
 * The board for an old TV browser that cannot run the board's script (a Samsung of 2017, an LG on
 * webOS): the TV's list as plain HTML, one item a load. /tv/lite for the one address,
 * /tv/{address}/lite for one TV; `?s=` is the item on show (an older `?v=hari|minggu` still works).
 */
export const tvLitePath = (key?: string | null, item?: string) =>
  `${key ? `/tv/${enc(key)}` : TV_HOME_PATH}/lite${item ? `?s=${enc(item)}` : ""}`;
export const tvHomeApi = {
  /** GET: what TVs play now. */
  feed: "/api/tv",
  /** GET: one picture, through this site. */
  image: (slideId: string) => `/api/tv/image/${slideId}`,
};
export const tvApi = {
  /** GET: what the TV plays now; `?w=&h=` tell the admin how big the screen is. */
  feed: (key: string) => `/api/tv/${enc(key)}`,
  /** GET: one picture, through this site (storage stays private). */
  image: (key: string, slideId: string) => `/api/tv/${enc(key)}/image/${slideId}`,
};
/** Admin WAM → Telegram (any admin, 12 Nov 2026): GET the bot and groups; POST {action} webhook, install, sample, topic, remove. */
export const praWamTelegramApi = "/api/admin/wam/telegram";
/** Admin WAM → Arsip MoM (any admin): the list, a MoM's PDF, a photo (view, download, bytes), a photo to the TV, Excel rekap. */
export const momCabinetApi = {
  list: "/api/admin/wam/mom",
  pdf: (sessionId: string) => `/api/admin/wam/mom/${sessionId}/pdf`,
  /** The MoM as a Word file, to change it (13 Nov 2026). */
  docx: (sessionId: string) => `/api/admin/wam/mom/${sessionId}/docx`,
  /** The MoM uploaded as a file (13 Nov 2026): a download, or its bytes for a zip made in the browser. */
  file: (sessionId: string) => `/api/admin/wam/mom/${sessionId}/file`,
  fileBytes: (sessionId: string) => `/api/admin/wam/mom/${sessionId}/file?berkas=1`,
  photo: (photoId: string) => `/api/admin/wam/mom/photos/${photoId}`,
  photoDownload: (photoId: string, name: string) => `/api/admin/wam/mom/photos/${photoId}?unduh=${encodeURIComponent(name)}`,
  photoFile: (photoId: string) => `/api/admin/wam/mom/photos/${photoId}?berkas=1`,
  photoTv: (photoId: string) => `/api/admin/wam/mom/photos/${photoId}/tv`,
  photosTv: "/api/admin/wam/mom/photos/tv",
  export: "/api/admin/wam/mom/export",
} as const;
/** Admin WAM → TV Announcement (any admin). */
const TV_ADMIN_API = "/api/admin/wam/tv";
/** The Werkudara welcome sign's background (from "Welcome Sign Template.pptx"), a file of the site, in public/wam: a file under public/tv is answered by the TV page (/tv/{slug}) instead. */
export const TV_WELCOME_ART = "/wam/tv-welcome-werkudara.webp";
/**
 * The team's birthday card, blank (its paper, mark, "Birthday", frame, flowers and foot; no name, date, person or wish), and the
 * flowers of it that stand in front of the person. Made from a finished card of the team's; files of the site, in public/wam.
 */
export const TV_BIRTHDAY_CARD = "/wam/tv-bday-card.webp";
export const TV_BIRTHDAY_FLOWERS = "/wam/tv-bday-flowers.webp";
/** Werkudara's mark (the winged horse), a black shape on nothing: the TV's waiting screen cuts it out of the sign's blue. */
export const TV_MARK = "/werkudara-mark.png";
/** GET: a meeting photo of the "Foto meeting" template, for a TV, through this site (12 Nov 2026). */
export const tvMeetingPhotoApi = (photoId: string) => `/api/tv/foto-meeting/${photoId}`;
/** GET: a video file of the playlist, for a TV; answers with a short-lived address in storage. */
export const tvVideoApi = (itemId: string) => `/api/tv/video/${itemId}`;
export const praWamTvApi = {
  /** GET: the TVs, the pictures and the settings. */
  list: TV_ADMIN_API,
  /** GET: what a TV would play now, for the preview. */
  feed: `${TV_ADMIN_API}/feed`,
  /** POST {name, slug}: a new TV at /tv/{slug}. */
  screens: `${TV_ADMIN_API}/screens`,
  /** PATCH {name?, slug?}: rename or move the TV; DELETE: its address stops working. */
  screen: (id: string) => `${TV_ADMIN_API}/screens/${id}`,
  /** PUT {showSchedule, scheduleSeconds}. */
  settings: `${TV_ADMIN_API}/settings`,
  /** POST {mime, size}: an upload address for one picture. */
  slideStart: `${TV_ADMIN_API}/slides/start`,
  /** POST: the picture is uploaded; check it and add it to the loop. */
  slideConfirm: `${TV_ADMIN_API}/slides/confirm`,
  /** PATCH {title?, seconds?, active?}; DELETE removes the picture. */
  slide: (id: string) => `${TV_ADMIN_API}/slides/${id}`,
  /** GET: one picture, for the admin's list and preview. */
  slideImage: (id: string) => `${TV_ADMIN_API}/slides/${id}/image`,
  /** PUT {ids}: the pictures in a new order. */
  order: `${TV_ADMIN_API}/slides/order`,
  /** POST {kind, title?, body?}: a template (one of each) or a text joins the playlist. */
  items: `${TV_ADMIN_API}/items`,
  /** PATCH: a row's text, duration, on/off, dates, hours and TVs; DELETE removes it (a picture's row with its picture). */
  item: (id: string) => `${TV_ADMIN_API}/items/${id}`,
  /** PUT {ids}: the playlist in a new order. */
  itemOrder: `${TV_ADMIN_API}/items/order`,
  /** POST {mime, size}: an upload address for one video file. */
  videoStart: `${TV_ADMIN_API}/videos/start`,
  /** POST: the video is uploaded; check it and add it to the playlist. */
  videoConfirm: `${TV_ADMIN_API}/videos/confirm`,
  /** POST {itemId, minutes, screenIds}: one row takes the TVs over (Tayangkan sekarang); DELETE stops it. */
  takeover: `${TV_ADMIN_API}/now`,
  /** POST: ask one TV to load its page afresh. */
  screenReload: (id: string) => `${TV_ADMIN_API}/screens/${id}/reload`,
};
/**
 * Admin TV: TV Announcement's own admin, outside Admin WAM (10 Nov 2026), with the same admin
 * sign-in. Pantauan (which TV is on and what it shows), Tayangan (the playlist), Layar TV (the
 * addresses), Tampilan (dark or light, the QR code), and the board as a TV plays it.
 */
export const TV_ADMIN = "/admin/tv";
export const tvAdminPath = {
  home: TV_ADMIN,
  playlist: `${TV_ADMIN}/tayangan`,
  screens: `${TV_ADMIN}/layar`,
  look: `${TV_ADMIN}/tampilan`,
  preview: `${TV_ADMIN}/pratinjau`,
};

/*
 * Admin Wellbeing (16 Nov 2026, docs/rancangan-wellbeing.md): the office wellbeing programme's admin,
 * one client app (no page load between its menus). Hari ini (what needs doing), Periksa (activities
 * to check), Karyawan (points per person, Tambah poin to many), Pengaturan (catalogue and rules).
 */
// The address is /admin/wlm (WLM, the programme's name, 18 Nov 2026); /admin/wellbeing redirects here.
export const WELLBEING_ADMIN = "/admin/wlm";
// Hadiah (18 Nov 2026): the rewards and the claims to decide.
export const WELLBEING_ADMIN_SECTIONS = ["hari-ini", "periksa", "karyawan", "hadiah", "laporan", "pengaturan"] as const;
export type WellbeingAdminSection = (typeof WELLBEING_ADMIN_SECTIONS)[number];
export const wellbeingAdminPath = (section: WellbeingAdminSection = "hari-ini") => section === "hari-ini" ? WELLBEING_ADMIN : `${WELLBEING_ADMIN}/${section}`;
const WELLBEING_ADMIN_API = "/api/admin/wellbeing";
export const wellbeingAdminApi = {
  overview: `${WELLBEING_ADMIN_API}/overview`,
  activities: (query: Record<string, string | undefined> = {}) => {
    const search = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => !!entry[1])).toString();
    return `${WELLBEING_ADMIN_API}/activities${search ? `?${search}` : ""}`;
  },
  activity: (id: string) => `${WELLBEING_ADMIN_API}/activities/${id}`,
  /** POST { ids, checked }: Konfirmasi yang dipilih (17 Nov 2026). */
  check: `${WELLBEING_ADMIN_API}/activities/check`,
  /** POST the choice, answers the .xlsx (17 Nov 2026). */
  export: `${WELLBEING_ADMIN_API}/export`,
  people: (period: "month" | "all") => `${WELLBEING_ADMIN_API}/people?period=${period}`,
  person: (id: string) => `${WELLBEING_ADMIN_API}/people/${id}`,
  points: `${WELLBEING_ADMIN_API}/points`,
  pointBatch: (batchId: string, employeeId?: string) => `${WELLBEING_ADMIN_API}/points/${batchId}${employeeId ? `?employee=${employeeId}` : ""}`,
  catalog: `${WELLBEING_ADMIN_API}/catalog`,
  catalogItem: (code: string) => `${WELLBEING_ADMIN_API}/catalog/${encodeURIComponent(code)}`,
  settings: `${WELLBEING_ADMIN_API}/settings`,
  /** PUT: Kontrol aplikasi karyawan (17 Nov 2026). */
  appControls: `${WELLBEING_ADMIN_API}/settings/app`,
  /** GET the office's Strava app; POST Aktifkan webhook (18 Nov 2026). */
  strava: `${WELLBEING_ADMIN_API}/strava`,
  /** Hadiah (18 Nov 2026): GET everything, POST a new reward. */
  rewards: `${WELLBEING_ADMIN_API}/rewards`,
  /** PATCH (change) or DELETE (never claimed) one reward. */
  reward: (id: string) => `${WELLBEING_ADMIN_API}/rewards/${id}`,
  /** POST { mime, size }: where to upload one reward photo. */
  rewardUploads: `${WELLBEING_ADMIN_API}/rewards/uploads`,
  /** GET a voucher's unique codes and who got each (migration 202611180004). */
  rewardCodes: (id: string) => `${WELLBEING_ADMIN_API}/rewards/${id}/codes`,
  /** POST { action, reason, code }: approve, hand over (a typed-in voucher code with it), or reject a claim. */
  claim: (id: string) => `${WELLBEING_ADMIN_API}/rewards/claims/${id}`,
};

/*
 * Wellbeing for employees (17 Nov 2026): one client app at /wlm (Beranda, Riwayat, Peringkat,
 * Profil; Catat is a sheet), signed in with the WAM account on its own page /wlm/masuk. WLM
 * (Werkudara Life Mode) is the programme's name, as in the old app; /wellbeing redirects here (18 Nov 2026).
 */
export const WELLBEING_PATH = "/wlm";
export const wellbeingPath = {
  home: WELLBEING_PATH,
  section: (section: "beranda" | "riwayat" | "peringkat" | "profil") => section === "beranda" ? WELLBEING_PATH : `${WELLBEING_PATH}/${section}`,
  login: (next?: string) => `${WELLBEING_PATH}/masuk${next ? `?next=${enc(next)}` : ""}`,
};
const WELLBEING_API = "/api/wellbeing";
export const wellbeingApi = {
  home: `${WELLBEING_API}/home`,
  catalog: `${WELLBEING_API}/catalog`,
  activities: (filter: string, before?: string) => `${WELLBEING_API}/activities?filter=${filter}${before ? `&before=${enc(before)}` : ""}`,
  activity: (id: string) => `${WELLBEING_API}/activities/${id}`,
  log: `${WELLBEING_API}/activities`,
  uploads: `${WELLBEING_API}/uploads`,
  leaderboard: (period: "month" | "all", dim: string) => `${WELLBEING_API}/leaderboard?period=${period}&dim=${dim}`,
  ledger: `${WELLBEING_API}/ledger`,
  /** Strava (18 Nov 2026). GET my connection, DELETE Putuskan. */
  strava: `${WELLBEING_API}/strava`,
  /** GET (a page visit): off to Strava's page to allow WLM; Strava comes back to stravaCallback. */
  stravaConnect: `${WELLBEING_API}/strava/connect`,
  stravaCallback: `${WELLBEING_API}/strava/callback`,
  /** POST: Sinkronkan sekarang. */
  stravaSync: `${WELLBEING_API}/strava/sync`,
  /** Strava's webhook (its check and its events). */
  stravaWebhook: `${WELLBEING_API}/strava/webhook`,
  /** POST { period, from, to }: Unduh rekap saya, my own data as an Excel file (19 Nov 2026). */
  export: `${WELLBEING_API}/export`,
  /** Hadiah (18 Nov 2026): my saldo, the rewards, my claims. */
  rewards: `${WELLBEING_API}/rewards`,
  /** POST { rewardId, note }: ask for a reward. */
  claims: `${WELLBEING_API}/rewards/claims`,
  /** POST: cancel my claim while it waits. */
  claim: (id: string) => `${WELLBEING_API}/rewards/claims/${id}`,
};

/*
 * Refleksi Leader (19 Nov 2026): the reflection leaders write before the Leadership Reset training.
 * No sign-in: the form is open at /leadership-reset; a leader's own answer, the CMS and the coach's
 * page open by a key each. A leader's key stays after "#", so it never reaches a server or its logs;
 * the CMS and coach keys sit in their address and go to the APIs in a header, never in a query.
 */
export const LEADERSHIP_RESET_PATH = "/refleksi";
export const LEADERSHIP_RESET_SECTIONS = ["ringkasan", "isi"] as const;
export type LeadershipResetSection = (typeof LEADERSHIP_RESET_SECTIONS)[number];
export const leadershipResetPath = {
  home: LEADERSHIP_RESET_PATH,
  own: (key: string) => `${LEADERSHIP_RESET_PATH}#jawaban=${key}`,
  /** /refleksi/kelola: the CMS, open to anyone with the address (19 Nov 2026). */
  cmsHome: `${LEADERSHIP_RESET_PATH}/kelola`,
  cmsSection: (section: LeadershipResetSection) => `${LEADERSHIP_RESET_PATH}/kelola${section === "ringkasan" ? "" : `?bagian=${section}`}`,
  cms: (key: string, section: LeadershipResetSection = "ringkasan") => `${LEADERSHIP_RESET_PATH}/kelola/${key}${section === "ringkasan" ? "" : `?bagian=${section}`}`,
};
const LEADERSHIP_RESET_API = "/api/leadership-reset";
/** The header the CMS and coach keys travel in. */
export const LEADERSHIP_RESET_KEY_HEADER = "x-refleksi-key";
export const leadershipResetApi = {
  /** PUT: save my answer (new or changed). POST {key}: read it back. */
  answer: `${LEADERSHIP_RESET_API}/jawaban`,
  /** CMS (key header). GET the overview. */
  cms: `${LEADERSHIP_RESET_API}/kelola`,
  /** PUT {content, isOpen}. */
  cmsForm: `${LEADERSHIP_RESET_API}/kelola/form`,
  /** DELETE: one answer (a test or a double). */
  cmsResponse: (id: string) => `${LEADERSHIP_RESET_API}/kelola/jawaban/${enc(id)}`,
  /** GET: every answer as Excel. */
  cmsExcel: `${LEADERSHIP_RESET_API}/kelola/excel`,
};
