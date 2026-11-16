import { describe, expect, it } from "vitest";
import { figureOfFile, figureScore, pickFigure, rarityOf, reasonText, rerollFigure, type Figure } from "./figures";

const figure = (key: string, personaId: string, rest: Partial<Figure> = {}): Figure => ({
  id: key, number: 1, key, name: key, personaId, costume: "", hobbies: [], activities: [], energy: "", genre: "",
  indonesian: false, funny: false, quote: null, hidden: false, image: null, stored: false, legendImage: null, ...rest,
});
const first = (n: number) => { void n; return 0; };
const hillary = figure("edmund-hillary", "garda", { name: "Edmund Hillary", hobbies: ["Olahraga & outdoor"], activities: ["Outdoor"], energy: "Kelompok kecil" });
const ramsay = figure("gordon-ramsay", "garda", { name: "Gordon Ramsay", hobbies: ["Kuliner & masak"], activities: ["Kuliner"], energy: "Kelompok besar" });
const mercury = figure("freddie-mercury", "penghibur", { name: "Freddie Mercury", hobbies: ["Musik"], activities: ["Musik / karaoke"], energy: "Kelompok besar", genre: "Rock" });
const answers = { "17": ["Olahraga & outdoor", "Musik"], "20": "Kelompok kecil", "21": ["Outdoor"], "37": ["Rock"] };

describe("matching a figure", () => {
  it("scores hobbies and activities 2 each, energy and genre 1, in words for the reason", () => {
    expect(figureScore(hillary, answers)).toEqual({ score: 5, why: ["suka olahraga & outdoor", "paling menikmati kegiatan outdoor", "nyaman di kelompok kecil"] });
    expect(figureScore(mercury, answers)).toEqual({ score: 3, why: ["suka musik", "suka musik rock"] });
    // An option HR wrote with other spaces still matches; a written-in Lainnya never does.
    expect(figureScore(figure("x", "p", { genre: "Dangdut / Koplo" }), { "37": ["Dangdut/ Koplo"] }).score).toBe(1);
    expect(figureScore(figure("x", "p", { hobbies: ["Lainnya"] }), { "17": ["Lainnya: memancing"] }).score).toBe(0);
  });

  it("gives one person a figure: the persona's best free one, then the best free one of any persona", () => {
    expect(pickFigure("garda", [ramsay, hillary, mercury], answers, {}, first)?.figure.key).toBe("edmund-hillary");
    // Hillary is taken: Ramsay, still of the persona, though he scores less.
    expect(pickFigure("garda", [ramsay, hillary, mercury], answers, { "edmund-hillary": 1 }, first)?.figure.key).toBe("gordon-ramsay");
    // Every figure of the persona taken: the best of the rest.
    expect(pickFigure("garda", [ramsay, hillary, mercury], answers, { "edmund-hillary": 1, "gordon-ramsay": 1 }, first)?.figure.key).toBe("freddie-mercury");
    // Every figure taken: none.
    expect(pickFigure("garda", [ramsay, hillary], answers, { "edmund-hillary": 1, "gordon-ramsay": 1 }, first)).toBeNull();
    expect(pickFigure("garda", [{ ...hillary, hidden: true }, ramsay], answers, {}, first)?.figure.key).toBe("gordon-ramsay");
    // Without an answer at 37 the genre just does not count.
    expect(figureScore(mercury, { "17": ["Musik"] }).score).toBe(2);
  });

  it("draws between figures that tie", () => {
    const a = figure("a", "garda"), b = figure("b", "garda");
    const last = (n: number) => n - 1;
    expect(pickFigure("garda", [a, b], {}, { a: 1 }, first)?.figure.key).toBe("b");
    const tie = pickFigure("garda", [a, b], {}, {}, last);
    expect([tie?.figure.key, tie?.tied]).toEqual(["b", ["a", "b"]]);
  });

  it("re-rolls to a free figure of the persona at random, else any free one, never the one held", () => {
    const pool = [hillary, ramsay, mercury];
    // Held: Hillary. Ramsay is the only other free garda.
    expect(rerollFigure("garda", pool, answers, { "edmund-hillary": 1 }, "edmund-hillary", first)?.figure.key).toBe("gordon-ramsay");
    // Ramsay taken too: a free figure of another persona.
    expect(rerollFigure("garda", pool, answers, { "edmund-hillary": 1, "gordon-ramsay": 1 }, "edmund-hillary", first)?.figure.key).toBe("freddie-mercury");
    expect(rerollFigure("garda", pool, answers, { "edmund-hillary": 1, "gordon-ramsay": 1, "freddie-mercury": 1 }, "edmund-hillary", first)).toBeNull();
    // The reason still comes from the answers.
    expect(rerollFigure("garda", pool, answers, { "edmund-hillary": 1, "gordon-ramsay": 1 }, "edmund-hillary", first)?.why).toEqual(["suka musik", "suka musik rock"]);
  });

  it("reads the rarity as 0 to 4", () => {
    expect([rarityOf({ key: "common", sort: 0 }), rarityOf({ key: "epic", sort: 3 }), rarityOf({ key: "legendary", sort: 4 }), rarityOf({ key: "baru", sort: 9 })]).toEqual([0, 3, 4, 4]);
  });

  it("says why, as the handoff's sentence", () => {
    expect(reasonText("Garda Depan", "Edmund Hillary", ["suka olahraga & outdoor", "paling menikmati kegiatan outdoor", "nyaman di kelompok kecil"]))
      .toBe("Kamu dapat Edmund Hillary karena kamu tipe Garda Depan, suka olahraga & outdoor, paling menikmati kegiatan outdoor dan nyaman di kelompok kecil.");
    expect(reasonText("Penyihir Ide", "Affandi", [])).toBe("Kamu dapat Affandi karena kamu tipe Penyihir Ide.");
  });

  it("knows a figure's picture by its key or its number", () => {
    const figures = [{ key: "ki-hajar-dewantara", number: 1 }, { key: "affandi", number: 7 }, { key: "chrisye", number: 100 }];
    expect(figureOfFile("Ki-Hajar-Dewantara.PNG", figures)?.number).toBe(1);
    expect(figureOfFile("tokoh-07.webp", figures)?.key).toBe("affandi");
    expect(figureOfFile("tokoh-100.png", figures)?.key).toBe("chrisye");
    expect(figureOfFile("karakter-01.webp", figures)).toBeNull();
    expect(figureOfFile("affandi.gif", figures)).toBeNull();
  });
});
