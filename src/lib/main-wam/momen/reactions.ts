/*
 * Reactions to a photo in Momen (WhatsApp / Telegram style): one emoji per person per photo, chosen
 * from this fixed list (never free text: the server checks it), shown as small pills inside the photo
 * with a count. No list of who, no message. Pure; shared by the screens, the API and the tests.
 */

/** The red heart: U+2764 U+FE0F, as the database holds it (migration 202611210001 moves old hearts to it). */
export const HEART = "❤️";

/** The emoji sheet, in groups (the group's name is the dictionary key `momen.react.group.<key>`). */
export const REACTION_GROUPS = [
  { key: "wajah", emojis: ["😀", "😂", "🤣", "😊", "😍", "🥰", "😘", "😎", "🤩", "🥳", "😮", "😢", "😭", "😡", "🤔", "😴"] },
  { key: "tangan", emojis: ["👍", "👏", "🙌", "🙏", "💪", "🤝", "👌", "🤞", "🤟", "👋"] },
  { key: "hati", emojis: [HEART, "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💖", "💕"] },
  { key: "perayaan", emojis: ["🎉", "🎊", "🏆", "🥇", "🎂", "🍾", "🎈", "✨", "🌟", "🎁"] },
  { key: "lainnya", emojis: ["🔥", "💯", "⭐", "☕", "🍕", "🍜", "🌄", "🌴", "📸", "🎶", "🚀", "✅", "👀", "🙈"] },
] as const;
export type ReactionGroupKey = (typeof REACTION_GROUPS)[number]["key"];

/** Every emoji a person may react with. */
export const REACTION_EMOJIS: readonly string[] = REACTION_GROUPS.flatMap(group => group.emojis);
const ALLOWED = new Set(REACTION_EMOJIS);
export const isReactionEmoji = (value: unknown): value is string => typeof value === "string" && ALLOWED.has(value);

/** The quick row under a photo (the sheet behind "+" has the rest). */
export const QUICK_REACTIONS: readonly string[] = [HEART, "😂", "🔥", "👏", "😮", "🙏"];

/** How many reactions one person may send per 10 minutes (an attack is not a reaction; changing one's mind counts). */
export const REACTIONS_PER_10_MINUTES = 200;

/** A photo's reactions as the app uses them: how many per emoji, and whether the viewer's one is that emoji. */
export type ReactionCount = { emoji: string; count: number; mine: boolean };

/** What the database answers (jsonb) as ReactionCount[]: anything off the list or malformed is dropped. */
export function parseReactions(raw: unknown): ReactionCount[] {
  const list = typeof raw === "string" ? safeJson(raw) : raw;
  if (!Array.isArray(list)) return [];
  const out: ReactionCount[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const { emoji, count, mine } = item as Record<string, unknown>;
    const n = Number(count);
    if (!isReactionEmoji(emoji) || !Number.isFinite(n) || n < 1 || out.some(entry => entry.emoji === emoji)) continue;
    out.push({ emoji, count: Math.floor(n), mine: mine === true });
  }
  return out;
}
function safeJson(text: string): unknown { try { return JSON.parse(text); } catch { return null; } }

/** The emoji the viewer reacted with, if any. */
export const myReaction = (list: readonly ReactionCount[]): string | null => list.find(entry => entry.mine)?.emoji ?? null;
export const reactionTotal = (list: readonly ReactionCount[]): number => list.reduce((sum, entry) => sum + entry.count, 0);

/**
 * The list after the viewer chose `emoji` (null = takes it back), for the screen to show at once: the old
 * choice goes down by one, the new one up by one, most first (a tie keeps its place).
 */
export function withReaction(list: readonly ReactionCount[], emoji: string | null): ReactionCount[] {
  const next = list.flatMap(entry => (entry.mine ? (entry.count > 1 ? [{ ...entry, count: entry.count - 1, mine: false }] : []) : [entry]));
  if (emoji) {
    const at = next.findIndex(entry => entry.emoji === emoji);
    if (at >= 0) next[at] = { ...next[at], count: next[at].count + 1, mine: true };
    else next.push({ emoji, count: 1, mine: true });
  }
  return next.map((entry, index) => ({ entry, index })).sort((a, b) => b.entry.count - a.entry.count || a.index - b.index).map(({ entry }) => entry);
}
