import { describe, expect, it } from "vitest";
import { chooseCharacter, comboOf, drawLook, drawTier, oddsLabel, scoresOf, serialLabel, slotOfFile, tiersSchema, topCharacters, type Tier } from "./cards";

const garda = { id: "garda", hidden: false, rules: [{ questionKey: "34", option: "Eksekutor", weight: 3 }, { questionKey: "21", option: "Outdoor", weight: 1 }] };
const penyihir = { id: "penyihir", hidden: false, rules: [{ questionKey: "34", option: "Pencetus ide", weight: 3 }, { questionKey: "17", option: "Seni & kerajinan", weight: 1 }] };
const hidden = { id: "tersembunyi", hidden: true, rules: [{ questionKey: "34", option: "Eksekutor", weight: 9 }] };
const tiers: Tier[] = [
  { key: "common", name: "Common", color: "#AEB7C7", odds: 4500, maxCards: null, line: "", sort: 0 },
  { key: "uncommon", name: "Uncommon", color: "#47D6AA", odds: 2700, maxCards: null, line: "", sort: 1 },
  { key: "rare", name: "Rare", color: "#449DFF", odds: 1800, maxCards: null, line: "", sort: 2 },
  { key: "epic", name: "Epic", color: "#C37BFF", odds: 700, maxCards: null, line: "", sort: 3 },
  { key: "legendary", name: "Legendary", color: "#FFC94A", odds: 300, maxCards: 2, line: "", sort: 4 },
];
/** A fixed sequence of draws, so a test knows what "random" says. */
const sequence = (...values: number[]) => (n: number) => { const next = values.shift() ?? 0; return Math.min(next, n - 1); };

describe("the character follows the answers", () => {
  it("adds the weight of every chosen option that has a rule", () => {
    expect(scoresOf([garda, penyihir], { "34": ["Eksekutor", "Pencetus ide"], "21": ["Outdoor"] })).toEqual({ garda: 4, penyihir: 3 });
  });
  it("picks the highest score; nobody scoring leaves every shown character in the draw", () => {
    expect(topCharacters([garda, penyihir, hidden], { "34": ["Eksekutor"] })).toEqual(["garda"]);
    expect(topCharacters([garda, penyihir, hidden], {})).toEqual(["garda", "penyihir"]);
  });
  it("draws among the tied ones only, and keeps the current one while it is still among the best", () => {
    const answers = { "34": ["Eksekutor", "Pencetus ide"] };
    expect(chooseCharacter([garda, penyihir], answers, null, sequence(1))).toEqual({ id: "penyihir", tied: ["garda", "penyihir"] });
    expect(chooseCharacter([garda, penyihir], answers, "garda", sequence(1))?.id).toBe("garda");
    // The answers moved away from the current one: it changes.
    expect(chooseCharacter([garda, penyihir], { "34": ["Pencetus ide"] }, "garda", sequence(0))?.id).toBe("penyihir");
  });
});

describe("the level is drawn with the odds", () => {
  it("maps the drawn number to a level, lowest first", () => {
    expect(drawTier(tiers, {}, sequence(0)).key).toBe("common");
    expect(drawTier(tiers, {}, sequence(4499)).key).toBe("common");
    expect(drawTier(tiers, {}, sequence(4500)).key).toBe("uncommon");
    expect(drawTier(tiers, {}, sequence(9699)).key).toBe("epic");
    expect(drawTier(tiers, {}, sequence(9700)).key).toBe("legendary");
    expect(drawTier(tiers, {}, sequence(9999)).key).toBe("legendary");
  });
  it("falls to the level below when a capped level is full, and says so", () => {
    expect(drawTier(tiers, { legendary: 2 }, sequence(9999))).toEqual({ key: "epic", roll: 9999, landed: "legendary", passed: ["legendary"] });
    expect(drawTier(tiers, { legendary: 1 }, sequence(9999)).key).toBe("legendary");
  });
  it("goes up from the lowest level when that is full too", () => {
    const capped = tiers.map(tier => tier.key === "common" ? { ...tier, maxCards: 0 } : tier);
    expect(drawTier(capped, {}, sequence(10)).key).toBe("uncommon");
  });
  it("accepts odds that add up to exactly 100 %", () => {
    const input = (odds: number[]) => ({ tiers: tiers.map((tier, index) => ({ key: tier.key, name: tier.name, color: tier.color, odds: odds[index], maxCards: tier.maxCards, line: "" })) });
    expect(tiersSchema.safeParse(input([4500, 2700, 1800, 700, 300])).success).toBe(true);
    const wrong = tiersSchema.safeParse(input([4500, 2700, 1800, 700, 200]));
    expect(wrong.success).toBe(false);
    expect(wrong.error?.issues[0].message).toBe("Jumlah peluang harus 100 %. Sekarang 99 %.");
    expect(oddsLabel(250)).toBe("2,5 %");
  });
});

describe("the look", () => {
  it("draws a background, an accent and up to two different stickers", () => {
    expect(drawLook({ latar: 8, aksen: 6, stiker: 12 }, sequence(2, 0, 0, 7, 5))).toEqual({ stickers: [1, 2], background: 8, accent: 6 });
    expect(drawLook({ latar: 8, aksen: 6, stiker: 12 }, sequence(0, 3, 2)).stickers).toEqual([]);
    expect(drawLook({ latar: 8, aksen: 6, stiker: 0 }, sequence(2, 0, 0)).stickers).toEqual([]);
  });
  it("makes character and look one comparable value, sticker order aside", () => {
    expect(comboOf("garda", { background: 1, accent: 2, stickers: [9, 3] })).toBe(comboOf("garda", { background: 1, accent: 2, stickers: [3, 9] }));
    expect(comboOf("garda", { background: 1, accent: 2, stickers: [] })).toBe("garda|1|2|");
  });
  it("names the number on the card", () => {
    expect(serialLabel(7)).toBe("#007");
    expect(serialLabel(null)).toBe("UJI");
  });
  it("reads which slot a file from the mockup's folder fills", () => {
    expect(slotOfFile("karakter-01.webp")).toEqual({ kind: "karakter", number: 1 });
    expect(slotOfFile("Stiker-12.PNG")).toEqual({ kind: "stiker", number: 12 });
    expect(slotOfFile("foto.png")).toBeNull();
    expect(slotOfFile("latar-00.png")).toBeNull();
  });
});
