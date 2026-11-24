import { beforeEach, describe, expect, it, vi } from "vitest";

/* Jejak karbon: what the admin page reads, Simpan, "Ke rombongan", and the participant's own row (made-up people). */
type Row = { key: string; value: unknown; updated_at: string | null };
const fake = vi.hoisted(() => ({ rows: [] as Row[], writes: [] as { key: string; value: unknown }[], error: null as null | { code: string; message: string } }));
vi.mock("../supabase/admin", () => ({
  createPrivilegedClient: () => ({
    from: () => ({
      select: () => ({
        in: async (_: string, keys: string[]) => ({ data: fake.error ? null : fake.rows.filter(row => keys.includes(row.key)), error: fake.error }),
        like: (_: string, pattern: string) => ({ limit: async () => ({ data: fake.error ? null : fake.rows.filter(row => row.key.startsWith(pattern.replace("%", ""))), error: fake.error }) }),
      }),
      upsert: async (row: { key: string; value: unknown }) => {
        fake.writes.push({ key: row.key, value: row.value });
        if (!fake.error) fake.rows = [...fake.rows.filter(item => item.key !== row.key), { key: row.key, value: row.value, updated_at: null }];
        return { error: fake.error };
      },
    }),
  }),
}));

const { carbonAdminState, carbonAnswerKey, myCarbon, saveCarbonSetup, saveMyCarbon, sendToGroup } = await import("./carbon");
const { EMPTY_CARBON_SETUP } = await import("@/lib/pra-wam/carbon");
const setup = { settings: { nights: 2, mealsPerPerson: 6 }, trip: { from: "Kantor", to: "Venue", mode: "mobil", km: 25, perVehicle: 6, roundTrip: true }, formOpen: true };
const answer = (own: unknown) => ({ own, bottles: 1, laptopHours: 2, phoneCharges: 1, answeredAt: "2026-11-24T01:00:00Z" });
const motor = { from: "Magelang", mode: "motor", km: 40, roundTrip: true };

beforeEach(() => {
  fake.error = null;
  fake.writes = [];
  fake.rows = [
    { key: "mission_journey", value: { rooms: { A: "A3", B: "B1" }, people: [{ name: "Ani Satu", dept: "Dept", room: "A" }, { name: "Ina Dua", dept: "Dept", room: "A" }, { name: "Budi Tiga", room: "B" }], bod: [{ name: "Bima Dir" }, { name: "Ani Satu" }] }, updated_at: null },
    { key: "carbon_setup", value: setup, updated_at: "2026-11-24T02:00:00Z" },
    { key: carbonAnswerKey("INA DUA"), value: answer(motor), updated_at: null },
    { key: carbonAnswerKey("ANI SATU"), value: { broken: true }, updated_at: null },
  ];
});

describe("Jejak karbon (Admin Pra WAM)", () => {
  it("keys each participant's row plainly, within pw_settings' key rule", () => {
    expect(carbonAnswerKey("INA DUA")).toMatch(/^carbon_[0-9a-f]{32}$/);
    expect(carbonAnswerKey("INA DUA")).not.toBe(carbonAnswerKey("ANI SATU"));
    expect(carbonAnswerKey("INA DUA")).toMatch(/^[a-z0-9_]{2,40}$/);
  });

  it("reads the setup, the people with their room code and roommates, and good answers only", async () => {
    const state = await carbonAdminState();
    expect(state).toMatchObject({ setup, saved: true, migrated: true, updatedAt: "2026-11-24T02:00:00Z" });
    expect(state.people.map(person => [person.id, person.room, person.occupants, !!person.travel])).toEqual([["ANI SATU", "A3", 2, false], ["INA DUA", "A3", 2, true], ["BUDI TIGA", "B1", 1, false], ["BIMA DIR", "BoD", 1, false]]);
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

  it("sends someone back to the group, keeping their other answers, in their own row", async () => {
    await sendToGroup("INA DUA");
    expect(fake.writes).toEqual([{ key: carbonAnswerKey("INA DUA"), value: expect.objectContaining({ own: null, bottles: 1 }) }]);
    await expect(sendToGroup("BUDI TIGA")).rejects.toThrow(/sudah ikut rombongan/);
  });
});

describe("Jejak karbon (peserta)", () => {
  it("gives a listed person their setup, room size and own answer; nobody else gets a card", async () => {
    expect(await myCarbon({ name: " ina  dua " })).toMatchObject({ setup, occupants: 2, travel: { own: motor, bottles: 1 } });
    expect(await myCarbon({ name: "Budi Tiga" })).toMatchObject({ occupants: 1, travel: null });
    expect(await myCarbon({ name: "Orang Lain" })).toBeNull();
  });

  it("gives a BoD a card too, in a room of their own (listed once even when also in the room list)", async () => {
    expect(await myCarbon({ name: "Bima Dir" })).toMatchObject({ occupants: 1, travel: null });
    await saveMyCarbon({ name: "Bima Dir" }, { own: null, bottles: 1, laptopHours: 2, phoneCharges: 1 });
    expect(fake.writes.map(write => write.key)).toEqual([carbonAnswerKey("BIMA DIR")]);
    expect((await carbonAdminState()).people.filter(person => person.id === "ANI SATU")).toHaveLength(1);
  });

  it("shows no card until the panitia set a trip that can be counted", async () => {
    fake.rows = fake.rows.map(row => row.key === "carbon_setup" ? { ...row, value: EMPTY_CARBON_SETUP } : row);
    expect(await myCarbon({ name: "Ina Dua" })).toBeNull();
    await expect(saveMyCarbon({ name: "Ina Dua" }, { own: null, bottles: 0, laptopHours: 0, phoneCharges: 0 })).rejects.toThrow(/belum mengisi perjalanan/);
  });

  it("saves only the person's own row, and two people never overwrite each other", async () => {
    const saved = await saveMyCarbon({ name: "Budi Tiga" }, { own: { from: " Sleman ", mode: "motor", km: 15, roundTrip: false }, bottles: 2, laptopHours: 3, phoneCharges: 1 });
    expect(saved).toMatchObject({ own: { from: "Sleman", km: 15 }, bottles: 2 });
    await saveMyCarbon({ name: "Ani Satu" }, { own: null, bottles: 0, laptopHours: 1, phoneCharges: 0 });
    expect(fake.writes.map(write => write.key)).toEqual([carbonAnswerKey("BUDI TIGA"), carbonAnswerKey("ANI SATU")]);
    const people = (await carbonAdminState()).people;
    expect(people.map(person => [person.id, person.travel?.bottles ?? null, person.travel?.own?.from ?? null])).toEqual([["ANI SATU", 0, null], ["INA DUA", 1, "Magelang"], ["BUDI TIGA", 2, "Sleman"], ["BIMA DIR", null, null]]);
  });

  it("refuses someone not in the list, and a closed form", async () => {
    await expect(saveMyCarbon({ name: "Orang Lain" }, { own: null, bottles: 0, laptopHours: 0, phoneCharges: 0 })).rejects.toThrow(/belum dibuka/);
    fake.rows = fake.rows.map(row => row.key === "carbon_setup" ? { ...row, value: { ...setup, formOpen: false } } : row);
    await expect(saveMyCarbon({ name: "Ina Dua" }, { own: null, bottles: 0, laptopHours: 0, phoneCharges: 0 })).rejects.toThrow(/ditutup/);
    expect(fake.writes).toEqual([]);
  });
});
