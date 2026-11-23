import { beforeEach, describe, expect, it, vi } from "vitest";

/* Jejak karbon in Admin Pra WAM: what the page reads, what Simpan writes, and "Ke rombongan" (made-up people). */
const fake = vi.hoisted(() => ({ rows: [] as { key: string; value: unknown; updated_at: string | null }[], writes: [] as { key: string; value: unknown }[], error: null as null | { code: string; message: string } }));
vi.mock("../supabase/admin", () => ({
  createPrivilegedClient: () => ({
    from: () => ({
      select: () => ({ in: async (_: string, keys: string[]) => ({ data: fake.error ? null : fake.rows.filter(row => keys.includes(row.key)), error: fake.error }) }),
      upsert: async (row: { key: string; value: unknown }) => { fake.writes.push({ key: row.key, value: row.value }); return { error: fake.error }; },
    }),
  }),
}));

const { carbonAdminState, saveCarbonSetup, sendToGroup } = await import("./carbon");
const { EMPTY_CARBON_SETUP } = await import("@/lib/pra-wam/carbon");
const setup = { settings: { nights: 2, mealsPerPerson: 6 }, trip: { from: "Kantor", to: "Venue", mode: "mobil", km: 25, perVehicle: 6, roundTrip: true }, formOpen: true };
const answer = (own: unknown) => ({ own, bottles: 1, laptopHours: 2, phoneCharges: 1, answeredAt: "2026-11-24T01:00:00Z" });

beforeEach(() => {
  fake.error = null;
  fake.writes = [];
  fake.rows = [
    { key: "mission_journey", value: { rooms: { A: "A3", B: "B1" }, people: [{ name: "Ani Satu", dept: "Dept", room: "A" }, { name: "Ina Dua", dept: "Dept", room: "A" }, { name: "Budi Tiga", room: "B" }], bod: [] }, updated_at: null },
    { key: "carbon_setup", value: setup, updated_at: "2026-11-24T02:00:00Z" },
    { key: "carbon_answers", value: { "INA DUA": answer({ from: "Magelang", mode: "motor", km: 40, roundTrip: true }), "ANI SATU": { broken: true } }, updated_at: null },
  ];
});

describe("Jejak karbon (Admin Pra WAM)", () => {
  it("reads the setup, the people with their room code and roommates, and good answers only", async () => {
    const state = await carbonAdminState();
    expect(state).toMatchObject({ setup, saved: true, migrated: true, updatedAt: "2026-11-24T02:00:00Z" });
    expect(state.people.map(person => [person.id, person.room, person.occupants, !!person.travel])).toEqual([["ANI SATU", "A3", 2, false], ["INA DUA", "A3", 2, true], ["BUDI TIGA", "B1", 1, false]]);
  });

  it("starts empty when nothing is saved, and waits when pw_settings is not there", async () => {
    fake.rows = [];
    expect(await carbonAdminState()).toMatchObject({ setup: EMPTY_CARBON_SETUP, people: [], saved: false, migrated: true });
    fake.error = { code: "42P01", message: "relation pw_settings does not exist" };
    expect(await carbonAdminState()).toMatchObject({ setup: EMPTY_CARBON_SETUP, migrated: false });
    await expect(saveCarbonSetup(setup as never)).rejects.toThrow(/pw_settings/);
  });

  it("saves the setup in its own row", async () => {
    await saveCarbonSetup(setup as never);
    expect(fake.writes).toEqual([{ key: "carbon_setup", value: setup }]);
  });

  it("sends someone back to the group, keeping their other answers", async () => {
    await sendToGroup("INA DUA");
    expect(fake.writes).toHaveLength(1);
    expect((fake.writes[0].value as Record<string, { own: unknown; bottles: number }>)["INA DUA"]).toMatchObject({ own: null, bottles: 1 });
    await expect(sendToGroup("BUDI TIGA")).rejects.toThrow(/sudah ikut rombongan/);
  });
});
