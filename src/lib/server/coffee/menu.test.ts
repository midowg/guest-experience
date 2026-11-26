import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drinkSchema } from "@/lib/coffee/schemas";
import { fakeDb, PEOPLE, seedPeople } from "./fake-db";

/* The pengelola's Menu (F6) against the in-memory stand-in (fake-db.ts): add, change, order, hide, delete, and the photo. Made-up people. */
let db = fakeDb();
vi.mock("server-only", () => ({}));
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => db.client }));

const { DRINK_PHOTO_MAX_BYTES, DRINK_PHOTO_SIZE, adminMenu, createDrink, deleteDrink, setDrinkPhoto, showDrink, sniffDrinkPhoto, sortDrinks, squarePhoto, updateDrink } = await import("./menu");
const { forgetMenu, readMenu } = await import("./store");
const dewi = { employeeId: PEOPLE.dewi, label: "Dewi" };
const now = new Date("2026-11-26T03:00:00Z");
const drink = (more: object = {}) => drinkSchema.parse({ name: "Teh Tarik", description: "Teh susu yang ditarik.", group: "non-kopi", temperatures: ["es", "panas"], ...more });
const row = (slug: string) => db.rows("coffee_drinks").find(item => item.slug === slug);
const order = async (slug: string) => (await db.client.rpc("coffee_submit_claim", { p_employee: PEOPLE.rina, p_item: { slug }, p_at: now.toISOString(), p_manual: false, p_actor: PEOPLE.rina, p_actor_label: "Rina", p_key: null })).data as string;
/** A real picture, made here: 300 × 200, so the square crop and the resize are the real thing. */
const picture = (format: "png" | "jpeg" | "webp" = "png", width = 300, height = 200) =>
  sharp({ create: { width, height, channels: 3, background: { r: 180, g: 120, b: 60 } } })[format]().toBuffer().then(data => new Uint8Array(data));

beforeEach(() => { forgetMenu(true); db = fakeDb(); seedPeople(db); db.state.now = now; });

describe("the menu, for the pengelola", () => {
  it("lists every drink in order, hidden ones too, with how many orders used each", async () => {
    await order("kopi-susu"); await order("kopi-susu"); await order("espresso");
    row("americano")!.active = false;
    const menu = await adminMenu();
    expect(menu.ready).toBe(true);
    expect(menu.drinks).toHaveLength(15);
    expect(menu.drinks[0]).toMatchObject({ slug: "kopi-susu", name: "Kopi Susu", group: "kopi", temperatures: ["panas", "es"], active: true, sort: 10, orders: 2, uploaded: false });
    expect(menu.drinks[0].photo).toMatch(/kopi-susu\.jpg$/);
    expect(menu.drinks.find(item => item.slug === "americano")).toMatchObject({ active: false, orders: 0 });
    expect(menu.drinks.find(item => item.slug === "espresso")?.orders).toBe(1);
  });

  it("adds a drink at the end, with a slug made from its name, and everyone sees it at once", async () => {
    await readMenu();
    const added = await createDrink(drink(), dewi, now);
    expect(added).toMatchObject({ slug: "teh-tarik", name: "Teh Tarik", description: "Teh susu yang ditarik.", group: "non-kopi", temperatures: ["panas", "es"], active: true, sort: 160, orders: 0, photo: null, uploaded: false, updatedLabel: "Dewi", updatedAt: now.toISOString() });
    // The kept menu was forgotten: the apps read the new drink without waiting.
    expect((await readMenu()).map(item => item.slug)).toContain("teh-tarik");
    expect(await order("teh-tarik")).toBeTruthy();
  });

  it("gives a second drink of the same name the next slug, also when two pengelola add it at the same moment", async () => {
    expect((await createDrink(drink(), dewi, now)).slug).toBe("teh-tarik");
    expect((await createDrink(drink(), dewi, now)).slug).toBe("teh-tarik-2");
    expect((await createDrink(drink({ name: "Café Latte" }), dewi, now)).slug).toBe("cafe-latte-2");
    // The other pengelola's insert landed between the look and the insert: the primary key refuses, the next number is taken.
    const real = db.client.from;
    let raced = false;
    db.client.from = ((table: string) => {
      const builder = real(table);
      if (table !== "coffee_drinks" || raced) return builder;
      const insert = builder.insert;
      builder.insert = (value: Record<string, unknown>) => { if (!raced && value.slug === "teh-tarik-3") { raced = true; db.rows("coffee_drinks").push({ slug: "teh-tarik-3", name: "Milik orang lain", drink_group: "kopi", temperatures: ["panas"], sort: 999, active: true }); } return insert(value); };
      return builder;
    }) as typeof real;
    expect((await createDrink(drink(), dewi, now)).slug).toBe("teh-tarik-4");
    db.client.from = real;
    // Names that are an address or mean something else never become a slug.
    expect((await createDrink(drink({ name: "Lainnya" }), dewi, now)).slug).toBe("lainnya-1");
    expect((await createDrink(drink({ name: "Urutan" }), dewi, now)).slug).toBe("urutan-1");
    expect((await createDrink(drink({ name: "!!!" }), dewi, now)).slug).toBe("minuman");
  });

  it("changes a drink without touching its slug or the name old orders carry", async () => {
    const old = await order("cafe-latte");
    const changed = await updateDrink("cafe-latte", drink({ name: "Latte Susu", description: "", group: "kopi", temperatures: ["panas"], active: false }), dewi, now);
    expect(changed).toMatchObject({ slug: "cafe-latte", name: "Latte Susu", description: "", temperatures: ["panas"], active: false, orders: 1, updatedLabel: "Dewi" });
    expect(db.rows("coffee_order_items").find(item => item.order_id === old)?.drink_name).toBe("Café Latte");
    await expect(updateDrink("tidak-ada", drink(), dewi, now)).rejects.toMatchObject({ status: 404, message: "Minuman tidak ditemukan. Muat ulang halaman." });
  });

  it("hides a drink (it can no longer be ordered) and shows it again", async () => {
    await readMenu();
    expect(await showDrink("espresso", false, dewi, now)).toMatchObject({ slug: "espresso", active: false });
    expect((await db.client.rpc("coffee_submit_claim", { p_employee: PEOPLE.rina, p_item: { slug: "espresso" }, p_at: now.toISOString(), p_manual: false, p_actor: PEOPLE.rina, p_actor_label: "Rina", p_key: null })).error?.message).toBe("COFFEE_DRINK_GONE");
    expect((await readMenu()).find(item => item.slug === "espresso")?.active).toBe(false);
    expect(await showDrink("espresso", true, dewi, now)).toMatchObject({ active: true });
    await expect(showDrink("tidak-ada", false, dewi, now)).rejects.toMatchObject({ status: 404 });
  });

  it("puts the menu in the order sent, and answers with it", async () => {
    const slugs = (await adminMenu()).drinks.map(item => item.slug).reverse();
    const sorted = await sortDrinks(slugs);
    expect(sorted.drinks.map(item => item.slug)).toEqual(slugs);
    expect(sorted.drinks.map(item => item.sort)).toEqual(slugs.map((_, index) => (index + 1) * 10));
    expect((await readMenu()).map(item => item.slug)).toEqual(slugs);
  });

  it("deletes only a drink no order ever used; one that was ordered can only be hidden", async () => {
    await order("kopi-susu");
    await expect(deleteDrink("kopi-susu")).rejects.toMatchObject({ status: 409, message: "Minuman ini sudah pernah dipesan, jadi tidak bisa dihapus. Sembunyikan saja supaya tidak bisa dipesan lagi." });
    expect(row("kopi-susu")).toBeTruthy();
    await deleteDrink("classic-tea");
    expect(row("classic-tea")).toBeUndefined();
    expect((await readMenu()).map(item => item.slug)).not.toContain("classic-tea");
    await expect(deleteDrink("classic-tea")).rejects.toMatchObject({ status: 404 });
    // A refused or cancelled order still used the drink: the history must keep reading right.
    const id = await order("espresso");
    db.rows("coffee_orders").find(item => item.id === id)!.status = "batal";
    await expect(deleteDrink("espresso")).rejects.toMatchObject({ status: 409 });
  });
});

describe("a drink's photo", () => {
  it("knows a photo by its first bytes, never by its name: no SVG, no HTML, no empty file", async () => {
    expect(sniffDrinkPhoto(await picture("png"))).toBe("image/png");
    expect(sniffDrinkPhoto(await picture("jpeg"))).toBe("image/jpeg");
    expect(sniffDrinkPhoto(await picture("webp"))).toBe("image/webp");
    const text = (value: string) => new TextEncoder().encode(value);
    for (const fake of [text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), text("<!doctype html><html>"), text("GIF89a"), new Uint8Array(0)]) expect(sniffDrinkPhoto(fake)).toBeNull();
  });

  it("is cropped to a centred square of 640 px and stored as WebP without its EXIF", async () => {
    const square = await squarePhoto(await picture("jpeg", 1200, 800));
    const meta = await sharp(square).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", DRINK_PHOTO_SIZE, DRINK_PHOTO_SIZE]);
    expect(meta.exif).toBeUndefined();
    await expect(squarePhoto(new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]))).rejects.toMatchObject({ status: 422, fieldErrors: { photo: ["Foto tidak bisa dibaca. Pakai berkas JPG, PNG, atau WebP yang lain."] } });
  });

  it("is stored under a name of the server's own, the drink points at it, and the upload it replaces is removed", async () => {
    await readMenu();
    const first = await setDrinkPhoto("kopi-susu", await picture(), dewi, now);
    expect(first).toMatchObject({ slug: "kopi-susu", uploaded: true, updatedLabel: "Dewi" });
    expect(first.photo).toMatch(/^https:\/\/storage\.contoh\.test\/event-photos\/coffee\/drinks\/kopi-susu-[0-9a-f-]{36}\.webp$/);
    const firstKey = row("kopi-susu")!.photo_key as string;
    expect([...db.state.files.keys()]).toEqual([firstKey]);
    expect(db.state.files.get(firstKey)).toMatchObject({ bucket: "event-photos", type: "image/webp" });
    // The first 15 drinks' static photos are files of the app, not ours to remove.
    expect(db.state.calls.filter(call => call.startsWith("remove:"))).toEqual([]);
    expect((await readMenu())[0].photo).toBe(first.photo);
    const second = await setDrinkPhoto("kopi-susu", await picture("webp"), dewi, now);
    expect(second.photo).not.toBe(first.photo);
    expect([...db.state.files.keys()]).toEqual([row("kopi-susu")!.photo_key]);
    expect(db.state.calls).toContain(`remove:event-photos/${firstKey}`);
  });

  it("refuses what is not a photo, what is too big, and a drink that is not there, and leaves nothing in storage", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await expect(setDrinkPhoto("kopi-susu", svg, dewi, now)).rejects.toMatchObject({ status: 415, fieldErrors: { photo: ["Format foto tidak dikenali. Pakai JPG, PNG, atau WebP."] } });
    await expect(setDrinkPhoto("kopi-susu", new Uint8Array(0), dewi, now)).rejects.toMatchObject({ status: 422 });
    const big = new Uint8Array(DRINK_PHOTO_MAX_BYTES + 1);
    big.set([0xff, 0xd8, 0xff]);
    await expect(setDrinkPhoto("kopi-susu", big, dewi, now)).rejects.toMatchObject({ status: 413, message: "Ukuran foto paling besar 5 MB." });
    await expect(setDrinkPhoto("tidak-ada", await picture(), dewi, now)).rejects.toMatchObject({ status: 404 });
    expect(db.state.files.size).toBe(0);
    expect(row("kopi-susu")!.photo_key).toBeNull();
    // Storage that is not set up says so, and the drink keeps its photo.
    db.state.storageFails = "Bucket not found";
    await expect(setDrinkPhoto("kopi-susu", await picture(), dewi, now)).rejects.toMatchObject({ status: 503, message: "Penyimpanan foto belum disiapkan. Jalankan migrasi penyimpanan terlebih dahulu." });
    expect(row("kopi-susu")!.photo_url).toMatch(/kopi-susu\.jpg$/);
  });

  it("goes with its drink when the drink is deleted, and only ever removes files of Coffee's own folder", async () => {
    await createDrink(drink(), dewi, now);
    await setDrinkPhoto("teh-tarik", await picture(), dewi, now);
    const key = row("teh-tarik")!.photo_key as string;
    await deleteDrink("teh-tarik");
    expect(db.state.files.has(key)).toBe(false);
    // A row that points outside the folder (written by hand) is not followed.
    await createDrink(drink({ name: "Wedang Jahe" }), dewi, now);
    row("wedang-jahe")!.photo_key = "event-photos-lain/2026/foto-acara.webp";
    await deleteDrink("wedang-jahe");
    expect(db.state.calls.filter(call => call.includes("foto-acara"))).toEqual([]);
  });
});

describe("before migration 202612020001", () => {
  beforeEach(() => {
    db.state.menuMigrated = false;
    delete db.state.tables.coffee_drinks;
    forgetMenu(true);
  });
  it("shows the code's 15 drinks, to look at only", async () => {
    const menu = await adminMenu();
    expect(menu.ready).toBe(false);
    expect(menu.drinks.map(item => item.slug)).toHaveLength(15);
    expect(menu.drinks[0]).toMatchObject({ slug: "kopi-susu", sort: 10, orders: 0, uploaded: false });
  });
  it("answers every change with 503 and the migration's name, and stores nothing", async () => {
    const waits = { status: 503, message: "Fitur ini menunggu migrasi 202612020001_coffee_menu.sql." };
    await expect(createDrink(drink(), dewi, now)).rejects.toMatchObject(waits);
    await expect(updateDrink("kopi-susu", drink(), dewi, now)).rejects.toMatchObject(waits);
    await expect(showDrink("kopi-susu", false, dewi, now)).rejects.toMatchObject(waits);
    await expect(sortDrinks(["kopi-susu"])).rejects.toMatchObject(waits);
    await expect(deleteDrink("kopi-susu")).rejects.toMatchObject(waits);
    await expect(setDrinkPhoto("kopi-susu", await picture(), dewi, now)).rejects.toMatchObject(waits);
    expect(db.state.files.size).toBe(0);
  });
});
