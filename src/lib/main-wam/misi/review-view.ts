import { effectiveRules, publicRules, ruleDisplays, type RuleCheck, type RuleSource, type RuleType } from "./rules";
import type { CompletionStatus } from "./types";

/*
 * One proof as the review queue shows it (Admin WAM → Misi → Tinjauan now; the panitia's screen later,
 * through the same server functions): the photo, who sent it, the tagged people, the mission's TNC, what
 * the automatic checks and the verifier said, and the number of tries. JSON-safe; names are full names
 * (admin and panitia only). Pure types.
 */
export type ReviewItem = {
  /** The completion's id. */
  id: string;
  missionId: string;
  missionTitle: string;
  points: number;
  person: string;
  department: string;
  status: CompletionStatus;
  submittedAt: string;
  attempts: number;
  maxAttempts: number | null;
  /** An address the browser can open (an admin route that hands out a short-lived link, or a demo SVG). */
  photo: string | null;
  tags: { id: string; name: string; department: string }[];
  /** The TNC, one line each. */
  rules: { type: RuleType; text: string }[];
  checks: RuleCheck[];
  verifier: { provider: string; result: { putusan: "lolos" | "gagal" | "ragu"; alasan: string[]; skor?: number } } | null;
  reviewNote: string;
};

/** The TNC of a mission as the reviewer reads it, one line per rule (a pose says what it asks). */
export const reviewRuleLines = (source: RuleSource, defaultRadiusM = 50): ReviewItem["rules"] =>
  ruleDisplays(publicRules(effectiveRules(source, defaultRadiusM)), "id").map(rule => ({ type: rule.type, text: rule.type === "pose" && rule.note ? `${rule.title}: ${rule.note}` : rule.title }));
