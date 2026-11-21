import type { AttendanceRequest, ClockMethod, DailyFlag, DailyKind, DailyStatus, FaceStatus, ReasonKind, RequestStatus, RequestType } from "./attendance";
import type { LeaveStatus, LeaveType } from "./leave";
import type { LivenessStep } from "./liveness";
import type { HrTab } from "./tabs";
import type { Theme } from "./theme";
import { hhmm, type Lang } from "./lang";
import { englishOf } from "./server-words";

/*
 * Every word WG People shows its employees (21 Nov 2026), in English (the default) and Bahasa
 * Indonesia, so the two always have the same things to say (Copy is English's shape; Indonesian must
 * fill all of it). Admin HR keeps its own Indonesian labels in attendance.ts and leave.ts. What the
 * server answers comes in Indonesian and is put into English here (server-words.ts) when English is on.
 */

type Summary = Pick<AttendanceRequest, "type" | "kind" | "proposedTime" | "reasonKind" | "reasonText">;
type Story = { title: string; line: string };

const en = {
  lang: "en" as Lang,
  /** The server's Indonesian answer, in this language. */
  server: (text: string) => englishOf(text),
  common: {
    back: "Back", close: "Close", cancel: "Cancel", done: "Done", send: "Send", sending: "Sending…", tryAgain: "Try again",
    closeMessage: "Close message", loading: "Loading", today: "Today", optional: "(optional)", you: "you", hrAdmin: "HR admin",
    days: (n: number) => `${n} ${n === 1 ? "day" : "days"}`,
    people: (n: number) => `${n} ${n === 1 ? "person" : "people"}`,
    loadingApp: "Loading WG People",
  },
  tabs: { beranda: "Home", riwayat: "History", tim: "Team", pengajuan: "Requests", profil: "Profile" } satisfies Record<HrTab, string>,
  menu: "Main menu",
  /** In and out as slot names and short labels. */
  kind: { masuk: "In", pulang: "Out" } satisfies Record<DailyKind, string>,
  /** The action, and the title of its sheet. */
  clockIn: { masuk: "Clock in", pulang: "Clock out" } satisfies Record<DailyKind, string>,
  /** A record of it, in a sentence. */
  clockNoun: { masuk: "clock-in", pulang: "clock-out" } satisfies Record<DailyKind, string>,
  status: { sah: "Verified", perlu_cek: "Needs review", ditolak: "Rejected" } satisfies Record<DailyStatus, string>,
  requestStatus: { menunggu: "Pending", disetujui: "Approved", ditolak: "Rejected", dibatalkan: "Cancelled" } satisfies Record<RequestStatus | LeaveStatus, string>,
  requestType: { tambah: "Forgot to clock", ubah_jam: "Wrong time", ubah_alasan: "Wrong reason or place", batal: "Remove the record" } satisfies Record<RequestType, string>,
  reason: { event: "Event / venue", dinas: "Business trip", wfh: "WFH", lainnya: "Other" } satisfies Record<ReasonKind, string>,
  method: { gerakan: "Face + movement", foto: "Quick photo" } satisfies Record<ClockMethod, string>,
  faceStatus: {
    impor: "Imported, not processed yet", siap: "Ready, needs your consent", aktif: "Active",
    menunggu: "Awaiting HR approval", ditolak: "Needs re-registering",
  } satisfies Record<FaceStatus, string>,
  flags: {
    di_luar_area: "Outside the office area", gps_tidak_akurat: "Location not accurate", tanpa_titik_kantor: "No office point yet",
    skor_rendah: "Low face match", wajah_belum_disetujui: "Face not yet approved by HR",
    lokasi_melompat: "Location jumped since the last record", belum_absen_masuk: "Clocked out without clocking in",
  } satisfies Record<DailyFlag, string>,
  leave: { cuti: "Leave", sakit: "Sick", izin: "Permission", dinas: "Business trip" } satisfies Record<LeaveType, string>,
  leaveShort: { cuti: "Leave", sakit: "Sick", izin: "Permission", dinas: "Trip" } satisfies Record<LeaveType, string>,
  leaveTitle: { cuti: "Request leave", sakit: "Report sick", izin: "Ask permission", dinas: "Log a business trip" } satisfies Record<LeaveType, string>,
  leaveHint: {
    cuti: "Annual leave, or other leave already agreed.",
    sakit: "Hand a doctor's note to HR if you have one.",
    izin: "Personal matters, half a day or more.",
    dinas: "Work out of town or at a client's site.",
  } satisfies Record<LeaveType, string>,
  leavePlaceholder: { cuti: "E.g. family visit back home", sakit: "E.g. fever, resting at home", izin: "E.g. family matters", dinas: "E.g. client visit in Surabaya" } satisfies Record<LeaveType, string>,
  liveness: { kedip: "Blink", toleh_kiri: "Turn your head left", toleh_kanan: "Turn your head right", senyum: "Smile" } satisfies Record<LivenessStep, string>,
  theme: { terang: "Light", gelap: "Dark" } satisfies Record<Theme, string>,
  consent: [
    "For attendance, WG People uses your face (a reference photo and a selfie at each clock-in) and your phone's location when you clock in.",
    "Your face is matched on your own phone; the server keeps only the face's numbers (for nothing else) and the reference photo.",
    "Each clock-in selfie is kept as proof. HR deletes selfies older than 90 days. Only HR can see them.",
    "Your first reference photo comes from your GreatDay HR base photo; you can replace it by registering again.",
    "You can withdraw your consent any time in WG People → Profile → Face data. Your face data is deleted, and HR records your attendance by hand.",
  ],

  /** "Friday 20 November", "Fri 20 Nov". */
  dateLong: { weekday: "long", day: "numeric", month: "long" } as Intl.DateTimeFormatOptions,
  dateShort: { weekday: "long", day: "numeric", month: "short" } as Intl.DateTimeFormatOptions,
  dayLabels: ["06:00", "14:00", "22:00"] as [string, string, string],

  /** What a correction asks, in one line: "In 08:30 (forgot to clock)". */
  requestSummary(request: Summary): string {
    const kind = en.kind[request.kind];
    const at = request.proposedTime ? hhmm("en", request.proposedTime.slice(0, 5)) : "";
    switch (request.type) {
      case "tambah": return `${kind} ${at} (forgot to clock)`;
      case "ubah_jam": return `${kind} changed to ${at}`;
      case "ubah_alasan": return `${kind}: ${request.reasonKind ? en.reason[request.reasonKind] : ""}${request.reasonText ? ` · ${request.reasonText}` : ""}`;
      case "batal": return `Remove the ${en.clockNoun[request.kind]}`;
    }
  },
  /** "Leave · 24–26 Nov (3 days)". */
  leaveSummary: (type: LeaveType, span: string, days: number) => `${en.leave[type]} · ${span} (${en.common.days(days)})`,

  greeting(hour: number): string {
    return hour < 4 ? "Good evening" : hour < 11 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  },

  /** Beranda (21 Nov 2026, "status sentence"): the day said in one sentence; odd parts are the times, set strong. */
  home: {
    closed: "Daily attendance isn't open yet", closedLine: "HR is setting it up.",
    card: "Today's attendance", today: "Today",
    notYet: ["You haven't clocked in yet."] as string[],
    working: (since: string, time: string) => ["In since ", since, ", ", time, " so far."],
    overtime: (since: string, time: string) => ["In since ", since, ", ", time, " so far. Time to head home?"],
    finished: (total: string, from: string, to: string) => ["Done for today: ", total, ", from ", from, " to ", to, "."],
    onlyOut: (at: string) => ["Clocked out at ", at, "."],
    complete: "Today's attendance is complete", firstTime: "First time? Register your face once.",
    empty: "Not yet", forgotIn: "Forgot to clock in? Clock out now",
    attention: "Needs attention",
    forgotOut: (day: string) => `${day}: no clock-out`, forgotOutLine: "Request a correction so your clock-out time is recorded.",
    refused: (kind: string, day: string) => `${kind} on ${day} rejected`, refusedLine: "See why, then request a correction if needed.",
    week: "This week",
    hours: (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h` : `${minutes}m`),
    weekWord: { lengkap: "complete", sebagian: "incomplete", kosong: "no records", cek: "", belum: "not yet" },
    legend: { lengkap: "complete", sebagian: "incomplete", cek: "needs review" },
    awayChip: (type: string, approved: boolean) => `${type} today · ${approved ? "approved" : "pending"}`,
  },

  history: {
    title: "History", lead: (usual: string | null) => `Last 31 days${usual ? ` · usually in at ${usual}` : ""}`,
    filter: "Filter history", all: "All", check: "To review", outside: "Outside", unit: "days",
    empty: "No records yet", emptyLine: "Your first clock-in will show up here.",
    none: "Nothing here", noneLine: "No days match this filter.",
    notYet: "not yet", todayPrefix: "Today · ", pending: "Correction pending", noOut: "No clock-out",
    srDay: (day: string) => `${day}, in `, srOut: ", out ",
  },

  requests: {
    title: "Requests", new: "New", partLabel: "Request status", waiting: "Pending", finished: "Finished",
    correction: "Correction",
    emptyWaiting: "Nothing pending", emptyWaitingLine: "Need leave, a business trip, or a fix to your attendance? Tap New.",
    emptyFinished: "Nothing finished yet", emptyFinishedLine: "Requests HR has decided show up here.",
    pick: "Request what?", revision: "Attendance correction", revisionSub: "Forgot to clock, wrong time, wrong reason or place.",
  },

  profile: {
    account: (face: string) => `WAM account · face ${face}`, noFace: "not registered",
    attendance: "Attendance", face: "Face data", settings: "Settings", look: "Theme", language: "Language",
    zone: "Time zone", zoneSub: "Follows your phone", help: "Help & FAQ", helpSub: "Clocking in, office points, corrections, leave, face data",
    signOut: "Sign out",
  },

  day: {
    correction: "Correction", worked: (time: string) => `${time} worked`,
    time: "Time", place: "Location", how: "Method", match: "Face match", status: "Status", note: "HR's note",
    fromOffice: (distance: string) => `${distance} from the office point`,
    manual: "Recorded by HR", face: "Face", none: (kind: string) => `No ${kind}`, forgot: "Forgot? Tap Correction above.",
    requests: "Corrections",
  },

  decided: {
    sent: "Sent", journey: "Request progress",
    approved: "Approved", approvedBy: (who: string) => `By ${who}.`, applied: "The change is applied to your attendance.",
    onCalendar: "It's on the team calendar.",
    rejected: "Rejected", cancelled: "Cancelled", youCancelled: "You withdrew it.",
    waiting: "Waiting for HR", waitingLine: "The result shows up here.", waitingTeam: "The team sees it on the calendar as pending.",
    yourReason: "Your reason", yourNote: "Your note", noteNote: "Only you and HR read it.", hrNote: "HR's note",
    withdraw: "Withdraw request", approvedLater: "Plans changed? Ask HR to cancel it; the dates then leave the team calendar.",
  },

  face: {
    title: "Face data",
    story: {
      aktif: { title: "Active", line: "Your face is ready. Each clock-in only needs the front camera." },
      menunggu: { title: "Waiting for HR", line: "Your face is registered. Until it's approved, your clock-ins are recorded as Needs review." },
      siap: { title: "Just agree", line: "Your reference photo from HR is ready. Agree to its use at your first clock-in." },
      impor: { title: "Being prepared", line: "HR is preparing your reference photo. Meanwhile you can register your face yourself." },
      ditolak: { title: "Register again", line: "Your reference photo can't be used. Register your face once more, about a minute." },
      kosong: { title: "Not registered", line: "HR has no reference photo for you yet. Register your face once, about a minute." },
    } satisfies Record<FaceStatus | "kosong", Story>,
    fromHr: "Reference photo from HR", own: "Registered by you in WG People",
    register: "Register face",
    how: "How it works",
    steps: (moving: boolean) => [
      `When you clock in, the front camera takes a selfie${moving ? " while you blink or turn your head" : ""}.`,
      "Your phone turns your face into numbers; the server matches them with your reference photo.",
      "A match inside an office point: your clock-in is Verified.",
    ],
    kept: "What is kept", keptNote: "Only you and HR can see it. It's used for attendance only.",
    reference: "Reference photo", referenceKeep: "Until you delete it", selfies: "Selfie at each clock-in", selfiesKeep: "90 days",
    location: "Location at clock-in", locationKeep: "With the record",
    rights: "Your rights", rightsNote: "After deleting, HR records your attendance by hand until you register again.",
    delete: "Delete face data",
  },

  help: {
    title: "Help & FAQ", lead: "Short answers to what people ask most. Tap a question.",
    method: (moving: boolean): string => (moving ? "a selfie while you blink or turn your head as shown" : "one selfie, matched straight away"),
    how: "How do I clock in?",
    howA: (method: string) => ["On Home tap ", "Clock in", " or ", "Clock out", `. WG People reads your location, then opens the front camera for ${method}. It takes a few seconds.`],
    offices: "Where are the office points?", officesLead: "Clock-ins inside these circles are Verified:",
    map: "(map, new tab)", radius: (metres: number) => `radius ${metres} m`,
    noOffices: "HR hasn't set any office points yet. Until then, every clock-in counts as outside the office.",
    outside: "I'm clocking in outside the office (event, business trip, WFH)",
    outsideA: "You still can. Pick the reason when you clock in; it shows Needs review until HR checks it.",
    fix: "I forgot to clock, or the time is wrong",
    fixA: ["Open ", "Requests → New → Attendance correction", ", pick the day (up to 31 days back) and write why. HR decides."],
    leave: "Requesting leave, sick days, permission or a business trip",
    leaveA: ["Open ", "Requests → New", " and pick the type and dates. The team sees the type and dates in ", "Team", "; your note is for HR only."],
    statuses: "What Verified, Needs review and Rejected mean",
    statusesA: ["", "Verified", ": face matched inside an office point. ", "Needs review", ": something for HR to look at (outside the office, low match). ", "Rejected", ": HR rejected it; request a correction if that's wrong."],
    why: "Why am I asked to register my face?",
    whyA: "Your account has no reference photo from HR yet, or it can't be used. Register once, about a minute; HR approves it.",
    camera: "The camera or location won't open",
    cameraA: "Allow Camera and Location for this site in your browser settings, turn on GPS, then try again. On iPhone, use Safari.",
    more: "Still confused?", moreA: "Contact HR at the office. Give the date and time of the record so it's checked quickly.",
  },

  team: {
    title: "Team", lead: "Who's on leave, sick, on permission or a business trip.",
    before: (month: string) => `Previous month, ${month}`, after: (month: string) => `Next month, ${month}`,
    view: "View", calendar: "Calendar", list: "List",
    failed: "Couldn't load", closed: "Leave isn't open yet", closedLine: "HR is setting it up.",
    calendarOf: (month: string) => `Calendar ${month}`,
    nobody: "Nobody is on leave, sick, on permission or a business trip.",
    srDay: (day: string, count: number, types: string) => `${day}: ${count ? `${en.common.people(count)}, ${types}` : "nobody away"}`,
    ring: "ring = pending",
    allIn: "Everyone's in", allInLine: (month: string) => `No leave, sick days, permission or business trips in ${month}.`,
    now: "Today", coming: "Coming up", past: "Past",
    todayMark: " · today", week: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  },

  leaveForm: {
    type: "Request type", start: "From", end: "To",
    endBefore: "The end date can't be before the start date.", longest: (n: number) => ` At most ${n} days.`,
    clash: (type: string, span: string, waiting: boolean) => `These dates overlap your other request (${type} ${span}). ${waiting ? "Withdraw the old one in Requests first if you want to change it." : "Only HR can cancel an approved one; contact HR if your plans change."}`,
    note: "Note", noteHint: "At least 3 letters. Only you and HR read it; the team only sees the type and dates.",
  },

  revision: {
    title: "Request a correction", date: "Date", today: " · today", which: "Which record",
    none: "none yet", blocked: (kind: string) => `There's already a pending correction for this ${kind}. Withdraw it in Requests first if you want to change it.`,
    what: "What needs fixing?", forgot: (kind: string) => `Forgot to ${kind.toLowerCase()}`,
    rightTime: (zone: string) => `Correct time (${zone})`, rightReason: "Correct reason",
    note: (other: boolean) => `Note${other ? "" : " (optional)"}`, notePlaceholder: "E.g. venue or client name",
    remove: "This record is deleted if HR approves.",
    why: "Why does it need a correction?", whyPlaceholder: "E.g. my phone died when I arrived",
    whyHint: "At least 3 letters. HR checks and decides; the result shows in Requests.",
  },

  flow: {
    register: "Register face",
    noReference: "Your account has no reference photo from HR (not in the GreatDay data), so you register your face once here. HR will approve it.",
    unusable: "Your reference photo can't be used. Register your face once more.",
    preparing: "Getting ready…", sendingRecord: "Sending your record…", openingCamera: "Opening the camera…", saving: "Saving your face…",
    already: (title: string) => `${title} already recorded today`,
    reviewNote: (flags: string) => `HR will review this: ${flags}.`,
    enrolNote: "You can still clock in; records show \"Needs review\" until HR approves your face.",
    warm: { cek: "Recorded. HR will review it", masuk: "Recorded. Have a good day!", pulang: "Recorded. Get home safe!" },
    consentTitle: "Face data consent", agree: "I have read this and agree.",
    agreeRegister: "Agree and register my face", agreeContinue: "Agree and continue",
    disagree: "Don't agree? Tap Cancel. HR can still record your attendance by hand.",
    location: "Location", locationError: "Location not read", reading: "Reading your location…", readingLine: "One moment. Turn on GPS if it's off.",
    inside: (office: string) => `Inside the ${office} area`,
    inaccurate: "Location not accurate enough", noOffice: "No office point yet", outside: "Outside the office area",
    inaccurateLine: (accuracy: string, max: number) => `±${accuracy}, needs ±${max} m. Move near a window, then read again.`,
    noOfficeLine: "HR hasn't set an office point yet.", fromOffice: (distance: string, office: string) => `${distance} from ${office}`,
    where: "Where are you clocking in from?", note: (other: boolean) => `Note${other ? "" : " (optional)"}`, notePlaceholder: "E.g. venue or client name",
    outsideNote: "Clock-ins outside the area are still recorded, as Needs review until HR approves.",
    readAgain: "Read location again", toCamera: "Continue to camera",
    cameraLabel: (title: string) => `${title} · face`, once: "Just once. Follow the prompts under the camera.",
    slow: "Still waiting for an answer. Check your signal, or tap Cancel and try again.",
    failed: "Not done yet", receipt: (title: string) => `${title}, receipt`, continue: (title: string) => `Continue: ${title}`,
    notFound: "Request not found", notFound31: "It may be more than 31 days old.", notFound120: "It may be more than 120 days old.",
    signOut: "Sign out of WG People?", signOutLine: "Sign in again with your WAM account email and password.", signingOut: "Signing out…",
    deleteFace: "Delete face data?", deleteFaceLine: "Your reference face and all your clock-in selfies are deleted. HR records your attendance by hand until you register again.", delete: "Delete",
    withdraw: "Withdraw this request?", withdrawLeave: "HR won't review it, and the dates leave the team calendar.", withdrawLine: "HR won't review it.",
  },

  camera: {
    loading: "Getting the camera and face check ready…",
    steps: (now: number, total: number) => `Step ${now} of ${total}`,
    look: "Look straight at the camera", lookHold: "Look straight at the camera and hold still",
    again: "Good. Look straight at the camera again", hold: "Hold still…", checking: "Checking…", placed: "That's it. Hold still.",
    guide: {
      satu: "Make sure only you are in the camera", bingkai: "Bring your face into the frame", dekat: "Move your face closer",
      jauh: "Move your face back a little", tengah: "Center your face in the frame",
    },
    blurry: "The picture is blurry. Hold the phone still and find a brighter spot.",
    switched: "The face in the camera changed midway. Try again with your own face.",
    movement: "The movement wasn't read. Try again and follow the prompts.",
    photo: "The photo couldn't be saved. Try again.",
    noCamera: "This browser can't open the camera. Open the app in the latest Chrome or Safari.",
    timeout: "Time's up. Try again and follow the prompts.",
    engine: "The face check couldn't load. Check your internet, then try again.",
    denied: "Camera access was denied. Open the site settings in your browser, allow Camera, then try again.",
    notFound: "No camera found on this device.", busy: "The camera is in use by another app. Close it, then try again.",
    other: "The camera couldn't be opened.", orHr: "Or ask HR to record your attendance.",
    video: (enrol: boolean): string => (enrol ? "Front camera to register your face" : "Front camera to clock in"),
    foot: "Your face is matched on this phone. Find a bright spot; take off masks and sunglasses.",
  },

  place: {
    unsupported: "This browser can't read your location. Open WG People in the latest Chrome or Safari.",
    denied: "Location access was denied. Open the site settings in your browser, allow Location for WG People, then try again.",
    timeout: "Location not read yet. Turn on GPS, move near a window, then try again.",
    failed: "Location can't be read. Turn on GPS, then try again.",
  },

  meter: { label: "Face match", aria: (percent: number, at: number) => `Face match ${percent}%, match from ${at}%`, note: (at: number) => `Match from ${at}%` },

  auth: {
    now: "Now", foot: "Werkudara Group",
    hide: (label: string) => `Hide ${label.toLowerCase()}`, show: (label: string) => `Show ${label.toLowerCase()}`,
    loginHeadline: "Your workday starts here.", loginLead: "Clock in and out with just your face, from your own phone.",
    login: "Sign in", loginNote: "Use your office email and employee account password, the same as WAM.",
    email: "Office email", password: "Password", checking: "Checking…", forgot: "Forgot password?",
    sentHeadline: "Request sent.", sentLead: "An admin will reset your password to the first password.",
    sentTitle: "Now wait for the admin", sentBody: "If this email is registered, your password is reset to the first password. Then sign in with it and pick a new one.",
    backToLogin: "Back to sign in",
    forgotHeadline: "Forgot your password? No worries.", forgotLead: "Send a request to the admin; your password is reset to the first password.",
    forgotTitle: "Forgot password", noteForAdmin: "Note for the admin", sendRequest: "Send request",
    newHeadline: "One more step.", newLead: "Replace the first password with one of your own.",
    newTitle: "Create a new password", current: "First password", next: "New password", confirm: "Repeat new password",
    rules: "Password rules", met: " (met)", unmet: " (not yet)", save: "Save password", saving: "Saving…", skip: "Skip, set it later",
    rule: { length: "At least 8 characters", mixed: "Includes a number or symbol", differs: "Different from the first password", same: "Repeated exactly" } as Record<string, string>,
    language: "Language",
  },
};

export type Copy = typeof en;

const id: Copy = {
  lang: "id",
  server: (text: string) => text,
  common: {
    back: "Kembali", close: "Tutup", cancel: "Batal", done: "Selesai", send: "Kirim", sending: "Mengirim…", tryAgain: "Coba lagi",
    closeMessage: "Tutup pesan", loading: "Memuat", today: "Hari ini", optional: "(boleh kosong)", you: "kamu", hrAdmin: "Admin HR",
    days: (n: number) => `${n} hari`,
    people: (n: number) => `${n} orang`,
    loadingApp: "Memuat WG People",
  },
  tabs: { beranda: "Beranda", riwayat: "Riwayat", tim: "Tim", pengajuan: "Pengajuan", profil: "Profil" },
  menu: "Menu utama",
  kind: { masuk: "Masuk", pulang: "Pulang" },
  clockIn: { masuk: "Absen masuk", pulang: "Absen pulang" },
  clockNoun: { masuk: "absen masuk", pulang: "absen pulang" },
  status: { sah: "Sah", perlu_cek: "Perlu dicek", ditolak: "Ditolak" },
  requestStatus: { menunggu: "Menunggu", disetujui: "Disetujui", ditolak: "Ditolak", dibatalkan: "Dibatalkan" },
  requestType: { tambah: "Lupa absen", ubah_jam: "Jam salah", ubah_alasan: "Alasan atau lokasi salah", batal: "Batalkan absen" },
  reason: { event: "Event / venue", dinas: "Dinas luar", wfh: "WFH", lainnya: "Lainnya" },
  method: { gerakan: "Wajah + gerakan", foto: "Foto cepat" },
  faceStatus: {
    impor: "Foto impor, belum diproses", siap: "Siap, menunggu persetujuanmu", aktif: "Aktif",
    menunggu: "Menunggu persetujuan Admin HR", ditolak: "Perlu daftar ulang",
  },
  flags: {
    di_luar_area: "Di luar area kantor", gps_tidak_akurat: "Lokasi kurang akurat", tanpa_titik_kantor: "Belum ada titik kantor",
    skor_rendah: "Skor wajah rendah", wajah_belum_disetujui: "Wajah belum disetujui Admin HR",
    lokasi_melompat: "Lokasi melompat dari absen sebelumnya", belum_absen_masuk: "Pulang tanpa absen masuk",
  },
  leave: { cuti: "Cuti", sakit: "Sakit", izin: "Izin", dinas: "Dinas" },
  leaveShort: { cuti: "Cuti", sakit: "Sakit", izin: "Izin", dinas: "Dinas" },
  leaveTitle: { cuti: "Ajukan cuti", sakit: "Ajukan sakit", izin: "Ajukan izin", dinas: "Ajukan dinas" },
  leaveHint: {
    cuti: "Cuti tahunan atau cuti lain yang sudah dibicarakan.",
    sakit: "Surat dokter, bila ada, serahkan ke HR.",
    izin: "Keperluan pribadi, setengah hari atau lebih.",
    dinas: "Tugas kantor di luar kota atau di tempat klien.",
  },
  leavePlaceholder: { cuti: "Mis. pulang kampung", sakit: "Mis. demam, istirahat di rumah", izin: "Mis. urusan keluarga", dinas: "Mis. kunjungan klien di Surabaya" },
  liveness: { kedip: "Kedipkan mata", toleh_kiri: "Toleh ke kiri", toleh_kanan: "Toleh ke kanan", senyum: "Tersenyum" },
  theme: { terang: "Terang", gelap: "Gelap" },
  consent: [
    "Untuk absensi, WG People memakai wajahmu (foto acuan dan selfie setiap absen) dan lokasi HP-mu saat absen.",
    "Wajahmu dicocokkan di HP-mu sendiri; server hanya menyimpan angka ciri wajah (bukan untuk tujuan lain) dan foto acuan.",
    "Selfie setiap absen disimpan sebagai bukti. Admin HR menghapus selfie yang sudah lebih dari 90 hari. Hanya Admin HR yang bisa melihatnya.",
    "Foto acuan awal diambil dari foto dasar absen GreatDay HR; kamu bisa menggantinya dengan daftar ulang.",
    "Kamu bisa menarik persetujuan kapan saja di WG People → Profil → Data wajah. Data wajahmu dihapus, dan absenmu dicatat Admin HR secara manual.",
  ],

  dateLong: { weekday: "long", day: "numeric", month: "long" },
  dateShort: { weekday: "long", day: "numeric", month: "short" },
  dayLabels: ["06.00", "14.00", "22.00"],

  requestSummary(request: Summary): string {
    const kind = id.kind[request.kind];
    const at = request.proposedTime ? hhmm("id", request.proposedTime.slice(0, 5)) : "";
    switch (request.type) {
      case "tambah": return `${kind} ${at} (lupa absen)`;
      case "ubah_jam": return `${kind} jadi ${at}`;
      case "ubah_alasan": return `${kind}: ${request.reasonKind ? id.reason[request.reasonKind] : ""}${request.reasonText ? ` · ${request.reasonText}` : ""}`;
      case "batal": return `Hapus ${id.clockNoun[request.kind]}`;
    }
  },
  leaveSummary: (type: LeaveType, span: string, days: number) => `${id.leave[type]} · ${span} (${days} hari)`,

  greeting(hour: number): string {
    return hour < 4 ? "Malam" : hour < 11 ? "Pagi" : hour < 15 ? "Siang" : hour < 18 ? "Sore" : "Malam";
  },

  home: {
    closed: "Absen harian belum dibuka", closedLine: "Admin HR sedang menyiapkannya.",
    card: "Absen hari ini", today: "Hari ini",
    notYet: ["Kamu belum absen masuk hari ini."],
    working: (since: string, time: string) => ["Masuk sejak ", since, ", sudah ", time, "."],
    overtime: (since: string, time: string) => ["Masuk sejak ", since, ", sudah ", time, ". Waktunya pulang?"],
    finished: (total: string, from: string, to: string) => ["Selesai hari ini: ", total, ", dari ", from, " sampai ", to, "."],
    onlyOut: (at: string) => ["Absen pulang tercatat pukul ", at, "."],
    complete: "Absen hari ini lengkap", firstTime: "Pertama kali: daftar wajah dulu, sekali saja.",
    empty: "Belum", forgotIn: "Lupa absen masuk? Langsung absen pulang",
    attention: "Perlu perhatian",
    forgotOut: (day: string) => `${day} belum ada absen pulang`, forgotOutLine: "Ajukan revisi supaya jam pulangmu tercatat.",
    refused: (kind: string, day: string) => `${kind} ${day} ditolak`, refusedLine: "Lihat alasannya, lalu ajukan revisi bila perlu.",
    week: "Minggu ini",
    hours: (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}j` : `${minutes}m`),
    weekWord: { lengkap: "lengkap", sebagian: "belum lengkap", kosong: "tidak ada absen", cek: "", belum: "belum" },
    legend: { lengkap: "lengkap", sebagian: "belum lengkap", cek: "perlu dicek" },
    awayChip: (type: string, approved: boolean) => `${type} hari ini · ${approved ? "disetujui" : "menunggu"}`,
  },

  history: {
    title: "Riwayat", lead: (usual: string | null) => `31 hari terakhir${usual ? ` · biasanya masuk ${usual}` : ""}`,
    filter: "Saring riwayat", all: "Semua", check: "Perlu dicek", outside: "Di luar", unit: "hari",
    empty: "Belum ada absen", emptyLine: "Absen pertamamu akan muncul di sini.",
    none: "Tidak ada", noneLine: "Tidak ada hari yang cocok dengan saringan ini.",
    notYet: "belum", todayPrefix: "Hari ini · ", pending: "Revisi menunggu", noOut: "Belum pulang",
    srDay: (day: string) => `${day}, masuk `, srOut: ", pulang ",
  },

  requests: {
    title: "Pengajuan", new: "Ajukan", partLabel: "Status pengajuan", waiting: "Menunggu", finished: "Selesai",
    correction: "Revisi",
    emptyWaiting: "Tidak ada yang menunggu", emptyWaitingLine: "Mau cuti, izin, dinas, atau ada absen yang salah? Tekan Ajukan.",
    emptyFinished: "Belum ada yang selesai", emptyFinishedLine: "Pengajuan yang sudah diputuskan Admin HR muncul di sini.",
    pick: "Ajukan apa?", revision: "Revisi absen", revisionSub: "Lupa absen, jam salah, alasan atau lokasi salah.",
  },

  profile: {
    account: (face: string) => `Akun WAM · wajah ${face}`, noFace: "belum terdaftar",
    attendance: "Absen", face: "Data wajah", settings: "Pengaturan", look: "Tampilan", language: "Bahasa",
    zone: "Zona waktu", zoneSub: "Mengikuti HP-mu", help: "Bantuan & FAQ", helpSub: "Cara absen, titik kantor, revisi, cuti, data wajah",
    signOut: "Keluar",
  },

  day: {
    correction: "Revisi", worked: (time: string) => `${time} bekerja`,
    time: "Jam", place: "Lokasi", how: "Cara", match: "Kecocokan wajah", status: "Status", note: "Catatan Admin HR",
    fromOffice: (distance: string) => `${distance} dari titik kantor`,
    manual: "Dicatat Admin HR", face: "Wajah", none: (kind: string) => `Tidak ada ${kind}`, forgot: "Lupa? Tekan Revisi di atas.",
    requests: "Revisi",
  },

  decided: {
    sent: "Dikirim", journey: "Perjalanan pengajuan",
    approved: "Disetujui", approvedBy: (who: string) => `Oleh ${who}.`, applied: "Perubahan sudah diterapkan ke absenmu.",
    onCalendar: "Sudah masuk kalender tim.",
    rejected: "Ditolak", cancelled: "Dibatalkan", youCancelled: "Kamu membatalkannya.",
    waiting: "Menunggu Admin HR", waitingLine: "Hasilnya muncul di sini.", waitingTeam: "Tim sudah melihatnya di kalender sebagai menunggu.",
    yourReason: "Alasanmu", yourNote: "Keteranganmu", noteNote: "Hanya kamu dan Admin HR yang membacanya.", hrNote: "Catatan Admin HR",
    withdraw: "Batalkan pengajuan", approvedLater: "Rencana berubah? Minta Admin HR membatalkannya; tanggalnya lalu keluar dari kalender tim.",
  },

  face: {
    title: "Data wajah",
    story: {
      aktif: { title: "Aktif", line: "Wajahmu siap dipakai. Setiap absen cukup dengan kamera depan." },
      menunggu: { title: "Menunggu Admin HR", line: "Wajahmu sudah terdaftar. Sampai disetujui, absenmu tetap tercatat dengan status Perlu dicek." },
      siap: { title: "Tinggal setuju", line: "Foto acuan dari HR sudah siap. Setujui pemakaiannya di absen pertamamu." },
      impor: { title: "Sedang disiapkan", line: "Admin HR sedang menyiapkan foto acuanmu. Sementara ini kamu bisa daftar wajah sendiri." },
      ditolak: { title: "Perlu daftar ulang", line: "Foto acuanmu belum bisa dipakai. Daftarkan wajahmu sekali lagi, sekitar satu menit." },
      kosong: { title: "Belum terdaftar", line: "Belum ada foto acuan untukmu dari HR. Daftarkan wajahmu sekali, sekitar satu menit." },
    },
    fromHr: "Foto acuan dari HR", own: "Didaftarkan sendiri di WG People",
    register: "Daftar wajah",
    how: "Cara kerjanya",
    steps: (moving: boolean) => [
      `Saat absen, kamera depan mengambil selfie${moving ? " sambil kamu berkedip atau menoleh" : ""}.`,
      "HP-mu mengubah wajah jadi angka ciri; server mencocokkannya dengan foto acuanmu.",
      "Cocok dan kamu di dalam titik kantor: absen tercatat Sah.",
    ],
    kept: "Yang disimpan", keptNote: "Hanya kamu dan Admin HR yang bisa melihatnya. Tidak dipakai untuk hal lain selain absensi.",
    reference: "Foto acuan", referenceKeep: "Sampai kamu hapus", selfies: "Selfie tiap absen", selfiesKeep: "90 hari",
    location: "Lokasi saat absen", locationKeep: "Bersama absennya",
    rights: "Hakmu", rightsNote: "Setelah dihapus, absenmu dicatat Admin HR secara manual sampai kamu daftar wajah lagi.",
    delete: "Hapus data wajah",
  },

  help: {
    title: "Bantuan & FAQ", lead: "Jawaban singkat untuk yang paling sering ditanyakan. Ketuk pertanyaannya.",
    method: (moving: boolean) => (moving ? "selfie sambil berkedip atau menoleh sesuai petunjuk" : "satu selfie yang langsung dicocokkan"),
    how: "Bagaimana cara absen?",
    howA: (method: string) => ["Di Beranda tekan ", "Absen masuk", " atau ", "Absen pulang", `. WG People membaca lokasimu, lalu membuka kamera depan untuk ${method}. Selesai dalam beberapa detik.`],
    offices: "Di mana saja titik kantor?", officesLead: "Absen di dalam lingkaran ini tercatat Sah:",
    map: "(peta, tab baru)", radius: (metres: number) => `radius ${metres} m`,
    noOffices: "Admin HR belum memasang titik kantor. Sampai ada, semua absen tercatat di luar kantor.",
    outside: "Saya absen di luar kantor (event, dinas, WFH)",
    outsideA: "Absen tetap bisa. Pilih alasannya saat absen; statusnya Perlu dicek sampai Admin HR memeriksanya.",
    fix: "Lupa absen atau jamnya salah",
    fixA: ["Buka ", "Pengajuan → Ajukan → Revisi absen", ", pilih harinya (sampai 31 hari ke belakang), lalu tulis alasannya. Admin HR yang memutuskan."],
    leave: "Mengajukan cuti, sakit, izin, atau dinas",
    leaveA: ["Buka ", "Pengajuan → Ajukan", ", pilih jenis dan tanggalnya. Tim melihat jenis dan tanggalnya di menu ", "Tim", "; keteranganmu hanya untuk Admin HR."],
    statuses: "Arti Sah, Perlu dicek, dan Ditolak",
    statusesA: ["", "Sah", ": wajah cocok dan di dalam titik kantor. ", "Perlu dicek", ": ada yang perlu dilihat Admin HR (di luar kantor, kecocokan rendah). ", "Ditolak", ": Admin HR menolaknya; ajukan revisi bila keliru."],
    why: "Kenapa saya diminta daftar wajah?",
    whyA: "Akunmu belum punya foto acuan dari HR, atau fotonya belum bisa dipakai. Daftar sekali saja, sekitar satu menit; Admin HR menyetujuinya.",
    camera: "Kamera atau lokasi tidak mau terbuka",
    cameraA: "Izinkan Kamera dan Lokasi untuk situs ini di pengaturan browser, nyalakan GPS, lalu coba lagi. Di iPhone, pakai Safari.",
    more: "Masih ada yang membingungkan?", moreA: "Hubungi Admin HR di kantor. Sebutkan tanggal dan jam absennya supaya cepat dicek.",
  },

  team: {
    title: "Tim", lead: "Siapa yang cuti, sakit, izin, atau dinas.",
    before: (month: string) => `Bulan sebelumnya, ${month}`, after: (month: string) => `Bulan berikutnya, ${month}`,
    view: "Tampilan", calendar: "Kalender", list: "Daftar",
    failed: "Belum bisa dimuat", closed: "Cuti dan izin belum dibuka", closedLine: "Admin HR sedang menyiapkannya.",
    calendarOf: (month: string) => `Kalender ${month}`,
    nobody: "Tidak ada yang cuti, sakit, izin, atau dinas.",
    srDay: (day: string, count: number, types: string) => `${day}: ${count ? `${count} orang, ${types}` : "tidak ada yang cuti, sakit, izin, atau dinas"}`,
    ring: "cincin = menunggu",
    allIn: "Semua di kantor", allInLine: (month: string) => `Tidak ada cuti, sakit, izin, atau dinas di ${month}.`,
    now: "Hari ini", coming: "Akan datang", past: "Sudah lewat",
    todayMark: " · hari ini", week: ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"],
  },

  leaveForm: {
    type: "Jenis pengajuan", start: "Mulai", end: "Sampai",
    endBefore: "Tanggal selesai tidak boleh sebelum tanggal mulai.", longest: (n: number) => ` Paling lama ${n} hari.`,
    clash: (type: string, span: string, waiting: boolean) => `Tanggal ini bertemu dengan pengajuanmu yang lain (${type.toLowerCase()} ${span}). ${waiting ? "Batalkan yang lama dulu di Pengajuan bila ingin mengubahnya." : "Yang sudah disetujui hanya bisa dibatalkan Admin HR; hubungi HR bila rencanamu berubah."}`,
    note: "Keterangan", noteHint: "Minimal 3 huruf. Hanya kamu dan Admin HR yang membacanya; tim hanya melihat jenis dan tanggalnya.",
  },

  revision: {
    title: "Ajukan revisi", date: "Tanggal", today: " · hari ini", which: "Absen yang mana",
    none: "belum ada", blocked: (kind: string) => `Sudah ada revisi yang menunggu untuk ${kind} ini. Batalkan dulu di Pengajuan bila ingin mengubahnya.`,
    what: "Apa yang perlu diperbaiki?", forgot: (kind: string) => `Lupa ${kind.toLowerCase()}`,
    rightTime: (zone: string) => `Jam yang benar (${zone})`, rightReason: "Alasan yang benar",
    note: (other: boolean) => `Keterangan${other ? "" : " (boleh kosong)"}`, notePlaceholder: "Mis. nama venue atau klien",
    remove: "Absen ini akan dihapus bila Admin HR menyetujui.",
    why: "Kenapa perlu direvisi?", whyPlaceholder: "Mis. HP mati waktu datang",
    whyHint: "Minimal 3 huruf. Admin HR memeriksa dan memutuskan; hasilnya muncul di Pengajuan.",
  },

  flow: {
    register: "Daftar wajah",
    noReference: "Akunmu belum punya foto acuan dari HR (tidak ada di data GreatDay), jadi wajahmu didaftarkan sekali di sini. Admin HR akan menyetujuinya.",
    unusable: "Foto acuanmu belum bisa dipakai. Daftarkan wajahmu sekali lagi.",
    preparing: "Menyiapkan absen…", sendingRecord: "Mengirim absen…", openingCamera: "Menyiapkan kamera…", saving: "Menyimpan wajahmu…",
    already: (title: string) => `${title} hari ini sudah tercatat`,
    reviewNote: (flags: string) => `Perlu dicek Admin HR: ${flags}.`,
    enrolNote: "Absenmu tetap bisa dicatat; statusnya \"Perlu dicek\" sampai Admin HR menyetujui wajahmu.",
    warm: { cek: "Tercatat, Admin HR akan memeriksanya", masuk: "Tercatat. Selamat bekerja!", pulang: "Tercatat. Hati-hati di jalan!" },
    consentTitle: "Persetujuan data wajah", agree: "Saya sudah membaca dan setuju.",
    agreeRegister: "Setuju, daftarkan wajah", agreeContinue: "Setuju, lanjut absen",
    disagree: "Tidak setuju? Tekan Batal. Absenmu tetap bisa dicatat manual oleh Admin HR.",
    location: "Lokasi", locationError: "Lokasi belum terbaca", reading: "Membaca lokasi…", readingLine: "Tunggu sebentar. Nyalakan GPS bila belum.",
    inside: (office: string) => `Di dalam area ${office}`,
    inaccurate: "Lokasi kurang akurat", noOffice: "Belum ada titik kantor", outside: "Di luar area kantor",
    inaccurateLine: (accuracy: string, max: number) => `±${accuracy}, perlu ±${max} m. Dekati jendela, lalu baca ulang.`,
    noOfficeLine: "Admin HR belum mengatur titik kantor.", fromOffice: (distance: string, office: string) => `${distance} dari ${office}`,
    where: "Kamu absen dari mana?", note: (other: boolean) => `Keterangan${other ? "" : " (boleh kosong)"}`, notePlaceholder: "Mis. nama venue atau klien",
    outsideNote: "Absen di luar area tetap tercatat, dengan status Perlu dicek sampai Admin HR menyetujui.",
    readAgain: "Baca ulang lokasi", toCamera: "Lanjut ke kamera",
    cameraLabel: (title: string) => `${title} · wajah`, once: "Sekali saja. Ikuti petunjuk di bawah kamera.",
    slow: "Masih menunggu jawaban. Periksa sinyal, atau tekan Batal lalu coba lagi.",
    failed: "Belum berhasil", receipt: (title: string) => `${title}, bukti`, continue: (title: string) => `Lanjut ${title.toLowerCase()}`,
    notFound: "Pengajuan tidak ditemukan", notFound31: "Mungkin sudah lebih dari 31 hari.", notFound120: "Mungkin sudah lebih dari 120 hari.",
    signOut: "Keluar dari WG People?", signOutLine: "Masuk lagi dengan email dan password akun WAM-mu.", signingOut: "Keluar…",
    deleteFace: "Hapus data wajah?", deleteFaceLine: "Wajah acuan dan semua selfie absenmu dihapus. Absen berikutnya dicatat Admin HR secara manual sampai kamu daftar lagi.", delete: "Hapus",
    withdraw: "Batalkan pengajuan ini?", withdrawLeave: "Admin HR tidak akan memeriksanya lagi, dan tanggalnya hilang dari kalender tim.", withdrawLine: "Admin HR tidak akan memeriksanya lagi.",
  },

  camera: {
    loading: "Menyiapkan kamera dan pengenal wajah…",
    steps: (now: number, total: number) => `Langkah ${now} dari ${total}`,
    look: "Lihat lurus ke kamera", lookHold: "Lihat lurus ke kamera, tahan sebentar",
    again: "Bagus. Lihat lurus lagi ke kamera", hold: "Tahan sebentar…", checking: "Memeriksa…", placed: "Posisi pas. Tahan sebentar.",
    guide: {
      satu: "Pastikan hanya kamu yang terlihat di kamera", bingkai: "Arahkan wajahmu ke dalam bingkai", dekat: "Dekatkan wajah ke kamera",
      jauh: "Jauhkan sedikit wajahmu", tengah: "Posisikan wajah di tengah bingkai",
    },
    blurry: "Gambar buram. Tahan HP dan cari tempat yang lebih terang.",
    switched: "Wajah di kamera berganti di tengah jalan. Ulangi dengan wajahmu sendiri.",
    movement: "Gerakannya belum terbaca. Ulangi dan ikuti petunjuknya.",
    photo: "Foto belum bisa disimpan. Coba lagi.",
    noCamera: "Browser ini belum bisa membuka kamera. Buka aplikasi ini di Chrome atau Safari terbaru.",
    timeout: "Waktu habis. Ulangi dan ikuti petunjuknya.",
    engine: "Pengenal wajah belum bisa dimuat. Periksa internet, lalu coba lagi.",
    denied: "Akses kamera ditolak. Buka pengaturan situs di browser, izinkan Kamera, lalu coba lagi.",
    notFound: "Kamera tidak ditemukan di perangkat ini.", busy: "Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu, lalu coba lagi.",
    other: "Kamera tidak bisa dibuka.", orHr: "Atau minta Admin HR mencatat absenmu.",
    video: (enrol: boolean) => (enrol ? "Kamera depan untuk daftar wajah" : "Kamera depan untuk absen wajah"),
    foot: "Wajahmu dicocokkan di HP ini. Cari tempat terang, lepas masker dan kacamata hitam.",
  },

  place: {
    unsupported: "Browser ini tidak bisa membaca lokasi. Buka WG People di Chrome atau Safari terbaru.",
    denied: "Akses lokasi ditolak. Buka pengaturan situs di browser, izinkan Lokasi untuk WG People, lalu coba lagi.",
    timeout: "Lokasi belum terbaca. Nyalakan GPS, dekati jendela, lalu coba lagi.",
    failed: "Lokasi tidak bisa dibaca. Nyalakan GPS, lalu coba lagi.",
  },

  meter: { label: "Kecocokan wajah", aria: (percent: number, at: number) => `Kecocokan wajah ${percent}%, batas cocok ${at}%`, note: (at: number) => `Batas cocok ${at}%` },

  auth: {
    now: "Sekarang", foot: "Werkudara Group",
    hide: (label: string) => `Sembunyikan ${label.toLowerCase()}`, show: (label: string) => `Lihat ${label.toLowerCase()}`,
    loginHeadline: "Hari kerja dimulai di sini.", loginLead: "Absen masuk dan pulang cukup dengan wajahmu, dari HP sendiri.",
    login: "Masuk", loginNote: "Pakai email kantor dan password akun karyawanmu, sama dengan WAM.",
    email: "Email kantor", password: "Password", checking: "Memeriksa…", forgot: "Lupa password?",
    sentHeadline: "Permintaan terkirim.", sentLead: "Admin akan mengatur ulang password-mu ke password awal.",
    sentTitle: "Tinggal tunggu admin", sentBody: "Bila email ini terdaftar, password-mu diatur ulang ke password awal. Setelah itu masuk dengan password awal, lalu buat password baru.",
    backToLogin: "Kembali ke Masuk",
    forgotHeadline: "Lupa password? Tenang.", forgotLead: "Kirim permintaan ke admin; password-mu diatur ulang ke password awal.",
    forgotTitle: "Lupa password", noteForAdmin: "Catatan untuk admin", sendRequest: "Kirim permintaan",
    newHeadline: "Satu langkah lagi.", newLead: "Ganti password awal dengan password milikmu sendiri.",
    newTitle: "Buat password baru", current: "Password awal", next: "Password baru", confirm: "Ulangi password baru",
    rules: "Syarat password", met: " (terpenuhi)", unmet: " (belum)", save: "Simpan password", saving: "Menyimpan…", skip: "Lewati, atur nanti",
    rule: { length: "Minimal 8 karakter", mixed: "Ada angka atau simbol", differs: "Berbeda dari password awal", same: "Diulang sama persis" },
    language: "Bahasa",
  },
};

export const copies: Record<Lang, Copy> = { en, id };
