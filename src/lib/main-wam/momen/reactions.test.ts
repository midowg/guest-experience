import { describe, expect, it } from "vitest";
import { dictionaries } from "../i18n";
import { reactionSchema } from "./filters";
import { HEART, isReactionEmoji, myReaction, parseReactions, QUICK_REACTIONS, REACTION_EMOJIS, REACTION_GROUPS, reactionTotal, withReaction, type ReactionCount } from "./reactions";
import { sampleReactions } from "./sample";

/* The list of emoji and the small rules around it: the list is closed (the server takes nothing else), the screen's counts follow a tap at once. */

describe("the emoji list", () => {
  it("has about sixty emoji in groups, none twice, the heart written as the database writes it", () => {
    expect(REACTION_EMOJIS.length).toBeGreaterThanOrEqual(55);
    expect(REACTION_EMOJIS.length).toBeLessThanOrEqual(70);
    expect(new Set(REACTION_EMOJIS).size).toBe(REACTION_EMOJIS.length);
    expect(REACTION_GROUPS.map(group => group.key)).toEqual(["wajah", "tangan", "hati", "perayaan", "lainnya"]);
    expect(HEART).toBe("❤️");
    expect(HEART.length).toBe(2);
  });

  it("fits the database's check (1 to 16 characters) and each group has a name in both languages", () => {
    for (const emoji of REACTION_EMOJIS) expect([...emoji].length, emoji).toBeGreaterThanOrEqual(1);
    for (const emoji of REACTION_EMOJIS) expect([...emoji].length, emoji).toBeLessThanOrEqual(16);
    for (const group of REACTION_GROUPS) for (const lang of ["id", "en"] as const) expect(dictionaries[lang][`momen.react.group.${group.key}`], `${lang} ${group.key}`).toBeTruthy();
  });

  it("starts with the quick row (heart, laughing, fire, clapping, surprised, thanks), all of them in the list", () => {
    expect(QUICK_REACTIONS).toEqual([HEART, "😂", "🔥", "👏", "😮", "🙏"]);
    for (const emoji of QUICK_REACTIONS) expect(isReactionEmoji(emoji)).toBe(true);
  });

  it("accepts a listed emoji only: no free text, no look-alike, no two at once", () => {
    for (const emoji of REACTION_EMOJIS) expect(isReactionEmoji(emoji)).toBe(true);
    for (const bad of ["", "a", "🤡", "❤", "❤️❤️", `${HEART} `, "hore", "<b>", 5, null, undefined]) expect(isReactionEmoji(bad), String(bad)).toBe(false);
    expect(reactionSchema.safeParse({ emoji: "🔥" }).success).toBe(true);
    expect(reactionSchema.safeParse({ emoji: "🤡" }).success).toBe(false);
    expect(reactionSchema.safeParse({}).success).toBe(false);
  });
});

describe("reading what the database answers", () => {
  it("keeps well-formed entries, in order, and drops the rest", () => {
    expect(parseReactions([{ emoji: HEART, count: 3, mine: true }, { emoji: "😂", count: "2", mine: false }])).toEqual([{ emoji: HEART, count: 3, mine: true }, { emoji: "😂", count: 2, mine: false }]);
    expect(parseReactions([{ emoji: "🤡", count: 3 }, { emoji: HEART, count: 0 }, { emoji: HEART, count: -1 }, { emoji: "🔥", count: "x" }, null, "x", 4])).toEqual([]);
    expect(parseReactions([{ emoji: HEART, count: 1 }, { emoji: HEART, count: 5, mine: true }])).toEqual([{ emoji: HEART, count: 1, mine: false }]);
    expect(parseReactions(JSON.stringify([{ emoji: "🙏", count: 1, mine: true }]))).toEqual([{ emoji: "🙏", count: 1, mine: true }]);
    for (const nothing of [null, undefined, "", "not json", {}, 5]) expect(parseReactions(nothing)).toEqual([]);
  });

  it("knows the person's own reaction and the total", () => {
    const list = sampleReactions(10, HEART);
    expect(myReaction(list)).toBe(HEART);
    expect(myReaction(sampleReactions(10))).toBeNull();
    expect(reactionTotal(list)).toBe(10);
    expect(reactionTotal([])).toBe(0);
  });
});

describe("the screen's counts after a tap (one reaction per person)", () => {
  const list: ReactionCount[] = [{ emoji: HEART, count: 12, mine: false }, { emoji: "😂", count: 3, mine: false }, { emoji: "🔥", count: 2, mine: false }];

  it("adds one to the emoji chosen and marks it the person's", () => {
    expect(withReaction(list, "😂")).toEqual([{ emoji: HEART, count: 12, mine: false }, { emoji: "😂", count: 4, mine: true }, { emoji: "🔥", count: 2, mine: false }]);
  });

  it("starts a new emoji at one, after the others of the same count, most first", () => {
    expect(withReaction(list, "🎉").at(-1)).toEqual({ emoji: "🎉", count: 1, mine: true });
    expect(withReaction([], "🎉")).toEqual([{ emoji: "🎉", count: 1, mine: true }]);
  });

  it("replaces the old reaction instead of adding a second one", () => {
    const mine = withReaction(list, "🔥");
    const changed = withReaction(mine, "😂");
    expect(reactionTotal(changed)).toBe(reactionTotal(list) + 1);
    expect(changed.filter(entry => entry.mine)).toEqual([{ emoji: "😂", count: 4, mine: true }]);
    expect(changed.find(entry => entry.emoji === "🔥")).toEqual({ emoji: "🔥", count: 2, mine: false });
  });

  it("takes it back (null): down by one, and the emoji is gone at zero", () => {
    const mine = withReaction(list, "🎉");
    expect(withReaction(mine, null)).toEqual(list);
    expect(withReaction(withReaction(list, "🔥"), null)).toEqual(list);
    expect(withReaction(list, null)).toEqual(list);
  });

  it("re-orders by count when a smaller one passes a bigger one, a tie keeping its place", () => {
    const close: ReactionCount[] = [{ emoji: HEART, count: 3, mine: false }, { emoji: "😂", count: 3, mine: false }];
    expect(withReaction(close, "😂").map(entry => entry.emoji)).toEqual(["😂", HEART]);
    const tie: ReactionCount[] = [{ emoji: HEART, count: 2, mine: false }, { emoji: "😂", count: 1, mine: false }];
    expect(withReaction(tie, "😂").map(entry => entry.emoji)).toEqual([HEART, "😂"]);
  });

  it("never changes the list it is given", () => {
    const copy = JSON.parse(JSON.stringify(list));
    withReaction(list, "😂"); withReaction(list, null);
    expect(list).toEqual(copy);
  });
});
