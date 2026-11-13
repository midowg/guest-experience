import { describe, expect, it } from "vitest";
import { figureOfFile, figureScore, pickFigure, reasonText, type Figure } from "./figures";

const figure = (key: string, personaId: string, rest: Partial<Figure> = {}): Figure => ({
  id: key, number: 1, key, name: key, personaId, costume: "", hobbies: [], activities: [], energy: "", genre: "",
  indonesian: false, funny: false, quote: null, hidden: false, image: null, stored: false, ...rest,
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

  it("picks the best figure of the persona, then any with a place when the persona's are taken twice", () => {
    expect(pickFigure("garda", [ramsay, hillary, mercury], answers, {}, first)?.figure.key).toBe("edmund-hillary");
    // Hillary is taken twice: Ramsay, still of the persona, though he scores less.
    expect(pickFigure("garda", [ramsay, hillary, mercury], answers, { "edmund-hillary": 2 }, first)?.figure.key).toBe("gordon-ramsay");
    // Every figure of the persona taken twice: the best of the rest.
    expect(pickFigure("garda", [ramsay, hillary, mercury], answers, { "edmund-hillary": 2, "gordon-ramsay": 2 }, first)?.figure.key).toBe("freddie-mercury");
    // Every figure has two: a third person may have one, the persona's best first.
    expect(pickFigure("garda", [ramsay, hillary], answers, { "edmund-hillary": 2, "gordon-ramsay": 2 }, first)?.figure.key).toBe("edmund-hillary");
    expect(pickFigure("garda", [ramsay, hillary], answers, { "edmund-hillary": 3, "gordon-ramsay": 2 }, first)?.figure.key).toBe("gordon-ramsay");
    expect(pickFigure("garda", [ramsay, hillary], answers, { "edmund-hillary": 3, "gordon-ramsay": 3 }, first)).toBeNull();
    expect(pickFigure("garda", [{ ...hillary, hidden: true }, ramsay], answers, {}, first)?.figure.key).toBe("gordon-ramsay");
  });

  it("in a tie, gives a figure nobody has yet before drawing", () => {
    const a = figure("a", "garda"), b = figure("b", "garda");
    const last = (n: number) => n - 1;
    expect(pickFigure("garda", [a, b], {}, { a: 1 }, first)?.figure.key).toBe("b");
    const tie = pickFigure("garda", [a, b], {}, {}, last);
    expect([tie?.figure.key, tie?.tied]).toEqual(["b", ["a", "b"]]);
  });

  it("says why, as the handoff's sentence", () => {
    expect(reasonText("Garda Depan", "Edmund Hillary", ["suka olahraga & outdoor", "paling menikmati kegiatan outdoor", "nyaman di kelompok kecil"]))
      .toBe("Kamu dapat Edmund Hillary karena kamu tipe Garda Depan, suka olahraga & outdoor, paling menikmati kegiatan outdoor dan nyaman di kelompok kecil.");
    expect(reasonText("Penyihir Ide", "Affandi", [])).toBe("Kamu dapat Affandi karena kamu tipe Penyihir Ide.");
  });

  it("knows a figure's picture by its key or its number", () => {
    const figures = [{ key: "ki-hajar-dewantara", number: 1 }, { key: "affandi", number: 7 }];
    expect(figureOfFile("Ki-Hajar-Dewantara.PNG", figures)?.number).toBe(1);
    expect(figureOfFile("tokoh-07.webp", figures)?.key).toBe("affandi");
    expect(figureOfFile("karakter-01.webp", figures)).toBeNull();
    expect(figureOfFile("affandi.gif", figures)).toBeNull();
  });
});
