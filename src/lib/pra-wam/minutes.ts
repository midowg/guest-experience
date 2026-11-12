import { z } from "zod";
import type { Person } from "./appraisal";
import type { Session } from "./sessions";

/*
 * Notulen (MoM) per meeting (11 Nov 2026, migration 202611110002). A published meeting needs its
 * Minutes of Meeting once it is over when Admin WAM's rule or the session itself says so (12 Nov
 * 2026; by default every Forum and Rapat, not an Acara or a one-on-one). Anyone
 * who took part writes it in the app (whoever saves it is its notetaker): a summary, the
 * decisions, and the follow-ups (task, PIC, due date). Panitia, BOD and the HOD/Lead of the
 * booker's department read it. Pure, so it is tested without a server.
 */

export type MinuteAction = {
  id?: string; task: string; picId: string | null; picName?: string | null; dueDate: string | null; done: boolean;
};
export type Minutes = {
  summary: string; decisions: string; actions: MinuteAction[];
  submittedBy: string | null; submittedAt: string; updatedBy: string | null; updatedAt: string;
};
/** What Detail sesi gets: the MoM (or none yet), whether the viewer may write it, and who may be a PIC. */
export type MinutesView = {
  migrated: boolean; needed: boolean; status: MinutesStatus; minutes: Minutes | null;
  canWrite: boolean; people: Pick<Person, "id" | "name">[];
  /** Who is looking: a follow-up's PIC may tick it done. */
  viewerId: string;
  /** Whether the meeting has started (the MoM can be written from then). */
  open: boolean;
};

export type MinutesStatus = "tidak-perlu" | "belum-waktunya" | "belum" | "sudah";
export const minutesStatusLabels: Record<MinutesStatus, string> = {
  "tidak-perlu": "MoM tidak wajib", "belum-waktunya": "MoM setelah meeting", belum: "MoM belum diisi", sudah: "MoM sudah diisi",
};

type Meeting = Pick<Session, "status" | "kind" | "startsAt" | "endsAt" | "participantCount" | "minutesRequired">;

/** A one-on-one: the booker and one other, or fewer. */
export const isOneOnOne = (meeting: Pick<Session, "participantCount">) => meeting.participantCount <= 2;

/**
 * Which meetings need a MoM unless a session says otherwise (12 Nov 2026, Admin WAM → Acara →
 * Notulen, migration 202611120001): per kind, and whether a one-on-one (two people or fewer) does
 * too. The default is the rule of 11 Nov: Forum and Rapat yes, Acara and one-on-ones no.
 */
export type MinutesRule = { forum: boolean; rapat: boolean; acara: boolean; berdua: boolean };
export const DEFAULT_MINUTES_RULE: MinutesRule = { forum: true, rapat: true, acara: false, berdua: false };
export const minutesRuleSchema = z.object({ forum: z.boolean(), rapat: z.boolean(), acara: z.boolean(), berdua: z.boolean() });
export const minutesRuleLabels: Record<keyof MinutesRule, string> = { forum: "Forum", rapat: "Rapat (termasuk booking ruang)", acara: "Acara", berdua: "Meeting berdua (one-on-one)" };
/** A stored rule read safely: anything missing or not a yes/no keeps the default. */
export const asMinutesRule = (value: unknown): MinutesRule => {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const pick = (key: keyof MinutesRule) => (typeof raw[key] === "boolean" ? raw[key] as boolean : DEFAULT_MINUTES_RULE[key]);
  return { forum: pick("forum"), rapat: pick("rapat"), acara: pick("acara"), berdua: pick("berdua") };
};

/** One session's own choice (pw_sessions.minutes_required): follow the rule, or always, or never. */
export const minutesChoices = ["ikut", "wajib", "tidak"] as const;
export type MinutesChoice = (typeof minutesChoices)[number];
export const choiceOf = (stored: boolean | null | undefined): MinutesChoice => stored === true ? "wajib" : stored === false ? "tidak" : "ikut";
export const storedOf = (choice: MinutesChoice): boolean | null => choice === "wajib" ? true : choice === "tidak" ? false : null;

/** What the rule alone says for a meeting of this kind and size. */
export const ruleNeeds = (meeting: Pick<Session, "kind" | "participantCount">, rule: MinutesRule = DEFAULT_MINUTES_RULE) =>
  rule[meeting.kind] && (rule.berdua || !isOneOnOne(meeting));

/**
 * Needs a MoM: published, with hours, and required by its own choice or, when it follows the
 * rule, by the rule. `minutesRequired` is the answer already worked out when the session was read
 * (sessions.ts); without it the rule given here decides.
 */
export function needsMinutes(meeting: Meeting, rule: MinutesRule = DEFAULT_MINUTES_RULE): boolean {
  if (meeting.status !== "terbit" || !meeting.startsAt || !meeting.endsAt) return false;
  return typeof meeting.minutesRequired === "boolean" ? meeting.minutesRequired : ruleNeeds(meeting, rule);
}

/** May be written once the meeting has started (notes are taken while it runs). */
export const minutesOpen = (meeting: Pick<Session, "status" | "startsAt">, now: Date) =>
  meeting.status === "terbit" && !!meeting.startsAt && new Date(meeting.startsAt) <= now;

/** Where a meeting's MoM stands: only one that is over and needs one can be "belum". */
export function minutesStatus(meeting: Meeting, has: boolean, now: Date): MinutesStatus {
  if (has) return "sudah";
  if (!needsMinutes(meeting)) return "tidak-perlu";
  return new Date(meeting.endsAt!) <= now ? "belum" : "belum-waktunya";
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const minutesLimits = { text: 4000, task: 300, actions: 30 } as const;
export const minutesInputSchema = z.object({
  summary: z.string().trim().max(minutesLimits.text, `Ringkasan paling banyak ${minutesLimits.text} karakter.`).default(""),
  decisions: z.string().trim().max(minutesLimits.text, `Keputusan paling banyak ${minutesLimits.text} karakter.`).default(""),
  actions: z.array(z.object({
    task: z.string().trim().min(2, "Isi tugasnya.").max(minutesLimits.task, `Tugas paling banyak ${minutesLimits.task} karakter.`),
    picId: z.uuid("Pilih PIC dari daftar.").nullable().default(null),
    dueDate: z.string().regex(DATE, "Tanggal tidak valid.").nullable().default(null),
    done: z.boolean().default(false),
  })).max(minutesLimits.actions, `Paling banyak ${minutesLimits.actions} tindak lanjut.`).default([]),
}).refine(input => input.summary.length >= 2 || input.decisions.length >= 2, { path: ["summary"], message: "Isi ringkasan atau keputusan meeting." });
export type MinutesInput = z.infer<typeof minutesInputSchema>;

/** Follow-ups still open, the late ones first. */
export function openActions(actions: readonly MinuteAction[], today: string): (MinuteAction & { late: boolean })[] {
  return actions.filter(action => !action.done)
    .map(action => ({ ...action, late: !!action.dueDate && action.dueDate < today }))
    .sort((a, b) => Number(b.late) - Number(a.late) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
}

/** The MoM's API (11 Nov 2026): GET the view, PUT a new version; PATCH a follow-up's done. */
export const minutesApi = {
  session: (sessionId: string) => `/api/wam/sessions/${sessionId}/minutes`,
  action: (sessionId: string, actionId: string) => `/api/wam/sessions/${sessionId}/minutes/actions/${actionId}`,
};
