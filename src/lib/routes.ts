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
};
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
  /** The app's theme for everyone: Dream Out Loud or Werkudara, each light and dark. */
  theme: `${WAM_ADMIN}/tema`,
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
/** Admin WAM: PUT the app settings, e.g. whether Book shows the floor plan. */
export const praWamSettingsApi = "/api/admin/wam/settings";
/** Admin WAM → Tema aplikasi (any admin). */
export const praWamThemeApi = "/api/admin/wam/theme";

/*
 * Main WAM (17 Nov 2026, docs/main-wam/KONTRAK.md): the app during WAM itself (4–7 Jan 2027), inside
 * /wam with the same account and the same session, hidden until Admin WAM → Main WAM → Pengaturan
 * turns it on. Every page and API of every screen is listed here at once, so the agents building the
 * screens never edit this file: a new address is a change to the contract (KONTRAK §5).
 * Areas: A peserta, B momen, C panitia/BOD, D modul, E admin; fondasi for what is shared.
 */
export const MAIN_WAM_PATH = `${PRA_WAM_PATH}/acara`;
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
  /** P04 Detail sesi. */
  session: (id: string) => `${MAIN_WAM_PATH}/agenda/${enc(id)}`,
  /** P05 Saya (BOD: P05B with Akses MCP). */
  me: `${MAIN_WAM_PATH}/saya`,
  /** L01 Kelompok & kamar. */
  groupRoom: `${MAIN_WAM_PATH}/saya/kelompok`,
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
  /** B02 Kehadiran (BOD), on a day (1–4). */
  attendanceSummary: (day?: number) => `${MAIN_WAM_PATH}/ringkasan/kehadiran${mwQuery({ hari: day })}`,

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
  /** B05 Rekap Silent Meeting (BOD). */
  silentRecap: `${MAIN_WAM_PATH}/ringkasan/silent-meeting`,
  /** B06 Persetujuan awarding (BOD). */
  awardApproval: `${MAIN_WAM_PATH}/ringkasan/awarding`,
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
  /** PUT: suka; DELETE: batal suka. */
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
  /** GET: BOD's Ringkasan (at most 4 rows). */
  summary: `${MAIN_WAM_API}/ringkasan`,

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
  /** GET: the anonymous recap (BOD, from 5 feedbacks). */
  silentRecap: `${MAIN_WAM_API}/silent-meeting/rekap`,
  /** GET: categories, nominees, my votes (and for BOD the counts). */
  awards: `${MAIN_WAM_API}/awarding`,
  /** PUT {nomineeId}: my vote in one category (changeable until it closes). */
  vote: (categoryId: string) => `${MAIN_WAM_API}/awarding/${enc(categoryId)}/suara`,
  /** POST {nomineeId}: a BOD approves the winner. */
  approveAward: (categoryId: string) => `${MAIN_WAM_API}/awarding/${enc(categoryId)}/setujui`,
};

/** Admin WAM → Main WAM: Pengaturan (fondasi), Isi acara (E), Modul acara (D). */
const MAIN_WAM_ADMIN = `${WAM_ADMIN}/main`;
export const mainWamAdminPath = {
  /** Mode acara, penguji, modul on/off, tema (fondasi). */
  settings: `${MAIN_WAM_ADMIN}/pengaturan`,
  /* E · isi acara */
  rundown: `${MAIN_WAM_ADMIN}/rundown`,
  groups: `${MAIN_WAM_ADMIN}/kelompok`,
  /** Kelompok, tab Kelompok kegiatan (pos, angkot, meja). */
  activityGroups: `${MAIN_WAM_ADMIN}/kelompok?tab=kegiatan`,
  rooms: `${MAIN_WAM_ADMIN}/kamar`,
  travel: `${MAIN_WAM_ADMIN}/perjalanan`,
  guides: `${MAIN_WAM_ADMIN}/panduan`,
  /** Hotel, alamat, check-in/out, kontak panitia, tagihan hotel (Jejak karbon). */
  eventInfo: `${MAIN_WAM_ADMIN}/info-acara`,
  /* D · modul acara */
  awards: `${MAIN_WAM_ADMIN}/awarding`,
  silent: `${MAIN_WAM_ADMIN}/silent-meeting`,
};
const MAIN_WAM_ADMIN_API = "/api/admin/wam/main";
export const mainWamAdminApi = {
  /* fondasi */
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
  silentQuestions: `${MAIN_WAM_ADMIN_API}/silent-meeting`,
  silentQuestion: (id: string) => `${MAIN_WAM_ADMIN_API}/silent-meeting/${enc(id)}`,
};

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
  /** Hadiah (18 Nov 2026): my saldo, the rewards, my claims. */
  rewards: `${WELLBEING_API}/rewards`,
  /** POST { rewardId, note }: ask for a reward. */
  claims: `${WELLBEING_API}/rewards/claims`,
  /** POST: cancel my claim while it waits. */
  claim: (id: string) => `${WELLBEING_API}/rewards/claims/${id}`,
};
