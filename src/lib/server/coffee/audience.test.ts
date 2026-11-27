import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DRINKS, GUEST_BOOK_ONLY, MACHINE_MENU, offeredTo } from "@/lib/coffee/menu";
import { drinkSchema, manualSchema, meetingSchema } from "@/lib/coffee/schemas";
import type { Member } from "../pra-wam/session";
import { GUEST_BOOK_ONLY_SLUGS, fakeDb, PEOPLE, seedPeople } from "./fake-db";

/*
 * F7 (27 Nov 2026): where each drink shows, "Buku tamu" and "Menu biasa", against the in-memory
 * stand-in (fake-db.ts): what the readers get, what the server and the database functions refuse,
 * the ticks of the pengelola's Menu, and the app on a database where migration 202612030001 has
 * not run yet. Made-up people.
 */
let db = fakeDb();
vi.mock("server-only", () => ({}));
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => db.client }));
vi.mock("./session", () => ({ holdsCoffeeGrant: async () => false }));

const { myState, submitClaim } = await import("./claims");
const { gaMenu, submitMeeting } = await import("./meetings");
const { adminMenu, createDrink, patchDrink, updateDrink } = await import("./menu");
const { recordManual } = await import("./queue");
const { audienceReady, forgetMenu, menuReady, readMenu } = await import("./store");

const rina = { id: PEOPLE.rina, name: "Contoh Rina Putri", nickname: "Rina", category: "karyawan", roles: [] } as unknown as Member;
const bagas = { id: PEOPLE.bagas, name: "Contoh Bagas Saputra", nickname: "Bagas", category: "dw", roles: [] } as unknown as Member;
const dewi = { employeeId: PEOPLE.dewi, label: "Dewi" };
const now = new Date("2026-11-27T03:00:00Z");
let n = 0;
const key = () => `cccccccc-cccc-4ccc-8ccc-${String(++n).padStart(12, "0")}`;
const row = (slug: string) => db.rows("coffee_drinks").find(item => item.slug === slug)!;
const meeting = (items: object[]) => meetingSchema.parse({ room: "Kaliya Limasan", picId: PEOPLE.rina, key: key(), items });
const guest = (slug: string) => ({ for: "tamu", slug, temperature: "es", sugar: "Normal", ice: "Normal", qty: 1 });
const team = (slug: string) => ({ for: "tim", personId: PEOPLE.fajar, slug, temperature: "es", sugar: "Normal", ice: "Normal", qty: 1 });
const gone = { status: 409, message: "Minuman ini sudah tidak ada di menu. Muat ulang halaman, lalu pilih yang lain." };
/** The ticks as migration 202612030001 leaves them on its first run. */
const applyDefaults = () => { for (const slug of GUEST_BOOK_ONLY_SLUGS) row(slug).in_regular_menu = false; };

beforeEach(() => { forgetMenu(true); db = fakeDb(); seedPeople(db); db.state.now = now; applyDefaults(); });

describe("the owner's starting ticks (27 Nov 2026)", () => {
  const sql = readFileSync(new URL("../../../../supabase/migrations/coffee/202612030003_coffee_menu_audience.sql", import.meta.url), "utf8").replace(/\r\n/g, "\n"); // a Windows checkout has CRLF
  const code = sql.replace(/\/\*[\s\S]*?\*\/|--.*$/gm, "");
  it("are the same three guest-book-only drinks in the code, in the migration and in the stand-in", () => {
    const off = code.match(/set in_regular_menu = false\s+where slug in \(([^)]+)\)/)?.[1].replace(/'|\s/g, "").split(",");
    expect(off).toEqual([...GUEST_BOOK_ONLY]);
    expect(GUEST_BOOK_ONLY_SLUGS).toEqual([...GUEST_BOOK_ONLY]);
    for (const slug of GUEST_BOOK_ONLY) expect(DRINKS.some(drink => drink.slug === slug)).toBe(true);
  });
  it("leave all 15 in the guest book and the 12 the office machine makes in the regular menu", () => {
    expect(offeredTo(MACHINE_MENU, "tamu").map(drink => drink.slug)).toEqual(DRINKS.map(drink => drink.slug));
    expect(offeredTo(MACHINE_MENU, "klaim").map(drink => drink.slug)).toEqual(["kopi-susu", "cappuccino", "cafe-latte", "cafe-mocha", "piccolo-latte", "matcha-espresso", "kopi-hitam", "americano", "espresso", "milk-chocolate", "matcha-latte", "dark-chocolate"]);
    expect(offeredTo(MACHINE_MENU, "tim")).toEqual(offeredTo(MACHINE_MENU, "klaim"));
  });
  it("are written once: only inside the block that adds the columns, and no drink is added or removed", () => {
    expect(code).toMatch(/if not exists \(select 1 from information_schema\.columns where table_schema = 'public' and table_name = 'coffee_drinks' and column_name = 'in_regular_menu'\) then\s+alter table public\.coffee_drinks\s+add column in_guest_book boolean not null default true,\s+add column in_regular_menu boolean not null default true;\s+update public\.coffee_drinks set in_regular_menu = false/);
    expect(code).not.toMatch(/insert into (public\.)?coffee_drinks/i);
    expect(code).not.toMatch(/\bdrop\s+(table|column|function|index|sequence|constraint)\b/i);
    expect(code).not.toMatch(/\btruncate\b|\bdelete\s+from\b/i);
    // The only write to rows that are already there is the one above.
    expect([...code.matchAll(/^\s*update\s+(\S+)\s+set\s+(\w+)/gim)].map(match => `${match[1]}.${match[2]}`)).toEqual(["public.coffee_drinks.in_regular_menu"]);
    expect(code.trim().startsWith("begin;")).toBe(true);
    expect(code.trim().endsWith("commit;")).toBe(true);
  });
  it("keeps the signatures of the two functions it replaces", () => {
    expect(code).toContain("create or replace function public.coffee_submit_claim(\n  p_employee uuid, p_item jsonb, p_at timestamptz, p_manual boolean, p_actor uuid, p_actor_label text, p_key uuid\n) returns uuid");
    expect(code).toContain("create or replace function public.coffee_submit_meeting(p_order jsonb, p_items jsonb, p_key uuid) returns uuid");
  });
});

describe("what the readers get", () => {
  it("every drink says where it shows: the phone, the tablet and the pengelola's Menu", async () => {
    const menu = await readMenu();
    expect(menu.find(drink => drink.slug === "classic-tea")).toMatchObject({ guestBook: true, regular: false });
    expect(menu.find(drink => drink.slug === "kopi-susu")).toMatchObject({ guestBook: true, regular: true });
    expect(offeredTo((await myState(rina, now)).menu, "klaim")).toHaveLength(12);
    expect(offeredTo((await gaMenu()).menu, "tamu")).toHaveLength(15);
    const admin = await adminMenu();
    expect(admin).toMatchObject({ ready: true, places: true });
    expect(admin.drinks.find(drink => drink.slug === "cucumber-ice")).toMatchObject({ guestBook: true, regular: false });
  });
  it("a hidden drink is offered nowhere, whatever is ticked", async () => {
    row("kopi-susu").active = false;
    const menu = await readMenu(true);
    expect(offeredTo(menu, "klaim").some(drink => drink.slug === "kopi-susu")).toBe(false);
    expect(offeredTo(menu, "tamu").some(drink => drink.slug === "kopi-susu")).toBe(false);
  });
});

describe("the server enforces it", () => {
  it("a claim needs a regular-menu drink", async () => {
    await expect(submitClaim(rina, { slug: "classic-tea", key: key() }, now)).rejects.toMatchObject(gone);
    expect(db.rows("coffee_orders")).toHaveLength(0);
    expect((await submitClaim(rina, { slug: "kopi-susu", key: key() }, now)).order).toMatchObject({ slug: "kopi-susu", status: "diproses" });
  });
  it("a guest's line needs a guest-book drink, a team member's a regular-menu drink", async () => {
    row("americano").in_guest_book = false;
    forgetMenu();
    await expect(submitMeeting(bagas, meeting([guest("americano")]), now)).rejects.toMatchObject(gone);
    await expect(submitMeeting(bagas, meeting([guest("kopi-susu"), team("cucumber-ice")]), now)).rejects.toMatchObject(gone);
    expect(db.rows("coffee_orders")).toHaveLength(0);
    const { order } = await submitMeeting(bagas, meeting([guest("cucumber-ice"), team("americano")]), now);
    expect(order.items.map(item => [item.for, item.slug])).toEqual([["tamu", "cucumber-ice"], ["tim", "americano"]]);
  });
  it("a drink with neither tick cannot be ordered by anyone", async () => {
    Object.assign(row("espresso"), { in_guest_book: false, in_regular_menu: false });
    forgetMenu();
    await expect(submitClaim(rina, { slug: "espresso", key: key() }, now)).rejects.toMatchObject(gone);
    await expect(submitMeeting(bagas, meeting([{ ...guest("espresso"), temperature: "panas" }]), now)).rejects.toMatchObject(gone);
    await expect(submitMeeting(bagas, meeting([{ ...team("espresso"), temperature: "panas" }]), now)).rejects.toMatchObject(gone);
  });
  it("Catat manual may record any drink of the menu, whatever its ticks", async () => {
    const manual = (more: object) => manualSchema.parse({ kind: "klaim", employeeId: PEOPLE.rina, date: "2026-11-26", time: "10:00", slug: "classic-tea", key: key(), ...more });
    expect((await recordManual(manual({}), dewi, now)).order).toMatchObject({ status: "selesai", manual: true });
    row("americano").in_guest_book = false;
    forgetMenu();
    expect((await recordManual(manual({ kind: "tamu", slug: "americano", temperature: "panas", sugar: "Normal" }), dewi, now)).order.items[0]).toMatchObject({ for: "tamu", slug: "americano" });
    expect((await recordManual(manual({ kind: "tim", slug: "cucumber-ice", temperature: "es", sugar: "Normal", ice: "Normal" }), dewi, now)).order.items[0]).toMatchObject({ for: "tim", slug: "cucumber-ice" });
  });
});

describe("the database functions enforce it too (a tick taken away a second ago)", () => {
  const claim = (slug: string, manual = false) => db.client.rpc("coffee_submit_claim", { p_employee: PEOPLE.rina, p_item: { slug }, p_at: now.toISOString(), p_manual: manual, p_actor: PEOPLE.rina, p_actor_label: "Rina", p_key: null });
  const send = (items: object[], manual = false) => db.client.rpc("coffee_submit_meeting", { p_order: { pic_id: PEOPLE.rina, room: "Ruang", manual, actor_id: PEOPLE.bagas, actor_label: "Bagas", ordered_at: now.toISOString() }, p_items: items, p_key: null });
  it("claim: regular menu; guest: guest book; team: regular menu; by hand: any", async () => {
    row("americano").in_guest_book = false;
    expect((await claim("classic-tea")).error?.message).toBe("COFFEE_DRINK_GONE");
    expect((await claim("kopi-susu")).error).toBeNull();
    expect((await claim("classic-tea", true)).error).toBeNull();
    expect((await send([{ for: "tamu", slug: "americano" }])).error?.message).toBe("COFFEE_DRINK_GONE");
    expect((await send([{ for: "tim", person_id: PEOPLE.fajar, slug: "classic-tea" }])).error?.message).toBe("COFFEE_DRINK_GONE");
    expect((await send([{ for: "tamu", slug: "classic-tea" }, { for: "tim", person_id: PEOPLE.fajar, slug: "americano" }])).error).toBeNull();
    expect((await send([{ for: "tamu", slug: "americano" }, { for: "tim", person_id: PEOPLE.fajar, slug: "classic-tea" }], true)).error).toBeNull();
  });
});

describe("the ticks in the pengelola's Menu", () => {
  it("change one place at a time, leave the rest alone, and reach everyone at once", async () => {
    await readMenu();
    expect(await patchDrink("classic-tea", { regular: true }, dewi, now)).toMatchObject({ slug: "classic-tea", guestBook: true, regular: true, active: true, updatedLabel: "Dewi" });
    expect((await readMenu()).find(drink => drink.slug === "classic-tea")).toMatchObject({ regular: true });
    expect(await patchDrink("classic-tea", { guestBook: false }, dewi, now)).toMatchObject({ guestBook: false, regular: true });
    expect(row("classic-tea")).toMatchObject({ in_guest_book: false, in_regular_menu: true, active: true, name: "Classic Tea" });
    expect(await patchDrink("classic-tea", { active: false }, dewi, now)).toMatchObject({ active: false, guestBook: false, regular: true });
    await expect(patchDrink("tidak-ada", { regular: false }, dewi, now)).rejects.toMatchObject({ status: 404 });
  });
  it("a new drink starts in both menus unless said otherwise, and the editor saves both ticks", async () => {
    const input = (more: object = {}) => drinkSchema.parse({ name: "Teh Tarik", description: "", group: "non-kopi", temperatures: ["panas", "es"], ...more });
    expect(await createDrink(input(), dewi, now)).toMatchObject({ slug: "teh-tarik", guestBook: true, regular: true });
    expect(await updateDrink("teh-tarik", input({ guestBook: false }), dewi, now)).toMatchObject({ guestBook: false, regular: true });
    expect(await createDrink(input({ name: "Wedang Jahe", regular: false }), dewi, now)).toMatchObject({ slug: "wedang-jahe", guestBook: true, regular: false });
  });
});

describe("the app is deployed before migration 202612030001 runs", () => {
  beforeEach(() => {
    db.state.audienceMigrated = false;
    for (const drink of db.rows("coffee_drinks")) { delete drink.in_guest_book; delete drink.in_regular_menu; }
  });
  it("behaves as before: every drink in both menus, and nothing fails", async () => {
    expect(await menuReady()).toBe(true);
    expect(await audienceReady()).toBe(false);
    const menu = await readMenu();
    expect(menu).toHaveLength(15);
    expect(offeredTo(menu, "klaim")).toHaveLength(15);
    expect(offeredTo(menu, "tamu")).toHaveLength(15);
    expect((await submitClaim(rina, { slug: "classic-tea", key: key() }, now)).order).toMatchObject({ slug: "classic-tea", name: "Classic Tea" });
    expect((await submitMeeting(bagas, meeting([guest("americano"), team("cucumber-ice")]), now)).order.items).toHaveLength(2);
    expect(await adminMenu()).toMatchObject({ ready: true, places: false });
    expect((await adminMenu()).drinks.every(drink => drink.guestBook && drink.regular)).toBe(true);
  });
  it("asks once whether the columns are there, again after half a minute, and remembers a yes for good", async () => {
    const asked = () => db.state.calls.filter(call => call === "select:coffee_drinks").length;
    expect(await audienceReady(1_000)).toBe(false);
    expect(await audienceReady(20_000)).toBe(false);
    expect(await menuReady(25_000)).toBe(true);
    // Two questions the first time: the columns (not there), then the table on its own (there).
    expect(asked()).toBe(2);
    // The owner runs the migration: the app notices by itself.
    db.state.audienceMigrated = true;
    for (const drink of db.rows("coffee_drinks")) Object.assign(drink, { in_guest_book: true, in_regular_menu: !GUEST_BOOK_ONLY_SLUGS.includes(drink.slug as string) });
    expect(await audienceReady(40_000)).toBe(true);
    expect(await audienceReady(10_000_000)).toBe(true);
    expect(asked()).toBe(3);
    forgetMenu();
    expect(offeredTo(await readMenu(true), "klaim")).toHaveLength(12);
    await expect(submitClaim(rina, { slug: "classic-tea", key: key() }, now)).rejects.toMatchObject(gone);
  });
  it("a fault with a code of its own on the new columns still reads as: the table is there, the columns are not", async () => {
    const real = db.client.from;
    db.client.from = ((table: string) => {
      const builder = real(table);
      const select = builder.select;
      builder.select = (columns?: string) => {
        if (table === "coffee_drinks" && columns?.includes("in_guest_book")) return { limit: () => Promise.resolve({ data: null, error: { code: "PGRST000", message: "sesuatu yang lain" } }) } as never;
        return select(columns);
      };
      return builder;
    }) as typeof real;
    expect(await menuReady()).toBe(true);
    expect(await audienceReady()).toBe(false);
    expect(await readMenu()).toHaveLength(15);
    expect((await readMenu())[0].name).toBe("Kopi Susu");
  });
  it("the menu can still be changed, but a tick cannot be taken away yet: 503 with the migration's name, nothing stored", async () => {
    const waits = { status: 503, message: "Pilihan Buku tamu dan Menu biasa menunggu migrasi 202612030003_coffee_menu_audience.sql." };
    const input = (more: object = {}) => drinkSchema.parse({ name: "Teh Tarik", description: "", group: "non-kopi", temperatures: ["panas", "es"], ...more });
    expect(await createDrink(input(), dewi, now)).toMatchObject({ slug: "teh-tarik", guestBook: true, regular: true });
    expect(await updateDrink("teh-tarik", input({ name: "Teh Tarik Aceh" }), dewi, now)).toMatchObject({ name: "Teh Tarik Aceh" });
    expect(await patchDrink("teh-tarik", { active: false }, dewi, now)).toMatchObject({ active: false });
    // Ticking what is already on changes nothing and is let through.
    expect(await patchDrink("teh-tarik", { regular: true }, dewi, now)).toMatchObject({ regular: true });
    await expect(patchDrink("teh-tarik", { regular: false }, dewi, now)).rejects.toMatchObject(waits);
    await expect(updateDrink("teh-tarik", input({ guestBook: false }), dewi, now)).rejects.toMatchObject(waits);
    await expect(createDrink(input({ name: "Wedang Jahe", regular: false }), dewi, now)).rejects.toMatchObject(waits);
    expect(row("teh-tarik")).not.toHaveProperty("in_regular_menu");
    expect(db.rows("coffee_drinks").some(drink => drink.slug === "wedang-jahe")).toBe(false);
  });
});
