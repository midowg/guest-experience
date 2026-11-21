import { describe, expect, it } from "vitest";
import { agendaDays, agendaRowsOfTab, shownTab, tabDate, tabOfDate } from "../peserta/agenda";
import { sampleSessions } from "../sample";
import { checklistInputSchema, visibleSessions } from "./ceklis";
import { draftChanged, draftFromChecklist, draftToInput, moveItem, blankItem } from "./draft";
import { sampleChecklistItems, sampleChecklists, samplePrepSession } from "./sample";

const event = { startDate: "2027-01-04", endDate: "2027-01-07" };
const at = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);
const all = [...sampleSessions, samplePrepSession];

describe("Persiapan tabs in Agenda", () => {
  it("puts the H-n tabs first, then the days", () => {
    const days = agendaDays(event, "2027-01-05", "id", ["2027-01-01", "2027-01-03"]);
    expect(days.map(day => [day.key, day.day])).toEqual([["h3", "H-3"], ["h1", "H-1"], ["1", "Hari 1"], ["2", "Hari 2"], ["3", "Hari 3"], ["4", "Hari 4"]]);
    expect(days[0]).toMatchObject({ prep: true, number: 0 });
    expect(agendaDays(event, "2027-01-05").map(day => day.key)).toEqual(["1", "2", "3", "4"]);
  });
  it("maps keys and dates both ways", () => {
    expect(tabDate("h3", event)).toBe("2027-01-01");
    expect(tabDate("2", event)).toBe("2027-01-05");
    expect(tabDate("h99", event)).toBeNull();
    expect(tabOfDate("2027-01-01", event)).toBe("h3");
    expect(tabOfDate("2027-01-06", event)).toBe("3");
    expect(tabOfDate("2026-01-01", event)).toBeUndefined();
  });
  it("opens on today's Persiapan day before the event, else as before", () => {
    const prep = ["2027-01-01"];
    expect(shownTab(undefined, at("2027-01-01", "09:00"), event, prep)).toBe("h3");
    expect(shownTab(undefined, at("2026-12-20", "09:00"), event, prep)).toBe("h3");
    expect(shownTab(undefined, at("2027-01-05", "09:00"), event, prep)).toBe("2");
    expect(shownTab("h3", at("2027-01-05", "09:00"), event, prep)).toBe("h3");
    expect(shownTab("h2", at("2027-01-05", "09:00"), event, prep)).toBe("2");
    expect(shownTab(undefined, at("2026-12-20", "09:00"), event, [])).toBe("1");
  });
});

describe("rows with checklist chips", () => {
  const lists = sampleChecklists();
  const ticked = (n: number) => new Set(sampleChecklistItems.slice(0, n).map(item => item.id));
  it("shows the progress on the agenda that has a checklist", () => {
    const rows = agendaRowsOfTab(all, "h3", event, at("2027-01-01", "08:00"), [], "id", { lists, checked: ticked(2) });
    expect(rows).toHaveLength(1);
    expect(rows[0].ceklis).toEqual({ done: 2, total: 5, complete: false });
  });
  it("marks the first absen as waiting for the checklist until it is complete", () => {
    const first = (n: number) => agendaRowsOfTab(all, "1", event, at("2027-01-01", "08:00"), [], "id", { lists, checked: ticked(n) }).find(row => row.title.startsWith("Kumpul"))!;
    expect(first(2).ceklisFirst).toBe(true);
    expect(first(5).ceklisFirst).toBe(false);
  });
  it("has no chips without the module's data", () => {
    const rows = agendaRowsOfTab(all, "1", event, at("2027-01-01", "08:00"), [], "id");
    expect(rows.every(row => row.ceklis === undefined && row.ceklisFirst === undefined)).toBe(true);
  });
});

describe("module off hides Persiapan", () => {
  it("drops agendas before the first day only while the module is off", () => {
    expect(visibleSessions(all, event, false)).toHaveLength(sampleSessions.length);
    expect(visibleSessions(all, event, true)).toHaveLength(all.length);
  });
});

describe("the admin's draft", () => {
  const saved = sampleChecklists().get(samplePrepSession.id)!;
  const address = (id: string, version: string) => `/foto/${id}?v=${version}`;
  it("round-trips a saved checklist and sees no change", () => {
    const draft = draftFromChecklist(saved, address);
    expect(draft.items).toHaveLength(5);
    expect(draftChanged(saved, draft)).toBe(false);
    expect(checklistInputSchema.safeParse(draftToInput(draft)).success).toBe(true);
  });
  it("sees edits, a new item, a reorder and the switch; drops empty rows", () => {
    const draft = draftFromChecklist(saved, address);
    expect(draftChanged(saved, { ...draft, required: false })).toBe(true);
    expect(draftChanged(saved, { ...draft, items: moveItem(draft.items, 0, 1) })).toBe(true);
    const added = { ...draft, items: [...draft.items, { ...blankItem(), text: "Charger" }] };
    expect(draftChanged(saved, added)).toBe(true);
    expect(draftToInput(added).items.at(-1)).toEqual({ text: "Charger", note: "", photo: null });
    expect(draftToInput({ ...draft, items: [...draft.items, blankItem()] }).items).toHaveLength(5);
    expect(moveItem([1, 2], 0, -1)).toEqual([1, 2]);
  });
});
