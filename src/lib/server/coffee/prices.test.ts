import { beforeEach, describe, expect, it, vi } from "vitest";
import { drinkSchema, meetingSchema } from "@/lib/coffee/schemas";
import { STARTING_PRICES } from "@/lib/coffee/money";
import type { Member } from "../pra-wam/session";
import { fakeDb, PEOPLE, seedPeople } from "./fake-db";

/*
 * F9: the price of each drink (Menu), kept on every order line, and what happens before the price
 * migration has run. Against the in-memory stand-in (fake-db.ts). Made-up people, made-up prices.
 */
let db = fakeDb();
vi.mock("server-only", () => ({}));
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => db.client }));

const { adminMenu, createDrink, updateDrink } = await import("./menu");
const { forgetMenu, priceReady, readMenu } = await import("./store");
const { gaMenu, gaState, submitMeeting } = await import("./meetings");
const { myState, submitClaim } = await import("./claims");
const { queue } = await import("./queue");
const dewi = { employeeId: PEOPLE.dewi, label: "Dewi" };
const now = new Date("2026-11-27T03:00:00Z");
const bagas = { id: PEOPLE.bagas, name: "Contoh Bagas Saputra", nickname: "Bagas", category: "dw", roles: [] } as unknown as Member;
const rina = { id: PEOPLE.rina, name: "Contoh Rina Putri", nickname: "Rina", category: "karyawan", roles: [] } as unknown as Member;
const drink = (more: object = {}) => drinkSchema.parse({ name: "Teh Tarik", description: "", group: "non-kopi", temperatures: ["es", "panas"], ...more });
const row = (slug: string) => db.rows("coffee_drinks").find(item => item.slug === slug)!;
const key = (n: number) => `dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12, "0")}`;
const meeting = (n: number) => meetingSchema.parse({
  room: "Kaliya Limasan", picId: PEOPLE.rina, guest: "Contoh PT", guestCount: 2, key: key(n),
  items: [{ for: "tamu", slug: "kopi-susu", qty: 2, temperature: "panas", sugar: "Normal", ice: "Normal" }, { for: "tim", personId: PEOPLE.fajar, slug: "americano", qty: 1, temperature: "panas", sugar: "Normal", ice: "Normal" }],
});

beforeEach(() => { forgetMenu(true); db = fakeDb(); seedPeople(db); db.state.now = now; });

describe("a drink's price in Menu", () => {
  it("is empty until filled in, and lists as null", async () => {
    const menu = await adminMenu();
    expect(menu.prices).toBe(true);
    expect(menu.drinks.every(item => item.price === null)).toBe(true);
  });

  it("is saved with a new drink and with a change, and cleared by null; leaving it out changes nothing", async () => {
    const added = await createDrink(drink({ price: 9500 }), dewi, now);
    expect(added.price).toBe(9500);
    expect(row("teh-tarik").price).toBe(9500);
    expect((await updateDrink("teh-tarik", drink({ price: 10_000 }), dewi, now)).price).toBe(10_000);
    expect((await updateDrink("teh-tarik", drink(), dewi, now)).price).toBe(10_000);
    expect((await updateDrink("teh-tarik", drink({ price: null }), dewi, now)).price).toBeNull();
    expect(row("teh-tarik").price).toBeNull();
    expect((await createDrink(drink({ name: "Teh Manis" }), dewi, now)).price).toBeNull();
  });

  it("is a whole number of rupiah between 0 and 10.000.000", () => {
    const refused = (price: unknown) => drinkSchema.safeParse({ name: "X", group: "kopi", temperatures: ["panas"], price }).success;
    expect([0, 8000, 10_000_000, null, undefined].map(refused)).toEqual([true, true, true, true, true]);
    expect([-1, 8000.5, 10_000_001, "8000", Number.NaN].map(refused)).toEqual([false, false, false, false, false]);
    const message = drinkSchema.safeParse({ name: "X", group: "kopi", temperatures: ["panas"], price: -500 });
    expect(message.success ? "" : message.error.issues[0].message).toBe("Harga tidak boleh negatif.");
  });

  it("never reaches the employee app or the GA tablet", async () => {
    for (const slug of Object.keys(STARTING_PRICES)) row(slug).price = STARTING_PRICES[slug];
    forgetMenu();
    expect(JSON.stringify(await readMenu())).not.toMatch(/price|harga/i);
    expect(JSON.stringify(await gaMenu())).not.toMatch(/price|harga/i);
    await submitMeeting(bagas, meeting(1), now);
    expect(JSON.stringify(await gaState(bagas, now))).not.toMatch(/price|Price/);
    expect(JSON.stringify((await submitMeeting(bagas, meeting(2), now)).order)).not.toMatch(/price|Price/);
    await submitClaim(rina, { slug: "americano", temperature: "panas", sugar: "Normal", ice: "Normal", key: key(3) } as never, now);
    expect(JSON.stringify(await myState(rina, now))).not.toMatch(/price|Price/);
  });
});

describe("the price kept on every order line", () => {
  it("is the drink's price at the moment of ordering, for a claim and for every line of a meeting", async () => {
    row("americano").price = 8000; row("kopi-susu").price = 6900;
    forgetMenu();
    await submitClaim(rina, { slug: "americano", temperature: "panas", sugar: "Normal", ice: "Normal", key: key(1) } as never, now);
    await submitMeeting(bagas, meeting(2), now);
    expect(db.rows("coffee_order_items").map(item => [item.drink_slug, item.unit_price])).toEqual([["americano", 8000], ["kopi-susu", 6900], ["americano", 8000]]);
  });

  it("is not touched by a later price change, and a drink without a price keeps none", async () => {
    row("americano").price = 8000;
    await submitClaim(rina, { slug: "americano", temperature: "panas", sugar: "Normal", ice: "Normal", key: key(1) } as never, now);
    await submitClaim(rina, { slug: "espresso", temperature: "panas", sugar: "Normal", ice: "Normal", key: key(2) } as never, now);
    row("americano").price = 9000; row("espresso").price = 8900;
    expect(db.rows("coffee_order_items").map(item => [item.drink_slug, item.unit_price])).toEqual([["americano", 8000], ["espresso", null]]);
    await submitClaim(rina, { slug: "espresso", temperature: "panas", sugar: "Normal", ice: "Normal", key: key(3) } as never, now);
    expect(db.rows("coffee_order_items").map(item => item.unit_price)).toEqual([8000, null, 8900]);
  });

  it("reaches the pengelola's queue, never the GA tablet's view of the same order", async () => {
    row("kopi-susu").price = 6900; row("americano").price = 8000;
    await submitMeeting(bagas, meeting(1), now);
    const waiting = (await queue(dewi, now)).waiting[0];
    expect(waiting.items.map(item => item.unitPrice)).toEqual([6900, 8000]);
    expect((await gaState(bagas, now)).today[0].items.every(item => !("unitPrice" in item))).toBe(true);
  });
});

describe("before migration 202612050001", () => {
  beforeEach(() => { db.state.priceMigrated = false; forgetMenu(true); });

  it("reads no price column: drinks list without a price and the menu says prices wait", async () => {
    const menu = await adminMenu();
    expect(menu.ready).toBe(true);
    expect(menu.prices).toBe(false);
    expect(menu.drinks.every(item => item.price === null)).toBe(true);
    expect(await priceReady()).toBe(false);
  });

  it("still saves everything else, with the price column left out", async () => {
    expect((await createDrink(drink(), dewi, now)).price).toBeNull();
    expect((await updateDrink("teh-tarik", drink({ name: "Teh Tarik Dingin", price: null }), dewi, now)).name).toBe("Teh Tarik Dingin");
    expect((await updateDrink("teh-tarik", drink({ name: "Teh Tarik Dingin" }), dewi, now)).price).toBeNull();
  });

  it("answers 503 with the migration's name when a price is saved, and changes nothing", async () => {
    const waits = { status: 503, message: "Harga minuman menunggu migrasi 202612050001_coffee_price.sql." };
    await expect(createDrink(drink({ price: 9000 }), dewi, now)).rejects.toMatchObject(waits);
    await expect(updateDrink("kopi-susu", drink({ name: "Kopi Susu", price: 7000 }), dewi, now)).rejects.toMatchObject(waits);
    expect(db.rows("coffee_drinks").some(item => item.slug === "teh-tarik")).toBe(false);
    expect(row("kopi-susu").name).toBe("Kopi Susu");
  });

  it("keeps ordering and the queue working, and an order carries no price", async () => {
    await submitClaim(rina, { slug: "americano", temperature: "panas", sugar: "Normal", ice: "Normal", key: key(1) } as never, now);
    await submitMeeting(bagas, meeting(2), now);
    expect(db.rows("coffee_order_items").every(item => !("unit_price" in item))).toBe(true);
    const waiting = (await queue(dewi, now)).waiting;
    expect(waiting).toHaveLength(2);
    expect(waiting.flatMap(order => order.items).every(item => item.unitPrice === undefined)).toBe(true);
  });

  it("notices the migration by itself once it has run", async () => {
    expect(await priceReady(1_000)).toBe(false);
    db.state.priceMigrated = true;
    // Asked again after half a minute, not before.
    expect(await priceReady(10_000)).toBe(false);
    expect(await priceReady(40_000)).toBe(true);
    db.state.priceMigrated = false;
    // Remembered for good once it is there.
    expect(await priceReady(90_000)).toBe(true);
  });
});
