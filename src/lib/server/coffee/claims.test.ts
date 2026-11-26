import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Member } from "../pra-wam/session";
import { fakeDb, PEOPLE, seedPeople } from "./fake-db";

/* An employee's claims against the in-memory stand-in (fake-db.ts). Made-up people. */
let db = fakeDb();
vi.mock("server-only", () => ({}));
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => db.client }));
vi.mock("./session", () => ({ holdsCoffeeGrant: async (id: string) => db.rows("admin_grants").some(row => row.employee_id === id && (row.apps as string[]).includes("coffee")) }));

const { cancelClaim, myState, submitClaim } = await import("./claims");
const { MENU_KEEP_MS, forgetMenu, menuReady, readMenu } = await import("./store");
const member = (id: string, nickname: string, category: Member["category"], roles: Member["roles"] = []) => ({ id, name: `Contoh ${nickname}`, nickname, category, roles }) as Member;
const rina = member(PEOPLE.rina, "Rina", "karyawan");
const fajar = member(PEOPLE.fajar, "Fajar", "intern");
const now = new Date("2026-11-25T03:00:00Z");
const key = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;
const latte = { slug: "cafe-latte", temperature: "es", sugar: "Sedikit", ice: "Normal" } as const;

beforeEach(() => { forgetMenu(true); db = fakeDb(); seedPeople(db); db.state.now = now; });

describe("a claim", () => {
  it("is saved for the one signed in, as being processed, and takes a place in the quota", async () => {
    const { order, me } = await submitClaim(rina, { ...latte, key: key(1) }, now);
    // By default a claim is asked nothing (employees serve themselves): what the browser sent for the options is dropped.
    expect(order).toMatchObject({ no: "K-418", status: "diproses", slug: "cafe-latte", name: "Café Latte", temperature: null, sugar: null, ice: null, claimNo: 1, manual: false });
    expect(order.photo).toMatch(/cafe-latte\.jpg$/);
    expect(db.rows("coffee_order_items")[0]).toMatchObject({ drink_slug: "cafe-latte", drink_name: "Café Latte", temperature: null, sugar: null, ice: null });
    expect(me).toEqual({ id: PEOPLE.rina, name: "Rina", group: "karyawan", quota: 4, used: 1, left: 3, month: "2026-11" });
    expect(db.rows("coffee_orders")[0]).toMatchObject({ employee_id: PEOPLE.rina, person_name: "Contoh Rina Putri", person_group: "karyawan", person_bu: "WNS", created_label: "Rina", quota_month: "2026-11" });
  });

  it("is one claim when the same key is sent twice", async () => {
    const first = await submitClaim(rina, { ...latte, key: key(1) }, now);
    const second = await submitClaim(rina, { ...latte, key: key(1) }, now);
    expect(second.order.id).toBe(first.order.id);
    expect(db.rows("coffee_orders")).toHaveLength(1);
    expect(second.me.used).toBe(1);
  });

  it("is refused with 409 when the month's quota is full, per group", async () => {
    for (let n = 1; n <= 2; n++) await submitClaim(fajar, { ...latte, key: key(n) }, now);
    await expect(submitClaim(fajar, { ...latte, key: key(3) }, now)).rejects.toMatchObject({ status: 409, message: "Jatah bulan ini sudah habis." });
    for (let n = 11; n <= 14; n++) await submitClaim(rina, { ...latte, key: key(n) }, now);
    await expect(submitClaim(rina, { ...latte, key: key(15) }, now)).rejects.toMatchObject({ status: 409 });
    expect(db.rows("coffee_orders")).toHaveLength(6);
  });

  it("follows the quota the pengelola set, and a new WIB month starts again", async () => {
    db.rows("coffee_settings")[0].quota_intern = 1;
    await submitClaim(fajar, { ...latte, key: key(1) }, now);
    await expect(submitClaim(fajar, { ...latte, key: key(2) }, now)).rejects.toMatchObject({ status: 409 });
    // 30 Nov 17.00 UTC is 1 Dec 00.00 WIB.
    const december = new Date("2026-11-30T17:00:00Z");
    db.state.now = december;
    const { me } = await submitClaim(fajar, { ...latte, key: key(3) }, december);
    expect(me).toMatchObject({ month: "2026-12", used: 1, left: 0 });
  });

  it("gives its place back when refused or cancelled, and keeps numbering right", async () => {
    const a = await submitClaim(fajar, { ...latte, key: key(1) }, new Date("2026-11-25T01:00:00Z"));
    const b = await submitClaim(fajar, { ...latte, key: key(2) }, new Date("2026-11-25T02:00:00Z"));
    Object.assign(db.rows("coffee_orders").find(row => row.id === a.order.id)!, { status: "ditolak", reject_note: "Susu habis.", processed_label: "Dewi", processed_at: "2026-11-25T02:30:00.000Z" });
    const state = await myState(fajar, now);
    expect(state.me).toMatchObject({ used: 1, left: 1 });
    expect(state.orders.map(order => [order.id, order.status, order.claimNo])).toEqual([[b.order.id, "diproses", 1], [a.order.id, "ditolak", undefined]]);
    expect(state.orders[1]).toMatchObject({ rejectNote: "Susu habis.", processedLabel: "Dewi" });
    const c = await submitClaim(fajar, { ...latte, key: key(3) }, now);
    expect(c.order.claimNo).toBe(2);
  });

  // Audit: the 23505 branch was never run (the stand-in had no unique index).
  it("is one claim when two sendings of one key meet at the unique index", async () => {
    const first = await submitClaim(rina, { ...latte, key: key(1) }, now);
    db.state.race = true;
    const second = await submitClaim(rina, { ...latte, key: key(1) }, now);
    expect(second.order.id).toBe(first.order.id);
    expect(db.rows("coffee_orders")).toHaveLength(1);
  });

  // Audit S-2: a key belongs to one sending of one person.
  it("never answers with someone else's claim, nor with one already cancelled, for a key used before", async () => {
    const { order } = await submitClaim(rina, { ...latte, key: key(1) }, now);
    const reused = { status: 409, message: "Kiriman ini sudah pernah diproses atau isinya berubah. Periksa pesanan, lalu kirim lagi bila masih perlu." };
    await expect(submitClaim(fajar, { ...latte, key: key(1) }, now)).rejects.toMatchObject(reused);
    db.state.race = true;
    const raced = await submitClaim(fajar, { ...latte, key: key(1) }, now).catch((problem: unknown) => problem);
    expect(raced).toMatchObject({ status: 409 });
    expect(JSON.stringify(raced)).not.toContain("Rina");
    db.state.race = false;
    await cancelClaim(rina, order.id, now);
    await expect(submitClaim(rina, { ...latte, key: key(1) }, now)).rejects.toMatchObject(reused);
    expect(db.rows("coffee_orders")).toHaveLength(1);
    expect((await myState(rina, now)).me.used).toBe(0);
  });

  it("is refused by the database when its time lies ahead, or its drink is off the menu", async () => {
    await expect(submitClaim(rina, { ...latte, key: key(1) }, new Date(now.getTime() + 6 * 60_000))).rejects.toMatchObject({ status: 422, message: "Isian pesanan tidak sesuai. Muat ulang halaman lalu coba lagi." });
    // "lainnya" is for Catat manual only (audit S-6): the function refuses it even when zod is not in front.
    const sent = await db.client.rpc("coffee_submit_claim", { p_employee: PEOPLE.rina, p_item: { slug: "lainnya", other: "Teh tarik", temperature: "panas", sugar: "Normal" }, p_at: now.toISOString(), p_manual: false, p_actor: PEOPLE.rina, p_actor_label: "Rina", p_key: key(2) });
    expect(sent.error).toMatchObject({ message: "COFFEE_INVALID" });
    expect(db.rows("coffee_orders")).toHaveLength(0);
  });

  it("is refused for someone no longer active", async () => {
    await expect(submitClaim(member(PEOPLE.keluar, "Keluar", "karyawan"), { ...latte, key: key(1) }, now)).rejects.toMatchObject({ status: 422 });
  });
});

describe("cancelling", () => {
  it("lets the owner cancel a waiting claim, once", async () => {
    const { order } = await submitClaim(rina, { ...latte, key: key(1) }, now);
    const cancelled = await cancelClaim(rina, order.id, now);
    expect(cancelled.order).toMatchObject({ status: "batal" });
    expect(cancelled.order.claimNo).toBeUndefined();
    expect(cancelled.me).toMatchObject({ used: 0, left: 4 });
    await expect(cancelClaim(rina, order.id, now)).rejects.toMatchObject({ status: 409, message: "Pengajuan ini sudah diproses, tidak bisa dibatalkan." });
  });

  it("never cancels someone else's claim, nor one already processed", async () => {
    const { order } = await submitClaim(rina, { ...latte, key: key(1) }, now);
    await expect(cancelClaim(fajar, order.id, now)).rejects.toMatchObject({ status: 409 });
    expect(db.rows("coffee_orders")[0].status).toBe("diproses");
    db.rows("coffee_orders")[0].status = "selesai";
    await expect(cancelClaim(rina, order.id, now)).rejects.toMatchObject({ status: 409 });
    expect(db.rows("coffee_orders")[0].status).toBe("selesai");
  });
});

describe("what the phone is told", () => {
  it("offers Mode GA and Pengelola only to those who may open them", async () => {
    expect(await myState(rina, now)).toMatchObject({ ga: false, pengelola: false, orders: [] });
    expect(await myState(member(PEOPLE.bagas, "Bagas", "dw"), now)).toMatchObject({ ga: true, pengelola: false, me: { group: "ga", quota: 2 } });
    expect(await myState(member(PEOPLE.rina, "Rina", "karyawan", ["ga"]), now)).toMatchObject({ ga: true, pengelola: false });
    expect(await myState(member(PEOPLE.dewi, "Dewi", "karyawan"), now)).toMatchObject({ ga: true, pengelola: true });
  });

  it("shows only the person's own claims, never a meeting order", async () => {
    await submitClaim(rina, { ...latte, key: key(1) }, now);
    await submitClaim(fajar, { ...latte, key: key(2) }, now);
    db.rows("coffee_orders").push({ ...db.rows("coffee_orders")[0], id: "m1", kind: "rapat", number: 113 });
    const state = await myState(rina, now);
    expect(state.orders).toHaveLength(1);
    expect(JSON.stringify(state)).not.toContain("Fajar");
  });

  it("answers 503 with the migration's name before it runs", async () => {
    db.state.migrated = false;
    await expect(myState(rina, now)).rejects.toMatchObject({ status: 503, message: "WG Coffee menunggu migrasi 202612010001_coffee.sql." });
    await expect(submitClaim(rina, { ...latte, key: key(1) }, now)).rejects.toMatchObject({ status: 503 });
    await expect(cancelClaim(rina, key(9), now)).rejects.toMatchObject({ status: 503 });
  });
});

describe("F6: what a claim is asked, and the menu", () => {
  const ask = (more: object) => Object.assign(db.rows("coffee_settings")[0], more);

  it("hands the phone the menu and what a claim is asked", async () => {
    const state = await myState(rina, now);
    expect(state.options).toEqual({ suhu: false, gula: false, es: false });
    expect(state.menu).toHaveLength(15);
    expect(state.menu[0]).toMatchObject({ slug: "kopi-susu", name: "Kopi Susu", group: "kopi", temperatures: ["panas", "es"], active: true });
    ask({ opt_klaim_suhu: true, opt_klaim_gula: true, opt_klaim_es: true });
    expect((await myState(rina, now)).options).toEqual({ suhu: true, gula: true, es: true });
  });

  it("stores the options the pengelola turned on, and asks for the ones that are missing", async () => {
    ask({ opt_klaim_suhu: true, opt_klaim_gula: true, opt_klaim_es: true });
    const { order } = await submitClaim(rina, { ...latte, ice: "Ekstra", key: key(1) }, now);
    expect(order).toMatchObject({ temperature: "es", sugar: "Sedikit", ice: "Ekstra" });
    const hot = await submitClaim(rina, { slug: "cafe-latte", temperature: "panas", sugar: "Normal", ice: "Ekstra", key: key(2) }, now);
    expect(hot.order).toMatchObject({ temperature: "panas", sugar: "Normal", ice: null });
    expect(db.rows("coffee_order_items")[1]).toMatchObject({ temperature: "panas", ice: null });
    await expect(submitClaim(rina, { slug: "cafe-latte", key: key(3) }, now)).rejects.toMatchObject({ status: 422, fieldErrors: { temperature: ["Pilih panas atau es."] } });
    await expect(submitClaim(rina, { slug: "cafe-latte", temperature: "es", key: key(4) }, now)).rejects.toMatchObject({ status: 422, fieldErrors: { sugar: ["Pilih takaran gula."] } });
    await expect(submitClaim(rina, { slug: "espresso", temperature: "es", sugar: "Normal", key: key(5) }, now)).rejects.toMatchObject({ status: 422, fieldErrors: { temperature: ["Espresso hanya tersedia panas."] } });
    expect(db.rows("coffee_orders")).toHaveLength(2);
    // Gula only: the temperature that was sent is dropped.
    ask({ opt_klaim_suhu: false, opt_klaim_es: false });
    expect((await submitClaim(rina, { ...latte, key: key(6) }, now)).order).toMatchObject({ temperature: null, sugar: "Sedikit", ice: null });
  });

  it("refuses a drink that is hidden or not on the menu, and takes one the pengelola added", async () => {
    Object.assign(db.rows("coffee_drinks").find(drink => drink.slug === "americano")!, { active: false });
    await expect(submitClaim(rina, { slug: "americano", key: key(1) }, now)).rejects.toMatchObject({ status: 409, message: "Minuman ini sudah tidak ada di menu. Muat ulang halaman, lalu pilih yang lain." });
    await expect(submitClaim(rina, { slug: "es-teh-manis", key: key(2) }, now)).rejects.toMatchObject({ status: 409 });
    await expect(submitClaim(rina, { slug: "lainnya", key: key(3) }, now)).rejects.toMatchObject({ status: 409 });
    expect(db.rows("coffee_orders")).toHaveLength(0);
    db.rows("coffee_drinks").push({ slug: "teh-tarik", name: "Teh Tarik", description: "", drink_group: "non-kopi", temperatures: ["panas"], photo_url: null, photo_key: null, sort: 160, active: true });
    forgetMenu();
    const { order } = await submitClaim(rina, { slug: "teh-tarik", key: key(4) }, now);
    expect(order).toMatchObject({ slug: "teh-tarik", name: "Teh Tarik", photo: null });
    expect((await myState(rina, now)).menu.map(drink => drink.slug)).toContain("teh-tarik");
  });

  it("the database has the last word on a drink hidden a moment ago (the kept menu still shows it)", async () => {
    await readMenu();
    Object.assign(db.rows("coffee_drinks").find(drink => drink.slug === "americano")!, { active: false });
    await expect(submitClaim(rina, { slug: "americano", key: key(1) }, now)).rejects.toMatchObject({ status: 409, message: "Minuman ini sudah tidak ada di menu. Muat ulang halaman, lalu pilih yang lain." });
    expect(db.state.calls).toContain("rpc:coffee_submit_claim");
  });

  it("keeps the name and shows no photo for a claim whose drink was renamed, hidden or deleted since", async () => {
    const first = await submitClaim(rina, { slug: "cafe-latte", key: key(1) }, now);
    const second = await submitClaim(rina, { slug: "espresso", key: key(2) }, now);
    Object.assign(db.rows("coffee_drinks").find(drink => drink.slug === "cafe-latte")!, { name: "Latte Susu", active: false, photo_url: "https://contoh.test/latte.webp" });
    db.state.tables.coffee_drinks = db.rows("coffee_drinks").filter(drink => drink.slug !== "espresso");
    forgetMenu();
    const state = await myState(rina, now);
    expect(state.orders.find(order => order.id === first.order.id)).toMatchObject({ name: "Café Latte", photo: "https://contoh.test/latte.webp" });
    expect(state.orders.find(order => order.id === second.order.id)).toMatchObject({ slug: "espresso", name: "Espresso", photo: null });
    expect(state.menu.find(drink => drink.slug === "cafe-latte")).toMatchObject({ name: "Latte Susu", active: false });
  });

  it("keeps the menu for a quarter of a minute, reads it fresh when asked, and forgets it after an edit", async () => {
    const at = 1_000_000;
    expect(await readMenu(false, at)).toHaveLength(15);
    db.rows("coffee_drinks")[0].name = "Kopi Susu Aren";
    expect((await readMenu(false, at + MENU_KEEP_MS - 1))[0].name).toBe("Kopi Susu");
    expect((await readMenu(true, at + 1))[0].name).toBe("Kopi Susu Aren");
    db.rows("coffee_drinks")[0].name = "Kopi Susu Gula Aren";
    expect((await readMenu(false, at + 2))[0].name).toBe("Kopi Susu Aren");
    expect((await readMenu(false, at + 2 + MENU_KEEP_MS))[0].name).toBe("Kopi Susu Gula Aren");
    db.rows("coffee_drinks")[0].name = "Kopi Susu";
    forgetMenu();
    expect((await readMenu(false, at + 3 + MENU_KEEP_MS))[0].name).toBe("Kopi Susu");
  });
});

describe("F6: the app is deployed before migration 202612020001 runs", () => {
  beforeEach(() => {
    db.state.menuMigrated = false;
    db.state.tables.coffee_settings = [{ id: 1, quota_karyawan: 4, quota_ga: 2, quota_intern: 2 }];
    delete db.state.tables.coffee_drinks;
    forgetMenu(true);
  });

  it("works as before: the code's menu, every option asked, the old columns only", async () => {
    const state = await myState(rina, now);
    expect(state.options).toEqual({ suhu: true, gula: true, es: true });
    expect(state.menu.map(drink => drink.slug)).toHaveLength(15);
    const { order } = await submitClaim(rina, { ...latte, key: key(1) }, now);
    expect(order).toMatchObject({ slug: "cafe-latte", name: "Café Latte", temperature: "es", sugar: "Sedikit", ice: "Normal" });
    expect(db.rows("coffee_order_items")[0]).toMatchObject({ temperature: "es", sugar: "Sedikit", ice: "Normal" });
    expect(db.rows("coffee_order_items")[0]).not.toHaveProperty("drink_name");
    // A hot drink still gets the old function's "Normal" in the column; the app never shows it.
    const hot = await submitClaim(rina, { slug: "cafe-latte", temperature: "panas", sugar: "Normal", key: key(2) }, now);
    expect(db.rows("coffee_order_items")[1]).toMatchObject({ temperature: "panas", ice: "Normal" });
    expect(hot.order).toMatchObject({ temperature: "panas", ice: null });
    // Every option is asked, as the old database requires them.
    await expect(submitClaim(rina, { slug: "cafe-latte", key: key(3) }, now)).rejects.toMatchObject({ status: 422 });
    await expect(submitClaim(rina, { slug: "tidak-ada", temperature: "panas", sugar: "Normal", key: key(4) }, now)).rejects.toMatchObject({ status: 409 });
  });

  it("asks once whether the migration ran, then again after half a minute, and remembers a yes for good", async () => {
    const asked = () => db.state.calls.filter(call => call === "select:coffee_drinks").length;
    expect(await menuReady(1_000)).toBe(false);
    expect(await menuReady(20_000)).toBe(false);
    expect(asked()).toBe(1);
    // The owner runs the migration: the app notices by itself.
    db.state.menuMigrated = true;
    db.state.tables.coffee_drinks = [{ slug: "kopi-susu", name: "Kopi Susu", description: "", drink_group: "kopi", temperatures: ["panas", "es"], photo_url: null, photo_key: null, sort: 10, active: true }];
    expect(await menuReady(30_999)).toBe(false);
    expect(await menuReady(31_001)).toBe(true);
    expect(asked()).toBe(2);
    expect(await menuReady(9_999_999)).toBe(true);
    expect(asked()).toBe(2);
    expect((await myState(rina, now)).menu.map(drink => drink.slug)).toEqual(["kopi-susu"]);
  });
});
