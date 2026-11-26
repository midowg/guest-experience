import { beforeEach, expect, it, vi } from "vitest";
import { fakeDb, PEOPLE, seedPeople } from "./fake-db";

/* PIN GA (audit F3-04) against the in-memory stand-in: only a salted hash is kept, and nothing but yes or no is ever told. */
let db = fakeDb();
vi.mock("server-only", () => ({}));
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => db.client }));

const { checkGaPin, gaPinSet, hashPin, pinMatches, saveGaPin } = await import("./pin");
const { readSettings, saveSettings } = await import("./settings");
const dewi = { employeeId: PEOPLE.dewi, label: "Dewi" };

beforeEach(() => { db = fakeDb(); seedPeople(db); process.env.RATE_LIMIT_SECRET = "x".repeat(40); });

it("keeps a salted hash, never the PIN, and tells only whether one is set", async () => {
  expect(await gaPinSet()).toBe(false);
  expect(await checkGaPin("4821")).toEqual({ set: false, ok: false });
  await saveGaPin("4821", dewi, new Date("2026-11-26T03:00:00Z"));
  const row = db.rows("coffee_settings")[0];
  expect(JSON.stringify(row)).not.toContain("4821");
  expect(row.ga_pin_hash).toMatch(/^s1\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  expect(row).toMatchObject({ ga_pin_at: "2026-11-26T03:00:00.000Z", ga_pin_label: "Dewi", quota_karyawan: 4 });
  expect(await gaPinSet()).toBe(true);
  expect(await checkGaPin("4821")).toEqual({ set: true, ok: true });
  for (const wrong of ["4822", "0000", "482", "48211", "", "abcd", " 4821"]) expect(await checkGaPin(wrong), wrong).toEqual({ set: true, ok: false });
});

it("salts every hash, and ties it to the server's secret", () => {
  const first = hashPin("0042"), second = hashPin("0042");
  expect(first).not.toBe(second);
  expect(pinMatches("0042", first)).toBe(true);
  expect(pinMatches("0042", second)).toBe(true);
  expect(pinMatches("0043", first)).toBe(false);
  for (const broken of [null, undefined, "", "4821", "s1$abc", "s0$00$00", `s1$${"0".repeat(32)}$zz`]) expect(pinMatches("0042", broken)).toBe(false);
  // The same hash is worthless with another secret (a leaked table alone does not give the PIN away in ten thousand tries).
  process.env.RATE_LIMIT_SECRET = "z".repeat(40);
  expect(pinMatches("0042", first)).toBe(false);
});

it("replaces the PIN, and saving the quotas leaves it alone (and the other way round)", async () => {
  await saveGaPin("1111", dewi);
  await saveSettings({ karyawan: 6, ga: 3, intern: 1 }, dewi);
  expect(await checkGaPin("1111")).toEqual({ set: true, ok: true });
  await saveGaPin("2222", dewi);
  expect(await checkGaPin("1111")).toEqual({ set: true, ok: false });
  expect(await checkGaPin("2222")).toEqual({ set: true, ok: true });
  expect(await readSettings()).toEqual({ karyawan: 6, ga: 3, intern: 1 });
  // What the quotas' reader gives out carries nothing of the PIN.
  expect(JSON.stringify(await readSettings())).not.toMatch(/pin|s1\$/i);
});

it("has no PIN before the migration ran, and cannot save one then", async () => {
  db.state.migrated = false;
  expect(await gaPinSet()).toBe(false);
  expect(await checkGaPin("4821")).toEqual({ set: false, ok: false });
  await expect(gaPinSet(true)).rejects.toMatchObject({ status: 503 });
  await expect(saveGaPin("4821", dewi)).rejects.toMatchObject({ status: 503, message: expect.stringContaining("202612010001_coffee.sql") });
});
