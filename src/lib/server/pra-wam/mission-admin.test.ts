import { beforeEach, describe, expect, it, vi } from "vitest";

/* Admin Pra WAM → Misi Perjalanan: what is read, the backup kept before saving, and nothing else lost (made-up people). */
type Row = { key: string; value: unknown; updated_at: string | null };
const fake = vi.hoisted(() => ({ rows: [] as Row[] }));
vi.mock("./appraisal", () => ({ listPeople: async () => [{ id: "1", name: "Ani", fullName: "Ani Satu", department: "Dept", active: true }] }));
vi.mock("../supabase/admin", () => ({
  createPrivilegedClient: () => ({
    from: () => ({
      select: () => ({ eq: (_: string, key: string) => ({ maybeSingle: async () => ({ data: fake.rows.find(row => row.key === key) ?? null, error: null }) }) }),
      upsert: async (row: Row) => { fake.rows = [...fake.rows.filter(item => item.key !== row.key), row]; return { error: null }; },
    }),
  }),
}));

const { missionAdminState, saveMissionSheet, MISSION_BACKUP_KEY } = await import("./mission-admin");
const stored = { rooms: { C1: "A3" }, people: [{ name: "Ani Satu", nick: "Ani", dept: "Dept", room: "C1", sleep: null, wake: null, sents: [6], hints: ["a"], secret: "kept" }], bod: [{ name: "Bima Dir", sents: [1], ceo: true }], note: "kept too" };

beforeEach(() => { fake.rows = [{ key: "mission_journey", value: stored, updated_at: "2026-11-23T01:00:00Z" }]; });

describe("Misi Perjalanan (Admin Pra WAM)", () => {
  it("reads the list and names that match no account", async () => {
    const state = await missionAdminState();
    expect(state).toMatchObject({ migrated: true, saved: true, updatedAt: "2026-11-23T01:00:00Z" });
    expect(state.sheet.people.map(person => person.name)).toEqual(["Ani Satu"]);
    expect(state.unmatched).toEqual(["Bima Dir"]);
  });

  it("keeps the old list as a backup, and parts this page does not edit", async () => {
    await saveMissionSheet({ rooms: { C1: "A4" }, people: [{ name: "Ani Satu", nick: "Ani", dept: "Dept", room: "C1", sleep: "22.00", wake: null, sents: [6], hints: ["b"] }], bod: [{ name: "Bima Dir", sents: [1] }] });
    expect(fake.rows.find(row => row.key === MISSION_BACKUP_KEY)?.value).toEqual({ value: stored, savedAt: "2026-11-23T01:00:00Z" });
    const saved = fake.rows.find(row => row.key === "mission_journey")?.value as Record<string, unknown>;
    expect(saved).toMatchObject({ rooms: { C1: "A4" }, note: "kept too", people: [{ name: "Ani Satu", hints: ["b"], sleep: "22.00", secret: "kept" }] });
    expect((saved.bod as { ceo?: boolean }[])[0].ceo).toBeUndefined();
  });
});
