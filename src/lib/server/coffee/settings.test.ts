import { beforeEach, expect, it, vi } from "vitest";
import { fakeDb, PEOPLE, seedPeople } from "./fake-db";

/* Pengaturan (the quotas, who holds access) and the people pickers against the in-memory stand-in. */
let db = fakeDb();
vi.mock("server-only", () => ({}));
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => db.client }));

const { drinkSettings, readOptions, readSettings, saveOptions, saveSettings } = await import("./settings");
const { forgetMenu } = await import("./store");
const { activePeople, holders } = await import("./people");
const dewi = { employeeId: PEOPLE.dewi, label: "Dewi" };

beforeEach(() => { db = fakeDb(); seedPeople(db); forgetMenu(true); });

it("reads and saves the quotas, with who changed them", async () => {
  expect(await readSettings()).toEqual({ karyawan: 4, ga: 2, intern: 2 });
  expect(await saveSettings({ karyawan: 6, ga: 3, intern: 0 }, dewi, new Date("2026-11-25T03:00:00Z"))).toEqual({ karyawan: 6, ga: 3, intern: 0 });
  expect(db.rows("coffee_settings")).toMatchObject([{ id: 1, quota_karyawan: 6, quota_ga: 3, quota_intern: 0, updated_at: "2026-11-25T03:00:00.000Z", updated_label: "Dewi" }]);
  // The option switches sit in the same row and are not touched by saving the quotas.
  expect(db.rows("coffee_settings")[0]).toMatchObject({ opt_klaim_suhu: false, opt_tamu_gula: true });
  expect(await readSettings()).toEqual({ karyawan: 6, ga: 3, intern: 0 });
});

it("falls back to the owner's starting values while the row or the migration is missing, but never saves then", async () => {
  db.state.tables.coffee_settings = [];
  expect(await readSettings()).toEqual({ karyawan: 4, ga: 2, intern: 2 });
  db.state.migrated = false;
  expect(await readSettings()).toEqual({ karyawan: 4, ga: 2, intern: 2 });
  await expect(readSettings(true)).rejects.toMatchObject({ status: 503, message: "WG Coffee menunggu migrasi 202612010001_coffee.sql." });
  await expect(saveSettings({ karyawan: 6, ga: 3, intern: 0 }, dewi)).rejects.toMatchObject({ status: 503 });
});

const ALL = { suhu: true, gula: true, es: true }, NONE = { suhu: false, gula: false, es: false };

it("F6 reads what each audience is asked: by default a claim nothing, the team and guests everything", async () => {
  expect(await readOptions()).toEqual({ ready: true, options: { klaim: NONE, tim: ALL, tamu: ALL } });
  // A row that lacks the switches (or no row at all) reads as the defaults.
  db.state.tables.coffee_settings = [{ id: 1, quota_karyawan: 4, quota_ga: 2, quota_intern: 2 }];
  expect((await readOptions()).options).toEqual({ klaim: NONE, tim: ALL, tamu: ALL });
  db.state.tables.coffee_settings = [];
  expect((await readOptions()).options).toEqual({ klaim: NONE, tim: ALL, tamu: ALL });
});

it("F6 saves the switches with who changed them, never takaran es without the temperature, and leaves the quotas alone", async () => {
  const saved = await saveOptions({ klaim: { suhu: false, gula: true, es: true }, tim: NONE, tamu: { suhu: true, gula: false, es: true } }, dewi, new Date("2026-11-26T03:00:00Z"));
  expect(saved).toEqual({ klaim: { suhu: false, gula: true, es: false }, tim: NONE, tamu: { suhu: true, gula: false, es: true } });
  expect(db.rows("coffee_settings")[0]).toMatchObject({ opt_klaim_gula: true, opt_klaim_es: false, opt_tim_suhu: false, opt_tamu_gula: false, options_at: "2026-11-26T03:00:00.000Z", options_label: "Dewi", quota_karyawan: 4 });
  expect((await readOptions()).options).toEqual(saved);
  // A row someone wrote by hand with es on and suhu off still reads as "es off".
  Object.assign(db.rows("coffee_settings")[0], { opt_tim_suhu: false, opt_tim_es: true });
  expect((await readOptions()).options.tim.es).toBe(false);
});

it("F6 before migration 202612020001: everyone is asked everything, the menu is the code's, and the switches cannot be saved", async () => {
  db.state.menuMigrated = false;
  db.state.tables.coffee_settings = [{ id: 1, quota_karyawan: 4, quota_ga: 2, quota_intern: 2 }];
  expect(await readOptions()).toEqual({ ready: false, options: { klaim: ALL, tim: ALL, tamu: ALL } });
  await expect(saveOptions({ klaim: NONE, tim: ALL, tamu: ALL }, dewi)).rejects.toMatchObject({ status: 503, message: "Fitur ini menunggu migrasi 202612020001_coffee_menu.sql." });
  const drinks = await drinkSettings();
  expect(drinks).toMatchObject({ optionsReady: false, options: { klaim: ALL } });
  expect(drinks.menu.map(drink => drink.slug)).toHaveLength(15);
  // The quotas still read and save as before.
  expect(await saveSettings({ karyawan: 5, ga: 2, intern: 2 }, dewi)).toEqual({ karyawan: 5, ga: 2, intern: 2 });
  expect(db.state.calls.filter(call => call.endsWith(":coffee_drinks")).length).toBe(1);
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

it("names who holds the WG Coffee grant", async () => {
  db.rows("admin_grants").push({ employee_id: PEOPLE.rina, apps: ["hr"] }, { employee_id: PEOPLE.keluar, apps: ["coffee"] });
  expect(await holders()).toEqual([{ id: PEOPLE.dewi, name: "Contoh Dewi Lestari", position: "Contoh karyawan" }]);
  db.state.tables.admin_grants = [];
  expect(await holders()).toEqual([]);
});
