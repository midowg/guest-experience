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
 * event code: a fixed English address, its own sign-in per person, and its own tables (pw_*). The
 * super admin sets it up under /admin/super/wam. The code keeps the "praWam" names it started with.
 */
export const PRA_WAM_PATH = "/wam";
const WAM_API = "/api/wam";
export const praWamPath = {
  home: PRA_WAM_PATH,
  /** "Apa itu WAM?": the text the super admin writes, opened from Beranda. */
  about: `${PRA_WAM_PATH}/about`,
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
  documents: `${PRA_WAM_PATH}/documents`,
  notifications: `${PRA_WAM_PATH}/notifications`,
  /** Panitia and BOD: Ringkasan operasional. */
  dashboard: `${PRA_WAM_PATH}/manage`,
  /** BOD: everyone taking part, by department; read only. */
  people: `${PRA_WAM_PATH}/manage/people`,
  /** BOD: one participant's profile (Penpot B2), read only. */
  person: (id: string) => `${PRA_WAM_PATH}/manage/people/${id}`,
  /** BOD and panitia: survey results (Penpot B4); empty until surveys exist. */
  surveyResults: `${PRA_WAM_PATH}/manage/surveys`,
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
  /** Profile and settings: change password. */
  account: `${PRA_WAM_PATH}/account`,
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
};
export const praWamApi = {
  login: `${WAM_API}/login`,
  logout: `${WAM_API}/logout`,
  password: `${WAM_API}/password`,
  forgot: `${WAM_API}/forgot-password`,
  resetPassword: `${WAM_API}/reset-password`,
  sessions: (id?: string) => `${WAM_API}/sessions${id ? `/${id}` : ""}`,
  sessionStatus: (id: string) => `${WAM_API}/sessions/${id}/status`,
  /** GET: everything Detail sesi shows, for the sheet over Agenda and Beranda. */
  sessionDetail: (id: string) => `${WAM_API}/sessions/${id}/detail`,
  /** GET: the session's QR as an A5 PDF to print; POST: a new QR (the printed one stops working). */
  sessionQr: (id: string) => `${WAM_API}/sessions/${id}/qr`,
  /** GET: who is present; POST: panitia marks someone present or not. */
  sessionAttendance: (id: string) => `${WAM_API}/sessions/${id}/attendance`,
  /** What holds each room on a day (bookings and sessions), for picking a session's room. */
  roomUses: (date: string) => `${WAM_API}/rooms?date=${date}`,
  /** Documents: ask for an upload address, then register the uploaded file; one document by id. */
  documents: (id?: string) => `${WAM_API}/documents${id ? `/${id}` : ""}`,
  documentUpload: `${WAM_API}/documents/upload`,
  /** GET: the person's notifications; POST {id?}: mark one, or all, read. */
  notifications: `${WAM_API}/notifications`,
  /** GET: sent announcements with read counts; POST: send one (panitia). */
  announcements: `${WAM_API}/announcements`,
  /** DELETE: panitia removes one announcement. */
  announcement: (id: string) => `${WAM_API}/announcements/${id}`,
  /** POST: a participant asks to move a session. */
  requestChange: (sessionId: string) => `${WAM_API}/sessions/${sessionId}/reschedule`,
  /** One request: POST {approve, note} (panitia answers), DELETE (the asker withdraws). */
  request: (id: string) => `${WAM_API}/requests/${id}`,
  /** Appraisal bookings: the day's schedule, a new booking, or one booking by id. */
  bookings: (id?: string, query: Record<string, string> = {}) => {
    const search = new URLSearchParams(query).toString();
    return `${WAM_API}/appraisal${id ? `/${id}` : ""}${search ? `?${search}` : ""}`;
  },
};
export const PRA_WAM_ADMIN = "/admin/super/wam";
/** Super admin: the account list and creating accounts, or one person's roles and password reset. */
export const praWamAccountsApi = (employeeId?: string) => `/api/admin/wam/accounts${employeeId ? `/${employeeId}` : ""}`;
/** Super admin: PATCH one room's capacity, fewest people, bookable and floor plan spot. */
export const praWamRoomsApi = (roomId: string) => `/api/admin/wam/rooms/${roomId}`;
/** Super admin: import units and positions from the Data karyawan workbook. */
export const praWamUnitsApi = "/api/admin/wam/units";
/** Super admin: one event's status and modules. */
export const praWamEventsApi = (eventId: string) => `/api/admin/wam/events/${eventId}`;
/** Super admin: PUT saves the "Apa itu WAM?" text, DELETE goes back to the default text. */
export const praWamAboutApi = "/api/admin/wam/about";
/** Super admin: PUT the app settings, e.g. whether Book shows the floor plan. */
export const praWamSettingsApi = "/api/admin/wam/settings";
