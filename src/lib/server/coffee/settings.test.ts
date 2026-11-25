import { beforeEach, expect, it, vi } from "vitest";
import { fakeDb, PEOPLE, seedPeople } from "./fake-db";

/* Pengaturan (the quotas, who holds access) and the people pickers against the in-memory stand-in. */
let db = fakeDb();
vi.mock("server-only", () => ({}));
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => db.client }));

const { readSettings, saveSettings } = await import("./settings");
const { activePeople, holders } = await import("./people");
const dewi = { employeeId: PEOPLE.dewi, label: "Dewi" };

beforeEach(() => { db = fakeDb(); seedPeople(db); });

it("reads and saves the quotas, with who changed them", async () => {
  expect(await readSettings()).toEqual({ karyawan: 4, ga: 2, intern: 2 });
  expect(await saveSettings({ karyawan: 6, ga: 3, intern: 0 }, dewi, new Date("2026-11-25T03:00:00Z"))).toEqual({ karyawan: 6, ga: 3, intern: 0 });
  expect(db.rows("coffee_settings")).toEqual([{ id: 1, quota_karyawan: 6, quota_ga: 3, quota_intern: 0, updated_at: "2026-11-25T03:00:00.000Z", updated_label: "Dewi" }]);
  expect(await readSettings()).toEqual({ karyawan: 6, ga: 3, intern: 0 });
});

it("falls back to the owner's starting values while the row or the migration is missing, but never saves then", async () => {
  db.state.tables.coffee_settings = [];
  expect(await readSettings()).toEqual({ karyawan: 4, ga: 2, intern: 2 });
  db.state.migrated = false;
  expect(await readSettings()).toEqual({ karyawan: 4, ga: 2, intern: 2 });
  await expect(readSettings(true)).rejects.toMatchObject({ status: 503, message: "Werkudara Coffee menunggu migrasi 202612010001_coffee.sql." });
  await expect(saveSettings({ karyawan: 6, ga: 3, intern: 0 }, dewi)).rejects.toMatchObject({ status: 503 });
});

it("lists the active people by name with their quota group, and the month's use when asked", async () => {
  const people = await activePeople();
  expect(people.map(person => [person.name, person.nickname, person.group, person.bu])).toEqual([
    ["Contoh Bagas Saputra", "Bagas", "ga", "WNS"], ["Contoh Dewi Lestari", "Dewi", "karyawan", "TEE"], ["Contoh Fajar Nugroho", "Fajar", "intern", "CoE"], ["Contoh Rina Putri", "Rina", "karyawan", "WNS"],
  ]);
  expect(people[0].used).toBeUndefined();
  const item = { slug: "espresso", temperature: "panas", sugar: "Normal", ice: "Normal" };
  for (const [key, at] of [["a", "2026-11-03T02:00:00.000Z"], ["b", "2026-11-04T02:00:00.000Z"], ["c", "2026-10-04T02:00:00.000Z"]]) {
    await db.client.rpc("coffee_submit_claim", { p_employee: PEOPLE.rina, p_item: item, p_at: at, p_manual: false, p_actor: PEOPLE.rina, p_actor_label: "Rina", p_key: `eeeeeeee-eeee-4eee-8eee-00000000000${key}` });
  }
  db.rows("coffee_orders")[1].status = "batal";
  expect((await activePeople("2026-11")).map(person => person.used)).toEqual([0, 0, 0, 1]);
  expect((await activePeople("2026-10")).map(person => person.used)).toEqual([0, 0, 0, 1]);
});

it("names who holds the Werkudara Coffee grant", async () => {
  db.rows("admin_grants").push({ employee_id: PEOPLE.rina, apps: ["hr"] }, { employee_id: PEOPLE.keluar, apps: ["coffee"] });
  expect(await holders()).toEqual([{ id: PEOPLE.dewi, name: "Contoh Dewi Lestari", position: "Contoh karyawan" }]);
  db.state.tables.admin_grants = [];
  expect(await holders()).toEqual([]);
});
