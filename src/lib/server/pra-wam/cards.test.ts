import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QForm } from "@/lib/pra-wam/questionnaire";

/*
 * Drawing cards against a small in-memory stand-in for the Supabase client: tables are arrays,
 * `eq` filters, and the unique rules of migration 202611040013 (one card per person, one number,
 * one look) answer with 23505 as Postgres would.
 */
type Row = Record<string, unknown>;
let db: Record<string, Row[]>;

function query(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let op: "select" | "insert" | "update" | "delete" = "select";
  let payload: Row | null = null;
  let single = false;
  const matches = (row: Row) => filters.every(test => test(row));
  const run = () => {
    const rows = db[table] ?? (db[table] = []);
    if (op === "insert") {
      const row = { ...payload! };
      const clash = rows.find(other => other.form_id === row.form_id && (other.employee_id === row.employee_id
        ? "cq_person_cards_pkey" : (row.serial !== null && other.serial === row.serial) ? "cq_person_cards_serial" : (!row.trial && !other.trial && other.combo === row.combo) ? "cq_person_cards_combo"
          : (!row.trial && !other.trial && !!row.figure_id && other.figure_id === row.figure_id && other.figure_slot === row.figure_slot) ? "cq_person_cards_figure_place" : ""));
      if (clash) {
        const name = clash.employee_id === row.employee_id ? "cq_person_cards_pkey" : clash.serial === row.serial ? "cq_person_cards_serial" : "cq_person_cards_combo";
        return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint "${name}"` } };
      }
      row.drawn_at = "2026-11-04T10:00:00.000Z";
      rows.push(row);
      return { data: row, error: null };
    }
    const found = rows.filter(matches);
    if (op === "update") {
      // The figure place is unique too, as in migration 202611130010.
      const place = payload && payload.figure_id ? rows.find(other => !found.includes(other) && !other.trial && other.figure_id === payload!.figure_id && other.figure_slot === payload!.figure_slot) : undefined;
      if (place) return { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "cq_person_cards_figure_place"' } };
      found.forEach(row => Object.assign(row, payload)); return { data: single ? found[0] ?? null : found, error: null };
    }
    if (op === "delete") { db[table] = rows.filter(row => !matches(row)); return { data: found, error: null }; }
    return { data: single ? found[0] ?? null : found, error: null };
  };
  const builder = {
    select: () => builder, order: () => builder, limit: () => builder, neq: () => builder, in: () => builder,
    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return builder; },
    is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return builder; },
    not: (key: string, _op: string, value: unknown) => { filters.push(row => (row[key] ?? null) !== value); return builder; },
    insert: (row: Row) => { op = "insert"; payload = row; return builder; },
    update: (patch: Row) => { op = "update"; payload = patch; return builder; },
    delete: () => { op = "delete"; return builder; },
    single: () => { single = true; return builder; }, maybeSingle: () => { single = true; return builder; },
    then: (resolve: (result: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return builder;
}
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: query }) }));
vi.mock("server-only", () => ({}));

const { ensureCard, followAnswers, myCard } = await import("./cards");

const form = (status: QForm["status"] = "buka"): QForm => ({ id: "f1", name: "Kuesioner", slug: "kuesioner", oldSlugs: [], status, intro: "", cardText: "", minutes: 15, editUntil: null, stayDeleteOn: null, hrAccess: [], audience: "semua", audienceIds: [] });
const tier = (key: string, odds: number, sort: number, max_cards: number | null = null) => ({ form_id: "f1", key, name: key, color: "#AEB7C7", odds, max_cards, line: "", sort });
const card = (id: string, number: number, rules: { question_key: string; option: string; weight: number }[]) => ({
  form_id: "f1", id, number, key: id, name: id, figure: "", class: id, title: "", description: "", powers: [], partner_id: null, hidden: false, image_key: null, image_updated_at: null, cq_card_rules: rules,
});
const parts = () => [
  ...Array.from({ length: 8 }, (_, index) => ({ form_id: "f1", kind: "latar", number: index + 1, name: `L${index + 1}`, image_key: null, image_updated_at: null })),
  ...Array.from({ length: 6 }, (_, index) => ({ form_id: "f1", kind: "aksen", number: index + 1, name: `A${index + 1}`, image_key: null, image_updated_at: null })),
  ...Array.from({ length: 12 }, (_, index) => ({ form_id: "f1", kind: "stiker", number: index + 1, name: `S${index + 1}`, image_key: null, image_updated_at: null })),
];

beforeEach(() => {
  db = {
    cq_tiers: [tier("common", 4500, 0), tier("uncommon", 2700, 1), tier("rare", 1800, 2), tier("epic", 700, 3), tier("legendary", 300, 4)],
    cq_cards: [card("garda", 1, [{ question_key: "34", option: "Eksekutor", weight: 3 }]), card("penyihir", 2, [{ question_key: "34", option: "Pencetus ide", weight: 3 }])],
    cq_card_parts: parts(),
    cq_person_cards: [],
  };
});

describe("drawing a card", () => {
  it("takes the character from the answers, numbers cards in order, and records the draw", async () => {
    const first = await ensureCard(form(), "p1", { "34": ["Eksekutor"] });
    const second = await ensureCard(form(), "p2", { "34": ["Pencetus ide"] });
    expect(first?.character.id).toBe("garda");
    expect(second?.character.id).toBe("penyihir");
    expect([first?.serial, second?.serial]).toEqual([1, 2]);
    const roll = db.cq_person_cards[0].roll as { number: number; scores: Record<string, number>; odds: Record<string, number> };
    expect(roll.scores).toEqual({ garda: 3, penyihir: 0 });
    expect(roll.odds.legendary).toBe(300);
    expect(roll.number).toBeGreaterThanOrEqual(0);
    expect(first?.dna).toMatch(/^[0-9a-f]{10}$/);
  });

  it("never draws again: asking twice returns the same level, look and number", async () => {
    const first = await ensureCard(form(), "p1", { "34": ["Eksekutor"] });
    const again = await ensureCard(form(), "p1", { "34": ["Eksekutor"] });
    expect(again).toEqual(first);
    expect(db.cq_person_cards).toHaveLength(1);
  });

  it("keeps a full level out of the draw", async () => {
    db.cq_tiers = [tier("common", 0, 0), tier("legendary", 10_000, 1, 1)];
    expect((await ensureCard(form(), "p1", {}))?.tier.key).toBe("legendary");
    const second = await ensureCard(form(), "p2", {});
    expect(second?.tier.key).toBe("common");
    expect((db.cq_person_cards[1].roll as { passed: string[] }).passed).toEqual(["legendary"]);
  });

  it("makes a trial card without a number while the form is a draft, and draws for real once it is open", async () => {
    const trial = await ensureCard(form("draf"), "p1", {});
    expect(trial).toMatchObject({ trial: true, serial: null });
    const real = await ensureCard(form("buka"), "p1", {});
    expect(real).toMatchObject({ trial: false, serial: 1 });
    expect(db.cq_person_cards).toHaveLength(1);
  });

  it("gives every card a look nobody else has", async () => {
    db.cq_cards = [card("garda", 1, [])];
    db.cq_card_parts = parts().filter(part => part.kind !== "stiker" && part.number <= 2);
    const looks = new Set<string>();
    // Two backgrounds, two accents, no stickers: exactly four looks for four people.
    for (let index = 0; index < 4; index++) looks.add((await ensureCard(form(), `p${index}`, {}))?.dna ?? "");
    expect(looks.size).toBe(4);
  });
});

describe("the character follows the answers", () => {
  it("changes character, never level, look or number, while answers may change", async () => {
    const before = await ensureCard(form(), "p1", { "34": ["Eksekutor"] });
    await followAnswers(form(), "p1", { "34": ["Pencetus ide"] });
    const after = await myCard(form(), "p1");
    expect(after?.character.id).toBe("penyihir");
    expect({ tier: after?.tier.key, background: after?.background.number, stickers: after?.stickers, serial: after?.serial })
      .toEqual({ tier: before?.tier.key, background: before?.background.number, stickers: before?.stickers, serial: before?.serial });
    expect((db.cq_person_cards[0].roll as { changes: { from: string; to: string }[] }).changes).toMatchObject([{ from: "garda", to: "penyihir" }]);
  });

  it("stays put once the form is closed", async () => {
    await ensureCard(form(), "p1", { "34": ["Eksekutor"] });
    await ensureCard(form("tutup"), "p1", { "34": ["Pencetus ide"] });
    expect((await myCard(form(), "p1"))?.character.id).toBe("garda");
  });
});

describe("kartu tokoh dunia", () => {
  const figure = (key: string, number: number, persona: string, rest: Record<string, unknown> = {}) => ({
    form_id: "f1", id: key, number, key, name: key.replace(/-/g, " "), persona_id: persona, costume: "", hobbies: [], activities: [], energy: "", genre: "",
    indonesian: false, funny: false, quote: null, hidden: false, image_key: null, image_updated_at: null, ...rest,
  });
  beforeEach(() => {
    db.cq_figures = [
      figure("edmund-hillary", 1, "garda", { name: "Edmund Hillary", hobbies: ["Olahraga & outdoor"], activities: ["Outdoor"] }),
      figure("gordon-ramsay", 2, "garda", { name: "Gordon Ramsay", hobbies: ["Kuliner & masak"] }),
      figure("affandi", 3, "penyihir", { name: "Affandi" }),
    ];
  });
  const outdoorsy = { "34": ["Eksekutor"], "17": ["Olahraga & outdoor"], "21": ["Outdoor"] };

  it("matches the figure inside the persona, says why, and gives no figure to more than two people", async () => {
    const first = await ensureCard(form(), "p1", outdoorsy);
    expect(first?.figure?.key).toBe("edmund-hillary");
    expect(first?.character.class).toBe("garda");
    expect(first?.reason).toBe("Kamu dapat Edmund Hillary karena kamu tipe garda, suka olahraga & outdoor dan paling menikmati kegiatan outdoor.");
    expect(first?.colors).toEqual(["#C2303F", "#6E1023"]);
    // No picture uploaded yet: the one shipped with the app.
    expect(first?.figure?.image).toBe("/figur/edmund-hillary.webp");
    const second = await ensureCard(form(), "p2", outdoorsy);
    const third = await ensureCard(form(), "p3", outdoorsy);
    expect([second?.figure?.key, third?.figure?.key]).toEqual(["edmund-hillary", "gordon-ramsay"]);
    expect(db.cq_person_cards.map(row => [row.figure_id, row.figure_slot])).toEqual([["edmund-hillary", 1], ["edmund-hillary", 2], ["gordon-ramsay", 1]]);
    // The persona's figures full: a figure of another persona with a place.
    expect((await ensureCard(form(), "p4", outdoorsy))?.figure?.key).toBe("gordon-ramsay");
    expect((await ensureCard(form(), "p5", outdoorsy))?.figure?.key).toBe("affandi");
    // Every figure has two: the seventh person is a third for the best figure of the persona, in place 3.
    await ensureCard(form(), "p6", outdoorsy);
    expect((await ensureCard(form(), "p7", outdoorsy))?.figure?.key).toBe("edmund-hillary");
    expect(db.cq_person_cards.find(row => row.employee_id === "p7")).toMatchObject({ figure_slot: 3 });
    expect((db.cq_person_cards[0].roll as { figure: { key: string; score: number } }).figure).toMatchObject({ key: "edmund-hillary", score: 4 });
  });

  it("is locked: changed answers never change the figure, the persona, the level or the number", async () => {
    const before = await ensureCard(form(), "p1", outdoorsy);
    await followAnswers(form(), "p1", { "34": ["Pencetus ide"] });
    const after = await ensureCard(form(), "p1", { "34": ["Pencetus ide"] });
    expect(after).toEqual(before);
  });

  it("gives a card from before the figures its figure, keeping its level and number", async () => {
    db.cq_person_cards.push({ form_id: "f1", employee_id: "old", card_id: "garda", tier_key: "epic", background: 2, accent: 1, stickers: [], serial: 9, trial: false, combo: "garda|2|1|", dna: "0123456789", roll: { character: "garda" }, drawn_at: "2026-11-05T10:00:00.000Z" });
    const card = await ensureCard(form(), "old", outdoorsy);
    expect(card).toMatchObject({ serial: 9, tier: { key: "epic" }, figure: { key: "edmund-hillary" } });
    expect(card?.reason).toContain("Edmund Hillary");
  });

  it("gives an old card its figure wherever it is read, matched on the person's own answers", async () => {
    db.cq_person_cards.push({ form_id: "f1", employee_id: "old", card_id: "garda", tier_key: "epic", background: 2, accent: 1, stickers: [], serial: 9, trial: false, combo: "garda|2|1|", dna: "0123456789", roll: { character: "garda" }, drawn_at: "2026-11-05T10:00:00.000Z" });
    db.cq_questions = [{ form_id: "f1", id: "q17", key: "17" }, { form_id: "f1", id: "q21", key: "21" }];
    db.cq_answers = [{ form_id: "f1", employee_id: "old", question_id: "q17", value: ["Kuliner & masak"] }];
    // The questionnaire page, Beranda and the card's GET read it with myCard, which never draws.
    const card = await myCard(form(), "old");
    expect(card).toMatchObject({ serial: 9, tier: { key: "epic" }, figure: { key: "gordon-ramsay" } });
    expect(db.cq_person_cards[0]).toMatchObject({ figure_id: "gordon-ramsay", figure_slot: 1 });
    expect(await myCard(form(), "old")).toEqual(card);
  });

  it("draws an anime character as before when the catalog has no figures", async () => {
    db.cq_figures = [];
    const card = await ensureCard(form(), "p1", outdoorsy);
    expect([card?.figure, card?.reason]).toEqual([null, null]);
  });
});
