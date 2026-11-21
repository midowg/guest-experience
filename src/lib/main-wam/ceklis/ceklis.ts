import { z } from "zod";
import { isPrepDate, wibDate } from "../rundown";
import type { MainWamEventInfo, MwSession } from "../types";

/*
 * Ceklis persiapan (agen S1; migration 202611250001): an agenda may carry a checklist ("Persiapan
 * berangkat": jaket, perlengkapan ibadah, ...), each item a text, a short note and an optional photo.
 * A participant ticks the items one by one, or "Setuju semua". Per agenda the admin may also switch on
 * "Wajib lengkap sebelum absen": until every item is ticked, the participant cannot check in (absen) at
 * a LATER session; without it the checklist is only a reminder. The module `ceklis` (off by default)
 * hides all of it. Pure: the server, the admin page and the screens share these.
 */

export const CHECKLIST_MIGRATION = "202611250001_main_wam_persiapan.sql";
export const CHECKLIST_MAX_ITEMS = 30;
export const CHECKLIST_TEXT_MAX = 120;
export const CHECKLIST_NOTE_MAX = 300;

/** An item's photo: a private storage key (never sent to participants) and a version for the browser's cache. */
export type ChecklistPhoto = { key: string; mime: string; size: number; version: string };
export type ChecklistItem = { id: string; sessionId: string; text: string; note: string; photo: ChecklistPhoto | null; sort: number };
/** What a session has: its items in order, and whether it gates absen (the flag lives on mw_sessions.checklist_required). */
export type SessionChecklist = { required: boolean; items: ChecklistItem[] };

/** An item as a participant reads it: no storage key, with whether this person ticked it. */
export type ChecklistItemView = { id: string; text: string; note: string; photoVersion: string | null; checked: boolean };

export type ChecklistProgress = { done: number; total: number; complete: boolean };

/** How many of the items are ticked ("2 dari 5"); an agenda without items is never "complete" (nothing to finish). */
export function checklistProgress(items: readonly Pick<ChecklistItem, "id">[], checked: ReadonlySet<string>): ChecklistProgress {
  const done = items.filter(item => checked.has(item.id)).length;
  return { done, total: items.length, complete: items.length > 0 && done === items.length };
}

/** Whether a session's checklist stops absen at later sessions: switched on, and there is something to tick. */
export const gatesAbsen = (checklist: Pick<SessionChecklist, "required" | "items"> | undefined | null): boolean => !!checklist && checklist.required && checklist.items.length > 0;

/** The checklist that keeps a person from checking in at a session. */
export type CeklisBlock = { sessionId: string; title: string; done: number; total: number };

type Gatable = Pick<MwSession, "id" | "title" | "status" | "startsAt">;

/**
 * The checklist that stops this person's absen at `target`, or null. A checklist stops the absen of
 * every session that starts AFTER its own agenda ("lengkap sebelum absen di agenda berikutnya"), never
 * its own, while it is on (required) and not finished. Only published agendas count (a draft or a
 * cancelled one asks nothing). The earliest unfinished one is named, so the link goes where to start.
 */
export function ceklisBlock(
  target: Pick<MwSession, "id" | "startsAt" | "usesAttendance">,
  sessions: readonly Gatable[],
  lists: ReadonlyMap<string, SessionChecklist>,
  checked: ReadonlySet<string>,
): CeklisBlock | null {
  if (!target.usesAttendance) return null;
  const start = Date.parse(target.startsAt);
  const blocking = sessions
    .filter(session => session.id !== target.id && session.status === "terbit" && Date.parse(session.startsAt) < start && gatesAbsen(lists.get(session.id)))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  for (const session of blocking) {
    const progress = checklistProgress(lists.get(session.id)!.items, checked);
    if (!progress.complete) return { sessionId: session.id, title: session.title, done: progress.done, total: progress.total };
  }
  return null;
}

/* ── Photos ───────────────────────────────────────────────────────────────────────────────────── */

export const CHECKLIST_PHOTO_TYPES = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" } as const;
export type ChecklistPhotoMime = keyof typeof CHECKLIST_PHOTO_TYPES;
/** 5 MB, the migration's limit: the admin's browser shrinks a photo before sending, so it is rarely near this. */
export const CHECKLIST_PHOTO_BYTES = 5 * 1024 * 1024;
export const checklistPhotoKey = (id: string, mime: ChecklistPhotoMime) => `main-wam/ceklis/${id}.${CHECKLIST_PHOTO_TYPES[mime]}`;
export const isChecklistPhotoKey = (key: string) => /^main-wam\/ceklis\/[0-9a-f-]{36}\.(webp|jpg|png)$/.test(key);

/* ── What the admin sends ─────────────────────────────────────────────────────────────────────── */

const photoRef = z.object({
  key: z.string().refine(isChecklistPhotoKey, "Foto tidak dikenali. Unggah ulang fotonya."),
  mime: z.enum(Object.keys(CHECKLIST_PHOTO_TYPES) as [ChecklistPhotoMime, ...ChecklistPhotoMime[]], { message: "Pilih gambar WebP, JPG, atau PNG." }),
  size: z.number().int().min(1).max(CHECKLIST_PHOTO_BYTES, "Foto lebih dari 5 MB."),
});
export type ChecklistPhotoRef = z.infer<typeof photoRef>;

export const checklistItemInputSchema = z.object({
  /** The item's own id when it already exists (its ticks are kept); a new one has none. */
  id: z.uuid().optional(),
  text: z.string().trim().min(1, "Tulis isi item.").max(CHECKLIST_TEXT_MAX, `Isi item paling panjang ${CHECKLIST_TEXT_MAX} karakter.`),
  note: z.string().trim().max(CHECKLIST_NOTE_MAX, `Keterangan paling panjang ${CHECKLIST_NOTE_MAX} karakter.`),
  photo: photoRef.nullable(),
});
export type ChecklistItemInput = z.infer<typeof checklistItemInputSchema>;

/** PUT a session's checklist: every item in order (the list replaces the old one), and the gate switch. */
export const checklistInputSchema = z.object({
  required: z.boolean(),
  items: z.array(checklistItemInputSchema).max(CHECKLIST_MAX_ITEMS, `Paling banyak ${CHECKLIST_MAX_ITEMS} item.`),
}).superRefine((value, ctx) => {
  if (value.required && value.items.length === 0) ctx.addIssue({ code: "custom", path: ["required"], message: "Tambah minimal satu item sebelum ceklis diwajibkan." });
  const ids = value.items.map(item => item.id).filter((id): id is string => !!id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["items"], message: "Ada item yang tertulis dua kali." });
});
export type ChecklistInput = z.infer<typeof checklistInputSchema>;

/** The photo upload: a fresh key and a token, then a confirm (like the guides' files). */
export const checklistPhotoStartSchema = z.object({
  mime: z.enum(Object.keys(CHECKLIST_PHOTO_TYPES) as [ChecklistPhotoMime, ...ChecklistPhotoMime[]], { message: "Pilih gambar WebP, JPG, atau PNG." }),
  size: z.number().int().min(1, "Berkas kosong.").max(CHECKLIST_PHOTO_BYTES, "Foto lebih dari 5 MB."),
});
export type ChecklistPhotoStart = z.infer<typeof checklistPhotoStartSchema>;
export const checklistPhotoConfirmSchema = checklistPhotoStartSchema.extend({
  key: z.string().min(1).max(200),
  token: z.string().regex(/^\d{10,13}\.[0-9a-f]{64}$/, "Unggahan tidak dikenali. Ulangi dari awal."),
});

/** What a participant sends: one item ticked or not, or all of them ("Setuju semua"). */
export const checklistTickSchema = z.union([
  z.object({ itemId: z.uuid({ message: "Item tidak dikenali." }), checked: z.boolean() }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);
export type ChecklistTick = z.infer<typeof checklistTickSchema>;

/** The photo's cache-busting version: its row's last change as a number. */
export const photoVersion = (updatedAt: unknown): string => {
  const at = typeof updatedAt === "string" ? Date.parse(updatedAt) : NaN;
  return Number.isFinite(at) ? String(at) : "1";
};

/** What the first chip of an agenda row says: "2/5", from a progress. */
export const progressText = (progress: Pick<ChecklistProgress, "done" | "total">) => `${progress.done}/${progress.total}`;

/**
 * What participants see of the rundown: with module Ceklis off, the Persiapan agendas (dated before the
 * first day) are left out, like everything else the module adds ("modul mati tidak meninggalkan jejak").
 */
export function visibleSessions<T extends Pick<MwSession, "startsAt">>(sessions: readonly T[], event: Pick<MainWamEventInfo, "startDate">, ceklisOn: boolean): T[] {
  return ceklisOn ? [...sessions] : sessions.filter(session => !isPrepDate(wibDate(session.startsAt), event));
}
