import { z } from "zod";
import { CONTROL_ACTIONS } from "./flow";
import { OPTION_COUNT } from "./rules";
import type { Alias, QuizLevel } from "./types";

/*
 * Kuis live: what Admin WAM, the MC and the phones send (checked on the server with these schemas), the
 * order questions are played in, and a player's alias. Pure.
 */

/** The migration of the module (Admin WAM names it; players and admins read only "menunggu pembaruan sistem"). */
export const KUIS_MIGRATION = "202611200601_main_wam_kuis.sql";
export const MAX_QUESTIONS = 40;
export const MAX_HOSTS = 20;

export const quizSchema = z.object({
  title: z.string().trim().min(2, "Judul minimal 2 huruf.").max(80, "Judul maksimal 80 huruf."),
}).strict();
export type QuizInput = z.infer<typeof quizSchema>;

export const questionSchema = z.object({
  level: z.number().int().min(1, "Pilih level.").max(4, "Pilih level."),
  body: z.string().trim().min(3, "Tulis soalnya.").max(200, "Soal maksimal 200 huruf."),
  options: z.array(z.string().trim().min(1, "Isi keempat pilihan.").max(80, "Pilihan maksimal 80 huruf.")).length(OPTION_COUNT, "Isi keempat pilihan."),
  correct: z.number().int().min(0, "Tandai jawaban benar.").max(OPTION_COUNT - 1, "Tandai jawaban benar."),
}).strict().refine(input => new Set(input.options.map(option => option.toLocaleLowerCase("id"))).size === OPTION_COUNT, { message: "Keempat pilihan harus berbeda.", path: ["options"] });
export type QuestionInput = { level: QuizLevel; body: string; options: string[]; correct: number };

/** Move a question up or down within its level. */
export const moveSchema = z.object({ direction: z.enum(["naik", "turun"]) }).strict();

export const hostSchema = z.object({ employeeId: z.uuid("Pilih orangnya.") }).strict();

export const joinSchema = z.object({ runId: z.uuid() }).strict();
export const answerSchema = z.object({
  runId: z.uuid(),
  index: z.number().int().min(0).max(MAX_QUESTIONS - 1),
  choice: z.number().int().min(0).max(OPTION_COUNT - 1),
  /** The tap on the server's clock, as the phone estimates it (epoch ms). */
  tapAt: z.number().finite(),
}).strict();
export const actionSchema = z.object({
  runId: z.uuid(),
  /** The rev the MC's screen saw: an action on an older one is refused (two MCs, a double press). */
  rev: z.number().int().min(1),
  action: z.enum(CONTROL_ACTIONS),
}).strict();

/** Questions in play order: easy to very hard, the admin's order within a level. */
export function playOrder<T extends { level: number; sort: number; createdAt?: string }>(questions: readonly T[]): T[] {
  return [...questions].sort((a, b) => a.level - b.level || a.sort - b.sort || (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
}

/** "Tokoh misterius #07": the alias of a player without a card, the number fixed for the run. */
export const mysteryName = (number: number) => `Tokoh misterius #${String(number).padStart(2, "0")}`;

/** A row's alias (mw_quiz_players): colours only when both are plain #RRGGBB. */
export function aliasOf(row: { alias: string; figure_key: string | null; persona: string | null; colors: unknown; mystery_no: number | null }): Alias {
  const colors = Array.isArray(row.colors) && row.colors.length === 2 && row.colors.every(color => typeof color === "string" && /^#[0-9A-Fa-f]{6}$/.test(color))
    ? [row.colors[0] as string, row.colors[1] as string] as [string, string] : null;
  const figure = typeof row.figure_key === "string" && /^[a-z0-9-]{1,60}$/.test(row.figure_key) ? row.figure_key : null;
  return { name: row.alias, figure, persona: row.persona ?? "", colors: figure ? colors : null, mystery: figure ? null : row.mystery_no };
}

/** Two letters for an avatar without a picture ("Marie Curie" → "MC"). */
export function initialsOf(name: string): string {
  const words = name.replace(/\(.*?\)/g, " ").split(/[\s.#]+/).filter(word => /[\p{L}\p{N}]/u.test(word));
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** Where a tokoh's picture is (shipped with the app, public/figur). */
export const figurePicture = (figure: string) => `/figur/${encodeURIComponent(figure)}.webp`;
