import { z } from "zod";
import type { Person } from "./appraisal";
import type { Session } from "./sessions";

/*
 * Notulen (MoM) per meeting (11 Nov 2026, migration 202611110002). A published meeting needs its
 * Minutes of Meeting once it is over when Admin WAM's rule or the session itself says so (12 Nov
 * 2026; by default every Forum and Rapat, not an Acara or a one-on-one). Anyone
 * who took part writes it in the app (whoever saves it is its notetaker). Since 12 Nov 2026 it
 * follows the paper form FRM.05.00.00.027, kept simple: its number, the chairperson, who came, the
 * agenda items (topic, discussion, decision; new topics marked), the follow-ups (task, PIC, due
 * date, Open/Done), the next meeting, the attendance list, and the meeting's photos. Panitia, BOD and the HOD/Lead of the
 * booker's department read it. Pure, so it is tested without a server.
 */

/**
 * A follow-up. 13 Nov 2026 (migration 202611130003): more than one PIC, `picIds` in order; `picId`
 * and `picName` are the first, as before (an app opened before the update sends only `picId`).
 */
export type MinuteAction = {
  id?: string; task: string; picId: string | null; picName?: string | null; dueDate: string | null; done: boolean;
  picIds?: string[]; picNames?: string[];
};
/** A follow-up's PICs: all of them, or the one of an older follow-up. */
export const actionPicIds = (action: Pick<MinuteAction, "picId" | "picIds">): string[] =>
  action.picIds?.length ? action.picIds : action.picId ? [action.picId] : [];
export const MINUTE_PICS_MAX = 10;
/**
 * An agenda item, as on the paper form FRM.05.00.00.027 (12 Nov 2026): its topic, what was
 * discussed (the key points), and what was decided. `added` marks a new topic, outside the agenda.
 */
export type MinuteItem = { topic: string; discussion: string; decision: string; added: boolean };
/** The next meeting, all optional: day (YYYY-MM-DD), time (HH:MM), place, draft agenda. */
export type NextMeeting = { date: string | null; time: string | null; place: string; agenda: string };
/** Someone in the meeting, for Kehadiran and the PDF's attendance list (Data karyawan). */
/**
 * `frmPosition`: the person's position on form FRM.05.00.00.027 (Head of Department, Staff…), "" when
 * unknown. `checkInMethod`: how their check-in was made (qr, offline, online: by themselves; manual:
 * marked by panitia or by the MoM), null without one.
 */
export type MinuteAttendee = { id: string; name: string; fullName: string; department: string; position: string; frmPosition: string; checkedIn: boolean; checkInMethod: string | null };
/** Checked in by themselves (QR, Saya hadir): the MoM cannot mark them absent. */
export const selfCheckedIn = (person: Pick<MinuteAttendee, "checkInMethod">) => !!person.checkInMethod && person.checkInMethod !== "manual";
/** A photo of the meeting: its address in WAM (opens the full photo) and who added it. */
export type MinutePhoto = { id: string; url: string; width: number | null; height: number | null; uploadedBy: string | null; canDelete: boolean };

export type Minutes = {
  /**
   * Before the FRM form (migration 202611120005) a MoM was one summary and one list of decisions;
   * they are kept, and read as one agenda item (`minutesItems`). A MoM saved after it leaves them empty.
   */
  summary: string; decisions: string; actions: MinuteAction[];
  /** "MoM/2026/11/0012", given on the first save; null before migration 202611120005. */
  number: string | null;
  /**
   * Nomor surat MoM (13 Nov 2026, migration 202611130001): typed by the notetaker, taken from the
   * register in SharePoint (MOM_NUMBER_REGISTER). When given, it is the MoM's number everywhere
   * (PDF, Telegram, Arsip MoM); null until typed (then `number` stands).
   */
  docNumber: string | null;
  items: MinuteItem[];
  chairId: string | null; chairName: string | null;
  /** Who of the people in the meeting did not come; everyone else came. */
  absentIds: string[];
  /** Others who came and are not on the list. */
  guests: string;
  next: NextMeeting | null;
  submittedBy: string | null; submittedAt: string; updatedBy: string | null; updatedAt: string;
  /**
   * Kirim MoM (12 Nov 2026, migration 202611120004): null while a draft; the version counts the
   * saves since it was sent (1 when sent). telegramOff keeps it out of Telegram.
   */
  sentAt: string | null; sentBy: string | null; version: number; telegramOff: boolean;
  /**
   * The Telegram groups the notetaker picked (13 Nov 2026, migration 202611130003), as chat ids;
   * null: the groups of the participants' departments, picked by WAM.
   */
  telegramChats?: string[] | null;
};
/** Where a sent MoM went in Telegram, per group, and where it would go (for the writer). */
export type MinutesTelegram = {
  /** The bot is set up and the groups' migration has run; else why not, in a sentence. */
  ready: boolean; reason: string | null;
  /** The groups a send reaches now (only for whoever may write it). */
  destinations: string[];
  /** The same groups with their invite address, to open and join (13 Nov 2026). */
  links?: { title: string; url: string | null }[];
  /**
   * Every group a MoM may go to, for the notetaker to pick (13 Nov 2026): its name, address, and
   * whether WAM would pick it (a participant's department); the picked ones first.
   */
  groups?: { chatId: string; title: string; url: string | null; suggested: boolean }[];
  deliveries: { title: string; status: "terkirim" | "gagal"; error: string | null; version: number; at: string | null }[];
};
/** What Detail sesi gets: the MoM (or none yet), whether the viewer may write it, and who may be a PIC. */
export type MinutesView = {
  migrated: boolean; needed: boolean; status: MinutesStatus; minutes: Minutes | null;
  canWrite: boolean; people: Pick<Person, "id" | "name">[];
  /** Who is looking: a follow-up's PIC may tick it done. */
  viewerId: string;
  /** Whether the MoM can be written now: from the meeting's start to 24 hours after its end. */
  open: boolean;
  /**
   * 13 Nov 2026: until when it can be written or revised (ISO), and whether that time is past for
   * someone who could have written it (the MoM then shows, its buttons off).
   */
  deadline?: string | null;
  closed?: boolean;
  /** When the meeting ends (ISO), to warn before sending a MoM of a meeting still running. */
  endsAt: string | null;
  /** The meeting as section I of the FRM form shows it: title, start (ISO) and room or place. */
  title: string;
  startsAt: string | null;
  place: string;
  /** Drafts and Kirim MoM exist (migration 202611120004); before it a save is the MoM itself. */
  drafts: boolean;
  telegram: MinutesTelegram;
  /** The FRM form (chair, attendance, agenda items, next meeting, photos) is there: migration 202611120005. */
  frm: boolean;
  /** The people in the meeting with their department, position and check-in. */
  attendees: MinuteAttendee[];
  /** Who chairs it unless changed: the one who booked it, when in it. */
  defaultChairId: string | null;
  photos: MinutePhoto[];
  /** Photos can be added: the FRM migration has run and storage is set up. */
  photosReady: boolean;
  /**
   * The MoM uploaded as a file (13 Nov 2026), null when none; with one, the form is not needed: the
   * file is the MoM. `fileReady`: a file can be uploaded (migration 202611130004, storage set up).
   */
  file?: import("./minutes-file").MinuteFile | null;
  fileReady?: boolean;
  /** Photos are kept Full HD, 1 MB (migration 202611120006); before it 1280 px, 400 KB. */
  photoHd: boolean;
  /** Everyone in Data karyawan, for "Others present" (only for whoever may write the MoM). */
  staff?: { id: string; name: string; fullName: string; department: string }[];
};

export type MinutesStatus = "tidak-perlu" | "belum-waktunya" | "belum" | "draf" | "sudah";
export const minutesStatusLabels: Record<MinutesStatus, string> = {
  "tidak-perlu": "MoM tidak wajib", "belum-waktunya": "MoM setelah meeting", belum: "MoM belum diisi", draf: "MoM masih draf", sudah: "MoM sudah dikirim",
};

type Meeting = Pick<Session, "status" | "kind" | "startsAt" | "endsAt" | "participantCount" | "minutesRequired">;

/** A one-on-one: the booker and one other, or fewer. */
export const isOneOnOne = (meeting: Pick<Session, "participantCount">) => meeting.participantCount <= 2;

/**
 * Which meetings need a MoM unless a session says otherwise (12 Nov 2026, Admin WAM → Acara →
 * Notulen, migration 202611120001): per kind, and whether a one-on-one (two people or fewer) does
 * too. The default is the rule of 11 Nov: Forum and Rapat yes, Acara and one-on-ones no.
 */
/** The yes/no parts of the rule: which meetings need a MoM. */
export type MinutesNeedKey = "forum" | "rapat" | "acara" | "berdua";
/**
 * Admin WAM's MoM rule. `windowHours` (13 Nov 2026): how long after a meeting ends its MoM can be
 * written or revised, in hours; null: always open.
 */
export type MinutesRule = Record<MinutesNeedKey, boolean> & { windowHours: number | null };
/** The window Admin WAM may set: 1 hour to 30 days. */
export const MINUTES_WINDOW_MAX_HOURS = 720;
export const DEFAULT_MINUTES_RULE: MinutesRule = { forum: true, rapat: true, acara: false, berdua: false, windowHours: 24 };
export const minutesRuleSchema = z.object({
  forum: z.boolean(), rapat: z.boolean(), acara: z.boolean(), berdua: z.boolean(),
  windowHours: z.number().int("Isi jam dengan angka bulat.").min(1, "Paling sebentar 1 jam.").max(MINUTES_WINDOW_MAX_HOURS, `Paling lama ${MINUTES_WINDOW_MAX_HOURS} jam (30 hari).`).nullable().default(24),
});
export const minutesRuleLabels: Record<MinutesNeedKey, string> = { forum: "Forum", rapat: "Rapat (termasuk booking ruang)", acara: "Acara", berdua: "Meeting berdua (one-on-one)" };
/** A stored rule read safely: anything missing or not a yes/no keeps the default; the window a whole number in range, or null (always open). */
export const asMinutesRule = (value: unknown): MinutesRule => {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const pick = (key: MinutesNeedKey) => (typeof raw[key] === "boolean" ? raw[key] as boolean : DEFAULT_MINUTES_RULE[key]);
  const hours = raw.windowHours;
  const windowHours = hours === null ? null
    : typeof hours === "number" && Number.isInteger(hours) && hours >= 1 && hours <= MINUTES_WINDOW_MAX_HOURS ? hours : DEFAULT_MINUTES_RULE.windowHours;
  return { forum: pick("forum"), rapat: pick("rapat"), acara: pick("acara"), berdua: pick("berdua"), windowHours };
};
/** "24 jam", "3 hari", "36 jam": the window in words. */
export const windowLabel = (hours: number) => hours >= 48 && hours % 24 === 0 ? `${hours / 24} hari` : `${hours} jam`;

/** One session's own choice (pw_sessions.minutes_required): follow the rule, or always, or never. */
export const minutesChoices = ["ikut", "wajib", "tidak"] as const;
export type MinutesChoice = (typeof minutesChoices)[number];
export const choiceOf = (stored: boolean | null | undefined): MinutesChoice => stored === true ? "wajib" : stored === false ? "tidak" : "ikut";
export const storedOf = (choice: MinutesChoice): boolean | null => choice === "wajib" ? true : choice === "tidak" ? false : null;

/** What the rule alone says for a meeting of this kind and size. */
export const ruleNeeds = (meeting: Pick<Session, "kind" | "participantCount">, rule: Pick<MinutesRule, MinutesNeedKey> = DEFAULT_MINUTES_RULE) =>
  rule[meeting.kind] && (rule.berdua || !isOneOnOne(meeting));

/**
 * Needs a MoM: published, with hours, and required by its own choice or, when it follows the
 * rule, by the rule. `minutesRequired` is the answer already worked out when the session was read
 * (sessions.ts); without it the rule given here decides.
 */
export function needsMinutes(meeting: Meeting, rule: Pick<MinutesRule, MinutesNeedKey> = DEFAULT_MINUTES_RULE): boolean {
  if (meeting.status !== "terbit" || !meeting.startsAt || !meeting.endsAt) return false;
  return typeof meeting.minutesRequired === "boolean" ? meeting.minutesRequired : ruleNeeds(meeting, rule);
}

/**
 * How long after the meeting a MoM can still be written or revised (13 Nov 2026): by default 1 x 24
 * hours from its end; Admin WAM sets it (MinutesRule.windowHours), or leaves it always open. After
 * it the MoM stays readable, and its follow-ups can still be ticked done.
 */
export const MINUTES_WINDOW_HOURS = 24;
/** Until when a meeting's MoM can be written or revised (ISO); null without a start, or always open (`hours` null). */
export function minutesDeadline(meeting: Pick<Session, "startsAt" | "endsAt">, hours: number | null = MINUTES_WINDOW_HOURS): string | null {
  const from = meeting.endsAt ?? meeting.startsAt;
  return from && hours !== null ? new Date(new Date(from).getTime() + hours * 3_600_000).toISOString() : null;
}
/** The meeting has started (notes are taken while it runs). */
export const minutesStarted = (meeting: Pick<Session, "status" | "startsAt">, now: Date) =>
  meeting.status === "terbit" && !!meeting.startsAt && new Date(meeting.startsAt) <= now;
/** The window after the meeting is over: the MoM is closed to writing. */
export const minutesClosed = (meeting: Pick<Session, "status" | "startsAt" | "endsAt">, now: Date, hours: number | null = MINUTES_WINDOW_HOURS) => {
  const deadline = minutesDeadline(meeting, hours);
  return minutesStarted(meeting, now) && !!deadline && new Date(deadline) < now;
};
/** May be written or revised: from the meeting's start to the end of the window after it. */
export const minutesOpen = (meeting: Pick<Session, "status" | "startsAt" | "endsAt">, now: Date, hours: number | null = MINUTES_WINDOW_HOURS) =>
  minutesStarted(meeting, now) && !minutesClosed(meeting, now, hours);
/** The refusal once the window is past, in its own length. */
export const closedText = (hours: number | null) => `Batas mengisi atau merevisi MoM sudah lewat (${hours ? windowLabel(hours) : "-"} setelah meeting selesai).`;

/**
 * Where a meeting's MoM stands: only one that is over and needs one can be "belum". A MoM saved but
 * not sent yet is a draft, and does not count as in (12 Nov 2026).
 */
export function minutesStatus(meeting: Meeting, has: boolean, now: Date, sent = true): MinutesStatus {
  if (has) return sent ? "sudah" : "draf";
  if (!needsMinutes(meeting)) return "tidak-perlu";
  return new Date(meeting.endsAt!) <= now ? "belum" : "belum-waktunya";
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const minutesLimits = { text: 4000, task: 300, actions: 30, items: 20, topic: 200, decision: 2000, guests: 500, place: 200, agenda: 2000 } as const;
const itemSchema = z.object({
  topic: z.string().trim().min(2, "Isi topiknya.").max(minutesLimits.topic, `Topik paling banyak ${minutesLimits.topic} karakter.`),
  discussion: z.string().trim().max(minutesLimits.text, `Pembahasan paling banyak ${minutesLimits.text} karakter.`).default(""),
  decision: z.string().trim().max(minutesLimits.decision, `Keputusan paling banyak ${minutesLimits.decision} karakter.`).default(""),
  added: z.boolean().default(false),
}).refine(item => item.discussion.length >= 2 || item.decision.length >= 2, { path: ["discussion"], message: "Isi pembahasan atau keputusan untuk topik ini." });
/** The register the nomor surat MoM is taken from (SharePoint, baslibrary); employees know how. */
export const MOM_NUMBER_REGISTER = "https://werkudara.sharepoint.com/:x:/s/baslibrary/IQApFMkQx9PdRJ6hLrfSSC26AVjVrvcwEPLi042Kavz-wis?e=mizovl";
export const MOM_DOC_NUMBER_MAX = 60;

export const minutesInputSchema = z.object({
  /** Nomor surat MoM as typed (13 Nov 2026); empty = none yet. */
  docNumber: z.string().trim().max(MOM_DOC_NUMBER_MAX, `Nomor surat paling panjang ${MOM_DOC_NUMBER_MAX} karakter.`).optional(),
  /** The agenda items (FRM form, 12 Nov 2026). */
  items: z.array(itemSchema).max(minutesLimits.items, `Paling banyak ${minutesLimits.items} topik.`).default([]),
  /** Before the FRM form: one summary and the decisions. Still taken, from an app opened before the update. */
  summary: z.string().trim().max(minutesLimits.text, `Ringkasan paling banyak ${minutesLimits.text} karakter.`).default(""),
  decisions: z.string().trim().max(minutesLimits.text, `Keputusan paling banyak ${minutesLimits.text} karakter.`).default(""),
  chairId: z.uuid("Pilih pimpinan rapat dari daftar.").nullable().default(null),
  absentIds: z.array(z.uuid()).max(300).default([]),
  guests: z.string().trim().max(minutesLimits.guests, `Tamu paling banyak ${minutesLimits.guests} karakter.`).default(""),
  next: z.object({
    date: z.string().regex(DATE, "Tanggal meeting berikutnya tidak valid.").nullable().default(null),
    time: z.string().regex(TIME, "Jam meeting berikutnya tidak valid.").nullable().default(null),
    place: z.string().trim().max(minutesLimits.place, `Tempat paling banyak ${minutesLimits.place} karakter.`).default(""),
    agenda: z.string().trim().max(minutesLimits.agenda, `Rancangan agenda paling banyak ${minutesLimits.agenda} karakter.`).default(""),
  }).default({ date: null, time: null, place: "", agenda: "" }),
  actions: z.array(z.object({
    /** A follow-up kept from before (its done and who ticked it stay). */
    id: z.uuid().optional(),
    task: z.string().trim().min(2, "Isi tugasnya.").max(minutesLimits.task, `Tugas paling banyak ${minutesLimits.task} karakter.`),
    picId: z.uuid("Pilih PIC dari daftar.").nullable().default(null),
    picIds: z.array(z.uuid("Pilih PIC dari daftar.")).max(MINUTE_PICS_MAX, `Paling banyak ${MINUTE_PICS_MAX} PIC per tindak lanjut.`).default([]),
    dueDate: z.string().regex(DATE, "Tanggal tidak valid.").nullable().default(null),
    done: z.boolean().default(false),
  })).max(minutesLimits.actions, `Paling banyak ${minutesLimits.actions} tindak lanjut.`).default([]),
  /** Kirim MoM: true sends it (a draft stays a draft without it); once sent, every save is a new version. */
  send: z.boolean().default(false),
  /** Keep this MoM out of Telegram (a sensitive meeting). */
  telegramOff: z.boolean().default(false),
  /** The groups picked (chat ids); left out by an app opened before the update: kept as it was. */
  telegramChats: z.array(z.string().regex(/^-?\d{1,20}$/, "Grup Telegram tidak dikenali.")).max(40).optional(),
});
export type MinutesInput = z.infer<typeof minutesInputSchema>;
/** The form says something: a topic, or (an app from before the FRM form) a summary or decisions. */
export const minutesFilled = (input: Pick<MinutesInput, "items" | "summary" | "decisions">) => input.items.length > 0 || input.summary.length >= 2 || input.decisions.length >= 2;
export const MINUTES_EMPTY = "Isi minimal satu topik dengan pembahasan atau keputusannya, atau unggah berkas MoM.";

/** The agenda items of a MoM: its own, or (a MoM from before the FRM form) its summary and decisions as one. */
export function minutesItems(minutes: Pick<Minutes, "items" | "summary" | "decisions">): MinuteItem[] {
  if (minutes.items.length) return minutes.items;
  if (!minutes.summary.trim() && !minutes.decisions.trim()) return [];
  return [{ topic: "Pembahasan", discussion: minutes.summary.trim(), decision: minutes.decisions.trim(), added: false }];
}

/** "MoM/2026/11/0012": the number in the month of the meeting (YYYY-MM-DD). */
export const minutesNumber = (number: number, date: string) => `MoM/${date.slice(0, 4)}/${date.slice(5, 7)}/${String(number).padStart(4, "0")}`;

/** What a MoM saved before the FRM form can hold of the agenda items: one summary and the decisions. */
export function itemsAsText(items: readonly MinuteItem[]): { summary: string; decisions: string } {
  const label = (item: MinuteItem) => `${item.topic}${item.added ? " (topik baru)" : ""}`;
  const one = items.length === 1 && !items[0].added;
  const summary = one ? items[0].discussion || items[0].topic
    : items.map((item, index) => [`${index + 1}. ${label(item)}`, item.discussion].filter(Boolean).join("\n")).join("\n\n");
  const decisions = items.filter(item => item.decision).map(item => one ? item.decision : `${label(item)}: ${item.decision}`).join("\n");
  return { summary: summary.slice(0, minutesLimits.text), decisions: decisions.slice(0, minutesLimits.text) };
}

/** Who came and who did not, of the people in the meeting. */
export function presence<T extends { id: string }>(attendees: readonly T[], absentIds: readonly string[]): { present: T[]; absent: T[] } {
  const away = new Set(absentIds);
  return { present: attendees.filter(person => !away.has(person.id)), absent: attendees.filter(person => away.has(person.id)) };
}

/**
 * Who is marked absent in a new MoM: those without a check-in, once anyone checked in (a meeting
 * nobody checked in to did not use check-in, so everyone counts as present).
 */
export const defaultAbsent = (attendees: readonly MinuteAttendee[]) =>
  attendees.some(person => person.checkedIn) ? attendees.filter(person => !person.checkedIn).map(person => person.id) : [];

/** Follow-ups still open, the late ones first. */
export function openActions(actions: readonly MinuteAction[], today: string): (MinuteAction & { late: boolean })[] {
  return actions.filter(action => !action.done)
    .map(action => ({ ...action, late: !!action.dueDate && action.dueDate < today }))
    .sort((a, b) => Number(b.late) - Number(a.late) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
}

/** The MoM's API (11 Nov 2026): GET the view, PUT a new version; PATCH a follow-up's done. */
export const minutesApi = {
  session: (sessionId: string) => `/api/wam/sessions/${sessionId}/minutes`,
  /** GET: the MoM as a PDF, for whoever may read it (12 Nov 2026). */
  pdf: (sessionId: string) => `/api/wam/sessions/${sessionId}/minutes/pdf`,
  action: (sessionId: string, actionId: string) => `/api/wam/sessions/${sessionId}/minutes/actions/${actionId}`,
  /** POST: agree a photo's upload; POST confirm: keep it (12 Nov 2026). */
  photos: (sessionId: string) => `/api/wam/sessions/${sessionId}/minutes/photos`,
  photosConfirm: (sessionId: string) => `/api/wam/sessions/${sessionId}/minutes/photos/confirm`,
  /** GET: the photo itself; DELETE: removes it. */
  photo: (sessionId: string, photoId: string) => `/api/wam/sessions/${sessionId}/minutes/photos/${photoId}`,
  /** The MoM as a file (13 Nov 2026): POST agrees its upload, GET downloads it, DELETE removes it; POST confirm keeps it. */
  file: (sessionId: string) => `/api/wam/sessions/${sessionId}/minutes/file`,
  fileConfirm: (sessionId: string) => `/api/wam/sessions/${sessionId}/minutes/file/confirm`,
};
