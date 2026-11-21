import { describe, expect, it } from "vitest";
import { aliasOf, answerSchema, actionSchema, figurePicture, initialsOf, mysteryName, playOrder, questionSchema } from "./admin";

describe("what Admin WAM saves", () => {
  const good = { level: 2, body: "Gunung tertinggi di Pulau Jawa?", options: ["Semeru", "Arjuno", "Lawu", "Welirang"], correct: 0 };
  it("takes a question with four different options and its key", () => {
    expect(questionSchema.safeParse(good).success).toBe(true);
    expect(questionSchema.safeParse({ ...good, options: ["A", "B", "C"] }).success).toBe(false);
    expect(questionSchema.safeParse({ ...good, options: ["Semeru", "semeru", "Lawu", "Welirang"] }).success).toBe(false);
    expect(questionSchema.safeParse({ ...good, correct: 4 }).success).toBe(false);
    expect(questionSchema.safeParse({ ...good, level: 5 }).success).toBe(false);
    expect(questionSchema.safeParse({ ...good, image: "x.png" }).success).toBe(false);
  });

  it("plays easy to very hard, the admin's order within a level", () => {
    const list = [{ id: "c", level: 3, sort: 0 }, { id: "a2", level: 1, sort: 2 }, { id: "b", level: 2, sort: 0 }, { id: "a1", level: 1, sort: 1 }];
    expect(playOrder(list).map(item => item.id)).toEqual(["a1", "a2", "b", "c"]);
  });
});

describe("what phones and the MC send", () => {
  it("is checked", () => {
    const runId = "00000000-0000-4000-a000-000000000001";
    expect(answerSchema.safeParse({ runId, index: 0, choice: 3, tapAt: 1 }).success).toBe(true);
    expect(answerSchema.safeParse({ runId, index: 0, choice: 4, tapAt: 1 }).success).toBe(false);
    expect(answerSchema.safeParse({ runId, index: 0, choice: 1, tapAt: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(actionSchema.safeParse({ runId, rev: 3, action: "jeda" }).success).toBe(true);
    expect(actionSchema.safeParse({ runId, rev: 3, action: "hapus" }).success).toBe(false);
  });
});

describe("a player's alias", () => {
  it("is the tokoh, or Tokoh misterius with a fixed number", () => {
    expect(mysteryName(7)).toBe("Tokoh misterius #07");
    expect(aliasOf({ alias: "Marie Curie", figure_key: "marie-curie", persona: "Ahli Siasat", colors: ["#3A6FBF", "#1B2C66"], mystery_no: null }))
      .toEqual({ name: "Marie Curie", figure: "marie-curie", persona: "Ahli Siasat", colors: ["#3A6FBF", "#1B2C66"], mystery: null });
    expect(aliasOf({ alias: "Tokoh misterius #03", figure_key: null, persona: null, colors: null, mystery_no: 3 }))
      .toEqual({ name: "Tokoh misterius #03", figure: null, persona: "", colors: null, mystery: 3 });
    // A colour that is not plain hex is dropped (it goes into a style).
    expect(aliasOf({ alias: "X", figure_key: "x", persona: "", colors: ["red;", "#000000"], mystery_no: null }).colors).toBeNull();
    expect(aliasOf({ alias: "X", figure_key: "../x", persona: "", colors: null, mystery_no: 1 }).figure).toBeNull();
  });

  it("has two letters and a picture address", () => {
    expect(initialsOf("Marie Curie")).toBe("MC");
    expect(initialsOf("Pak Raden (Suyadi)")).toBe("PR");
    expect(initialsOf("Pelé")).toBe("PE");
    expect(initialsOf("Tokoh misterius #07")).toBe("T0");
    expect(figurePicture("marie-curie")).toBe("/figur/marie-curie.webp");
  });
});
