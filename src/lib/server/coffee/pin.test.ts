import { beforeEach, expect, it, vi } from "vitest";
import { fakeDb, PEOPLE, seedPeople } from "./fake-db";
import { forgetMenu } from "./store";

/* PIN GA (audit F3-04) against the in-memory stand-in: only a salted hash is kept, and nothing but yes or no is ever told. */
let db = fakeDb();
vi.mock("server-only", () => ({}));
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => db.client }));

const { checkGaPin, gaPinSet, hashPin, pinGate, pinMatches, pinWait, saveGaPin, tryGaPin, PIN_LOCKS, PIN_ROUND } = await import("./pin");
const { readSettings, saveSettings } = await import("./settings");
const dewi = { employeeId: PEOPLE.dewi, label: "Dewi" };

beforeEach(() => { forgetMenu(true); db = fakeDb(); seedPeople(db); process.env.RATE_LIMIT_SECRET = "x".repeat(40); });

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

/*
 * Audit F5-05: wrong tries are counted per tablet account, right ones are not; five wrong tries
 * lock the account for a short while that grows (30 s, 1 min, 5 min, 15 min), and the pengelola
 * saving a PIN opens it again. Every try is taken before the PIN is looked at, one at a time.
 */
const T0 = new Date("2026-11-26T03:00:00Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
const attempt = async (who: string, pin: string, when: Date) => tryGaPin(who, pin, await pinGate(who, when), when);
const wrongRound = async (who: string, when: Date) => {
  for (let n = 1; n < PIN_ROUND; n++) expect(await attempt(who, "0000", when)).toEqual({ set: true, ok: false });
  return attempt(who, "0000", when);
};
const tries = () => db.rows("coffee_pin_tries");

it("F5-05 does not count right tries: the GA officer can leave the book as often as needed", async () => {
  await saveGaPin("4821", dewi, T0);
  for (let n = 0; n < 40; n++) expect(await attempt(PEOPLE.bagas, "4821", at(n))).toEqual({ set: true, ok: true });
  expect(tries()).toEqual([]);
  // Four wrong tries and then the right one: nothing is left counted.
  for (let n = 0; n < PIN_ROUND - 1; n++) await attempt(PEOPLE.bagas, "1234", at(60));
  expect(tries()).toMatchObject([{ employee_id: PEOPLE.bagas, fails: PIN_ROUND - 1, level: 0, locked_until: null }]);
  expect(await attempt(PEOPLE.bagas, "4821", at(61))).toEqual({ set: true, ok: true });
  expect(tries()).toEqual([]);
  // The right PIN as the fifth try is right, too.
  for (let n = 0; n < PIN_ROUND - 1; n++) await attempt(PEOPLE.bagas, "1234", at(62));
  expect(await attempt(PEOPLE.bagas, "4821", at(63))).toEqual({ set: true, ok: true });
  expect(tries()).toEqual([]);
});

it("F5-05 locks for thirty seconds after five wrong tries, says how long, and refuses the right PIN meanwhile", async () => {
  await saveGaPin("4821", dewi, T0);
  await expect(wrongRound(PEOPLE.bagas, T0)).rejects.toMatchObject({ status: 429, message: "Terlalu banyak PIN salah. Tunggu 30 detik, lalu coba lagi. Lupa PIN? Minta pengelola menyimpan PIN baru di Pengaturan." });
  // Locked: nothing is checked and nothing is counted, also for the right PIN (or trying would go on through the lock).
  const before = JSON.stringify(tries());
  await expect(attempt(PEOPLE.bagas, "4821", at(10))).rejects.toMatchObject({ status: 429, message: expect.stringContaining("Tunggu 20 detik") });
  await expect(attempt(PEOPLE.bagas, "0000", at(29))).rejects.toMatchObject({ status: 429, message: expect.stringContaining("Tunggu 1 detik") });
  expect(JSON.stringify(tries())).toBe(before);
  // Someone else's account on the same tablet address has its own count.
  expect(await attempt(PEOPLE.dewi, "4821", at(10))).toEqual({ set: true, ok: true });
  // After the wait the right PIN works at once, and the count starts over.
  expect(await attempt(PEOPLE.bagas, "4821", at(30))).toEqual({ set: true, ok: true });
  expect(tries()).toEqual([]);
});

it("F5-05 waits longer each time, up to fifteen minutes, so ten thousand PINs cannot be tried out", async () => {
  await saveGaPin("4821", dewi, T0);
  expect(PIN_LOCKS).toEqual([30, 60, 300, 900]);
  let clock = 0;
  const waits: string[] = [];
  for (let round = 0; round < 6; round++) {
    const failure = await wrongRound(PEOPLE.bagas, at(clock)).catch((problem: Error) => problem);
    waits.push(/Tunggu ([^,]+),/.exec((failure as Error).message)?.[1] ?? "");
    clock += PIN_LOCKS[Math.min(round, PIN_LOCKS.length - 1)];
    // One second early it is still locked.
    await expect(attempt(PEOPLE.bagas, "4821", at(clock - 1))).rejects.toMatchObject({ status: 429 });
  }
  expect(waits).toEqual(["30 detik", "1 menit", "5 menit", "15 menit", "15 menit", "15 menit"]);
  // At five tries per fifteen minutes, all 10,000 PINs take about three weeks of typing without a pause.
  const days = (10_000 / PIN_ROUND) * PIN_LOCKS[PIN_LOCKS.length - 1] / 86_400;
  expect(days).toBeGreaterThan(20);
  // An hour without a wrong try and the waits start short again.
  clock += 3600;
  await expect(wrongRound(PEOPLE.bagas, at(clock))).rejects.toMatchObject({ message: expect.stringContaining("Tunggu 30 detik") });
});

it("F5-05 opens a locked account when the pengelola saves a PIN", async () => {
  await saveGaPin("4821", dewi, T0);
  await expect(wrongRound(PEOPLE.bagas, T0)).rejects.toMatchObject({ status: 429 });
  await saveGaPin("7777", dewi, at(5));
  expect(tries()).toEqual([]);
  expect(await attempt(PEOPLE.bagas, "7777", at(6))).toEqual({ set: true, ok: true });
});

it("F5-05 takes one try at a time: tries sent at the same moment cannot all be checked", async () => {
  await saveGaPin("4821", dewi, T0);
  // Twenty requests that all looked before any of them was counted (a script, not a person).
  const gates = await Promise.all(Array.from({ length: 20 }, () => pinGate(PEOPLE.bagas, T0)));
  const answers = await Promise.all(gates.map((gate, index) => tryGaPin(PEOPLE.bagas, index === 19 ? "4821" : `00${String(index).padStart(2, "0")}`, gate, T0).then(result => result.ok ? "benar" : "salah", (problem: { status?: number }) => `${problem.status}`)));
  // One got its try; the others were sent away unchecked, the right PIN among them.
  expect(answers.filter(answer => answer === "salah")).toHaveLength(1);
  expect(answers.filter(answer => answer === "429")).toHaveLength(19);
  expect(tries()).toMatchObject([{ fails: 1 }]);
});

it("F5-05 says the wait in plain words, and has nothing to count before a PIN is set or the migration ran", async () => {
  expect([1, 20, 59, 60, 61, 300, 900].map(pinWait)).toEqual(["1 detik", "20 detik", "59 detik", "1 menit", "2 menit", "5 menit", "15 menit"]);
  expect(await attempt(PEOPLE.bagas, "4821", T0)).toEqual({ set: false, ok: false });
  expect(tries()).toEqual([]);
  db.state.migrated = false;
  expect(await attempt(PEOPLE.bagas, "4821", T0)).toEqual({ set: false, ok: false });
});
