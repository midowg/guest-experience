import { z } from "zod";

/*
 * Refleksi Leader (19 Nov 2026): the reflection Werkudara's leaders write before the Leadership
 * Reset training ("Comeback in Last Minute", Coach ARZ). No sign-in anywhere: a leader types their
 * name and team; the small CMS and the coach's reading page open by a secret link each. The rules
 * the form, the CMS and the server share live here, pure, so they are tested without a server.
 */

export const LR_MIGRATION = "202611250001_leadership_reset.sql";

export const TARGET_STATUSES = ["tercapai", "sebagian", "belum"] as const;
export type TargetStatus = (typeof TARGET_STATUSES)[number];
export const targetLabels: Record<TargetStatus, string> = { tercapai: "Sudah tercapai", sebagian: "Sebagian tercapai", belum: "Belum tercapai" };
export const targetHints: Record<TargetStatus, string> = {
  tercapai: "Target tim sudah tercapai atau terlampaui.",
  sebagian: "Sebagian target tercapai, sebagian lagi belum.",
  belum: "Target tim belum tercapai sampai sekarang.",
};

/** Who a question is for: everyone, or the leaders whose target is (partly) not / (partly) met. "Sebagian" gets both. */
export const AUDIENCES = ["semua", "belum", "tercapai"] as const;
export type Audience = (typeof AUDIENCES)[number];
export const audienceLabels: Record<Audience, string> = { semua: "Semua Leader", belum: "Target belum tercapai", tercapai: "Target sudah tercapai" };

export type LrQuestion = {
  id: string;
  label: string;
  /** A line under the question: how to answer it. */
  hint: string;
  /** Sentence starters a leader can tap to begin writing. */
  starters: string[];
  for: Audience;
  required: boolean;
  enabled: boolean;
};

export type LrContent = {
  title: string;
  tagline: string;
  coach: string;
  /** YYYY-MM-DD, WIB. */
  trainingDate: string | null;
  /** An instant (ISO with offset); after it the form takes no answers. */
  deadline: string | null;
  intro: string;
  privacy: string;
  statusQuestion: string;
  closing: string;
  questions: LrQuestion[];
};

export const DEFAULT_CONTENT: LrContent = {
  title: "Leadership Reset",
  tagline: "Comeback in Last Minute",
  coach: "Coach ARZ",
  trainingDate: null,
  deadline: null,
  intro: "Menjelang training, luangkan waktu sejenak untuk refleksi diri. Jawab dengan jujur dan terbuka berdasarkan pengalaman Anda sendiri. Jawaban ini akan menjadi bahan refleksi dan diskusi bersama Coach ARZ saat training berlangsung.",
  privacy: "Jawaban Anda hanya dibaca oleh Coach ARZ.",
  statusQuestion: "Bagaimana capaian target tim Anda saat ini?",
  closing: "Let's reflect, reset, and lead forward!",
  questions: [
    {
      id: "belum", for: "belum", required: true, enabled: true,
      label: "Hal apa dari cara saya memimpin yang paling berkontribusi terhadap target tim yang belum tercapai?",
      hint: "Fokus pada diri Anda, bukan pada faktor luar. Satu hal yang paling berpengaruh sudah cukup, lengkapi dengan contoh nyata.",
      starters: ["Saya cenderung…", "Yang belum saya lakukan adalah…", "Saat tim kesulitan, saya…"],
    },
    {
      id: "tercapai", for: "tercapai", required: true, enabled: true,
      label: "Hal apa dari kepemimpinan saya yang paling berperan dalam keberhasilan tim mencapai target?",
      hint: "Sebutkan kebiasaan atau keputusan Anda yang paling membuat perbedaan, beserta contohnya.",
      starters: ["Yang paling membantu tim adalah…", "Saya konsisten…", "Keputusan yang paling berdampak adalah…"],
    },
    {
      id: "langkah", for: "semua", required: false, enabled: false,
      label: "Satu hal apa yang akan saya ubah atau pertahankan mulai sekarang?",
      hint: "Tulis satu langkah kecil yang bisa langsung Anda mulai minggu ini.",
      starters: ["Mulai minggu ini saya akan…", "Saya akan berhenti…", "Saya akan terus…"],
    },
  ],
};

export const MAX_QUESTIONS = 8;
export const MAX_ANSWER = 4000;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak dikenali.");
const questionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/, "ID pertanyaan tidak valid."),
  label: z.string().trim().min(5, "Tulis pertanyaannya.").max(400, "Pertanyaan terlalu panjang (maks. 400 huruf)."),
  hint: z.string().trim().max(400, "Petunjuk terlalu panjang (maks. 400 huruf)."),
  starters: z.array(z.string().trim().min(1).max(80, "Pemicu kalimat maks. 80 huruf.")).max(5, "Maks. 5 pemicu kalimat."),
  for: z.enum(AUDIENCES),
  required: z.boolean(),
  enabled: z.boolean(),
});

export const contentSchema = z.object({
  title: z.string().trim().min(1, "Tulis judulnya.").max(80),
  tagline: z.string().trim().max(120),
  coach: z.string().trim().min(1, "Tulis nama coach.").max(60),
  trainingDate: day.nullable(),
  deadline: z.iso.datetime({ offset: true, message: "Tenggat tidak dikenali." }).nullable(),
  intro: z.string().trim().max(1200),
  privacy: z.string().trim().max(300),
  statusQuestion: z.string().trim().min(5, "Tulis pertanyaan capaian target.").max(200),
  closing: z.string().trim().max(200),
  questions: z.array(questionSchema).min(1).max(MAX_QUESTIONS, `Maks. ${MAX_QUESTIONS} pertanyaan.`),
}).superRefine((content, ctx) => {
  const ids = content.questions.map(question => question.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["questions"], message: "Ada dua pertanyaan dengan ID yang sama." });
  for (const status of ["tercapai", "belum"] as const) {
    if (!questionsFor(status, content.questions).length) {
      ctx.addIssue({ code: "custom", path: ["questions"], message: `Leader yang ${status === "belum" ? "targetnya belum tercapai" : "targetnya sudah tercapai"} belum mendapat pertanyaan aktif.` });
    }
  }
});

export const formSaveSchema = z.object({ content: contentSchema, isOpen: z.boolean() });
export type FormSave = z.infer<typeof formSaveSchema>;

/** What is stored, read with the defaults under it: a field that does not pass falls back to the default. */
export function normalizeContent(raw: unknown): LrContent {
  if (!raw || typeof raw !== "object") return DEFAULT_CONTENT;
  const merged = { ...DEFAULT_CONTENT, ...(raw as Partial<LrContent>) };
  const parsed = contentSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_CONTENT;
}

/** The questions a leader gets for their target, in order. "Sebagian" gets both kinds. */
export function questionsFor(status: TargetStatus, questions: readonly LrQuestion[]): LrQuestion[] {
  return questions.filter(question => question.enabled && (question.for === "semua" || status === "sebagian" || question.for === status));
}

/** A key a person holds (their own answer, the CMS, the coach): long and random, so it is never guessed. */
export const KEY_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
export const looksLikeKey = (value: unknown): value is string => typeof value === "string" && KEY_PATTERN.test(value);

export const answerInputSchema = z.object({
  key: z.string().regex(KEY_PATTERN, "Kunci jawaban tidak valid. Muat ulang halaman."),
  name: z.string().trim().min(2, "Tulis nama Anda.").max(120, "Nama terlalu panjang."),
  team: z.string().trim().min(2, "Tulis tim atau divisi Anda.").max(120, "Nama tim terlalu panjang."),
  targetStatus: z.enum(TARGET_STATUSES, { message: "Pilih capaian target tim." }),
  answers: z.array(z.object({ id: z.string().max(40), text: z.string().max(MAX_ANSWER, `Jawaban maks. ${MAX_ANSWER} huruf.`) })).max(MAX_QUESTIONS),
});
export type AnswerInput = z.infer<typeof answerInputSchema>;

export type StoredAnswer = { id: string; label: string; text: string };

/**
 * The answers as kept: one per question this leader got, with the question as it read when they
 * answered (a later edit in the CMS does not change what they were asked). `missing` names a
 * required question left empty.
 */
export function answersToStore(input: Pick<AnswerInput, "targetStatus" | "answers">, questions: readonly LrQuestion[]): { answers: StoredAnswer[]; missing: string | null } {
  const given = new Map(input.answers.map(answer => [answer.id, answer.text.trim()]));
  const asked = questionsFor(input.targetStatus, questions);
  const missing = asked.find(question => question.required && !given.get(question.id));
  return {
    answers: asked.map(question => ({ id: question.id, label: question.label, text: given.get(question.id) ?? "" })).filter(answer => answer.text),
    missing: missing?.id ?? null,
  };
}

export type FormState = "open" | "closed" | "past";
/** Open, closed by the CMS, or past its deadline. */
export function formState(isOpen: boolean, deadline: string | null, now = new Date()): FormState {
  if (!isOpen) return "closed";
  if (deadline && new Date(deadline).getTime() <= now.getTime()) return "past";
  return "open";
}

export type Depth = { words: number; level: 0 | 1 | 2 | 3; label: string };
const depthLabels = ["Belum ada isi", "Baru mulai", "Sudah jelas", "Mendalam"] as const;
/** How far an answer goes, for the little meter under the box: by words, never a rule. */
export function depthOf(text: string): Depth {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const level = words === 0 ? 0 : words < 12 ? 1 : words < 40 ? 2 : 3;
  return { words, level, label: depthLabels[level] };
}

/** Adds a sentence starter to an answer: on its own line after what is there. */
export function withStarter(text: string, starter: string): string {
  const clean = starter.replace(/…$/, "").trimEnd();
  const base = text.trimEnd();
  return base ? `${base}\n${clean} ` : `${clean} `;
}

const WIB = "Asia/Jakarta";
export function wibDateLabel(date: string): string {
  return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}
export function wibInstantLabel(iso: string): string {
  const parts = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: WIB }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}.${get("minute")} WIB`;
}
/** Today in WIB, YYYY-MM-DD. */
export function wibToday(now = new Date()): string {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}
/** Whole days from today (WIB) to a date: 0 today, negative after it. */
export function daysUntil(date: string, now = new Date()): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${wibToday(now)}T00:00:00Z`)) / 86_400_000);
}
/** A datetime-local value, read as WIB, as an instant; and back. */
export function wibInputToIso(value: string): string | null {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+07:00` : null;
}
export function isoToWibInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 16);
}

export type OwnAnswer = { name: string; team: string; targetStatus: TargetStatus; answers: StoredAnswer[]; createdAt: string; updatedAt: string };

/** An answer as plain text, for Salin and Unduh: what the leader keeps for the training. */
export function answerText(content: Pick<LrContent, "title" | "tagline" | "coach" | "closing">, answer: OwnAnswer): string {
  const lines = [
    `Refleksi Leader · ${content.title}${content.tagline ? ` – ${content.tagline}` : ""}`,
    "",
    `Nama: ${answer.name}`,
    `Tim: ${answer.team}`,
    `Capaian target: ${targetLabels[answer.targetStatus]}`,
    `Diperbarui: ${wibInstantLabel(answer.updatedAt)}`,
    "",
    ...answer.answers.flatMap((item, index) => [`${index + 1}. ${item.label}`, item.text, ""]),
  ];
  if (content.closing) lines.push(content.closing);
  return lines.join("\n").trim() + "\n";
}

/** A file name for the download: "refleksi-nama-tim.txt". */
export function answerFileName(answer: Pick<OwnAnswer, "name">): string {
  const slug = answer.name.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().toLowerCase().replace(/[\s_]+/g, "-").slice(0, 40);
  return `refleksi-${slug || "leader"}.txt`;
}

/** A fresh random key, in the browser or on the server (43 characters, 256 bits). */
export function newKey(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* --- What the CMS and the coach see --- */

/** A row in the CMS: who answered, when, and what they wrote (the CMS reads answers since 19 Nov 2026). */
export type CmsResponse = { id: string; name: string; team: string; targetStatus: TargetStatus; answers: StoredAnswer[]; createdAt: string; updatedAt: string };
export type CmsView = {
  migrated: boolean;
  content: LrContent;
  isOpen: boolean;
  state: FormState;
  responses: CmsResponse[];
};

export function countByStatus(rows: readonly { targetStatus: TargetStatus }[]): Record<TargetStatus, number> {
  const counts: Record<TargetStatus, number> = { tercapai: 0, sebagian: 0, belum: 0 };
  for (const row of rows) counts[row.targetStatus] += 1;
  return counts;
}

/** The question columns of the coach's Excel: the current questions first, then any older ones answers still hold. */
export function exportColumns(questions: readonly LrQuestion[], responses: readonly { answers: StoredAnswer[] }[]): { id: string; label: string }[] {
  const columns = questions.map(question => ({ id: question.id, label: question.label }));
  const seen = new Set(columns.map(column => column.id));
  for (const response of responses) for (const answer of response.answers) {
    if (!seen.has(answer.id)) { seen.add(answer.id); columns.push({ id: answer.id, label: answer.label }); }
  }
  return columns.filter(column => responses.some(response => response.answers.some(answer => answer.id === column.id)) || questions.some(question => question.id === column.id && question.enabled));
}
