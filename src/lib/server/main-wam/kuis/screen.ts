import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { buildScreen, needsAnswers, openWinnerIds, tallyRange } from "@/lib/main-wam/kuis/snapshot";
import type { ScreenSnapshot } from "@/lib/main-wam/kuis/types";
import { readMainWamSettings } from "../settings";
import { answeredCount, callNames, joinedAliases, playerCount, questionAnswers, quizAndRunByKey, tallies } from "./store";

/*
 * Kuis live's big screen (rancangan §7): a public page with no sign-in, as an office TV (/tv/{key}). Its
 * address holds kuis_ and 32 random bytes; only the key's sha256 is kept (a database leak gives no
 * working address); a new link from Admin WAM ends the old one. It answers only while the module is on
 * (otherwise the same "not found" as an unknown key). It shows tokoh, never names, except the podium's
 * places the MC opened. Cost of one poll: the settings (module on), the quiz with its game, how many
 * joined, and by phase: the lobby's tokoh, how many answered, the totals and answers once open, the
 * winners' names on the podium.
 */

export const SCREEN_KEY_PREFIX = "kuis_";
const KEY_PATTERN = /^kuis_[A-Za-z0-9_-]{43}$/;
export const newScreenKey = () => `${SCREEN_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
export const looksLikeScreenKey = (value: unknown): value is string => typeof value === "string" && KEY_PATTERN.test(value);
export const hashScreenKey = (key: string) => createHash("sha256").update(key, "utf8").digest("hex");
export const screenKeyHint = (key: string) => key.slice(-4);

/** The big screen's state, or null: an unknown or replaced key, or the module is off. */
export async function screenState(key: string, now = Date.now()): Promise<ScreenSnapshot | null> {
  if (!looksLikeScreenKey(key)) return null;
  const settings = await readMainWamSettings();
  if (!settings.modules.kuis) return null;
  const found = await quizAndRunByKey(hashScreenKey(key));
  if (!found) return null;
  const { quiz, run } = found;
  if (!run) return buildScreen({ title: quiz.title, run: null, now, players: 0, joined: null, answered: null, tallies: null, answers: null, names: null });
  const range = tallyRange(run, now);
  const [rows, joined, answered, answers] = await Promise.all([
    range ? tallies(run.id, range.upto, range.prev) : null,
    run.phase === "lobi" ? joinedAliases(run.id) : null,
    run.phase === "soal" ? answeredCount(run.id, run.index) : null,
    needsAnswers(run, now) ? questionAnswers(run.id, run.index) : null,
  ]);
  const players = rows ? rows.length : joined ? joined.length : await playerCount(run.id);
  const winners = rows && (run.phase === "podium" || run.phase === "selesai") ? openWinnerIds(run, rows, players) : [];
  const names = winners.length ? await callNames(winners) : null;
  return buildScreen({ title: quiz.title, run, now, players, joined, answered, tallies: rows, answers, names });
}
