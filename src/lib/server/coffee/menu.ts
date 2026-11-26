import "server-only";
import { randomUUID } from "node:crypto";
import { OTHER_DRINK, type Drink, type DrinkGroup, type Temperature } from "@/lib/coffee/menu";
import { slugOf, type DrinkInput } from "@/lib/coffee/schemas";
import type { AdminDrink, MenuData } from "@/lib/coffee/types";
import { ServiceError } from "../config";
import { waitingForMenu } from "./settings";
import { coffeeError, db, forgetMenu, menuReady, missing, readMenu, type CoffeeActor } from "./store";

/*
 * Menu (F6, /admin/coffee → Menu): the pengelola adds, changes, orders, hides and deletes the
 * drinks, and gives each a photo. Rules:
 *   - A drink's slug is made from its first name and never changes; orders point at it.
 *   - Hidden drinks cannot be ordered but stay in the history. A drink that was ordered once can
 *     only be hidden: deleting is for a drink no order ever used (the database decides, under a lock).
 *   - Orders keep the name the drink had when ordered, so a rename never rewrites the past.
 *   - A photo is cropped to a square and stored as WebP; the old upload is removed when it is
 *     replaced. The first 15 drinks use the static files of public/coffee/drinks until then.
 * Every write forgets the kept menu, so the pengelola (and everyone served by this instance) sees
 * it at once; other instances follow within a quarter of a minute (store.ts, MENU_KEEP_MS).
 * Before migration 202612020001 the menu is the code's, read only: every write answers 503.
 */

const COLUMNS = "slug,name,description,drink_group,temperatures,photo_url,photo_key,sort,active,updated_at,updated_label";
type Row = {
  slug: string; name: string; description: string | null; drink_group: DrinkGroup; temperatures: Temperature[] | null; photo_url: string | null; photo_key: string | null;
  sort: number; active: boolean; updated_at?: string | null; updated_label?: string | null;
};
const toDrink = (row: Row, orders = 0): AdminDrink => ({
  slug: row.slug, name: row.name, description: row.description ?? "", group: row.drink_group, temperatures: row.temperatures?.length ? row.temperatures : ["panas"],
  photo: row.photo_url, active: row.active, sort: row.sort, orders, uploaded: !!row.photo_key,
  updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null, updatedLabel: row.updated_label ?? "",
});
/** A fault of the menu's own tables: 503 with the migration's name while it has not run. */
function menuError(error: { code?: string; message?: string }): never {
  if (missing(error) || error.code === "42703") throw waitingForMenu();
  coffeeError(error);
}

/** How many orders ever used each drink: "Hapus" is only offered at zero. */
async function usage(): Promise<Map<string, number>> {
  const { data, error } = await db().rpc("coffee_drink_usage");
  if (error) menuError(error);
  return new Map(((data ?? []) as { slug: string; orders: number | string }[]).map(row => [row.slug, Number(row.orders)]));
}

/** The whole menu for the pengelola, read fresh, with how often each drink was ordered. */
export async function adminMenu(): Promise<MenuData> {
  if (!(await menuReady())) {
    // Before the migration: the code's menu, to look at only.
    const drinks = await readMenu(true);
    return { ready: false, drinks: drinks.map((drink: Drink, index): AdminDrink => ({ ...drink, sort: (index + 1) * 10, orders: 0, uploaded: false, updatedAt: null, updatedLabel: "" })) };
  }
  const [found, used] = await Promise.all([db().from("coffee_drinks").select(COLUMNS).order("sort").order("name").limit(500), usage()]);
  if (found.error) menuError(found.error);
  return { ready: true, drinks: ((found.data ?? []) as unknown as Row[]).map(row => toDrink(row, used.get(row.slug) ?? 0)) };
}

async function ready(): Promise<void> {
  if (!(await menuReady())) throw waitingForMenu();
}
async function one(slug: string): Promise<AdminDrink> {
  const [found, used] = await Promise.all([db().from("coffee_drinks").select(COLUMNS).eq("slug", slug).maybeSingle(), usage()]);
  if (found.error) menuError(found.error);
  if (!found.data) coffeeError({ message: "COFFEE_DRINK_NOT_FOUND" });
  return toDrink(found.data as unknown as Row, used.get(slug) ?? 0);
}
const stamp = (actor: CoffeeActor, now: Date) => ({ updated_at: now.toISOString(), updated_label: actor.label.slice(0, 120) });
const fields = (input: DrinkInput) => ({ name: input.name, description: input.description, drink_group: input.group, temperatures: input.temperatures, active: input.active });

/**
 * Tambah minuman: a new drink at the end of the menu. Its slug comes from the name ("Teh Tarik" →
 * "teh-tarik"); a slug that is taken gets a number ("teh-tarik-2"). Two pengelola adding the same
 * name at once meet at the primary key, and the second one takes the next number.
 */
export async function createDrink(input: DrinkInput, actor: CoffeeActor, now = new Date()): Promise<AdminDrink> {
  await ready();
  const { data: existing, error } = await db().from("coffee_drinks").select("slug,sort").limit(500);
  if (error) menuError(error);
  const rows = (existing ?? []) as { slug: string; sort: number }[];
  const taken = new Set(rows.map(row => row.slug));
  const sort = rows.reduce((last, row) => Math.max(last, row.sort), 0) + 10;
  const base = slugOf(input.name);
  for (let attempt = 1; attempt <= 30; attempt++) {
    const slug = attempt === 1 ? base : `${base.slice(0, 40 - String(attempt).length - 1).replace(/-+$/, "")}-${attempt}`;
    if (taken.has(slug) || slug === OTHER_DRINK) continue;
    const saved = await db().from("coffee_drinks").insert({ slug, ...fields(input), sort, ...stamp(actor, now) }).select(COLUMNS).single();
    if (saved.error?.code === "23505") { taken.add(slug); continue; }
    if (saved.error) menuError(saved.error);
    forgetMenu();
    return toDrink(saved.data as unknown as Row);
  }
  throw new ServiceError(409, "Nama minuman ini sudah terlalu sering dipakai. Pakai nama lain.");
}

/** Ubah minuman: its name, description, group, temperatures, and whether it is shown. The slug stays. */
export async function updateDrink(slug: string, input: DrinkInput, actor: CoffeeActor, now = new Date()): Promise<AdminDrink> {
  await ready();
  const { data, error } = await db().from("coffee_drinks").update({ ...fields(input), ...stamp(actor, now) }).eq("slug", slug).select("slug");
  if (error) menuError(error);
  if (!data?.length) coffeeError({ message: "COFFEE_DRINK_NOT_FOUND" });
  forgetMenu();
  return one(slug);
}

/** Sembunyikan / Tampilkan, on its own (the list's quick switch). */
export async function showDrink(slug: string, active: boolean, actor: CoffeeActor, now = new Date()): Promise<AdminDrink> {
  await ready();
  const { data, error } = await db().from("coffee_drinks").update({ active, ...stamp(actor, now) }).eq("slug", slug).select("slug");
  if (error) menuError(error);
  if (!data?.length) coffeeError({ message: "COFFEE_DRINK_NOT_FOUND" });
  forgetMenu();
  return one(slug);
}

/** Atur urutan: the whole menu in its new order. Answers the menu as it is afterwards. */
export async function sortDrinks(slugs: string[]): Promise<MenuData> {
  await ready();
  const { error } = await db().rpc("coffee_sort_drinks", { p_slugs: slugs });
  if (error) menuError(error);
  forgetMenu();
  return adminMenu();
}

/**
 * Hapus minuman: only a drink no order ever used (409 otherwise, with the advice to hide it). Its
 * uploaded photo goes with it; a file that cannot be removed is left behind rather than failing
 * the delete that already happened.
 */
export async function deleteDrink(slug: string): Promise<void> {
  await ready();
  const { data, error } = await db().rpc("coffee_delete_drink", { p_slug: slug });
  if (error) menuError(error);
  forgetMenu();
  if (typeof data === "string" && data) await removePhoto(data);
}

/* ---------- photos ---------- */

/** The public bucket the admin's other photos live in (migration storage: event-photos), under a folder of Coffee's own. */
const BUCKET = "event-photos";
const FOLDER = "coffee/drinks";
export const DRINK_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
/** Square, as the menu's cards show it; a 2× phone card is 480 px wide. */
export const DRINK_PHOTO_SIZE = 640;

/** The kind of image, from its first bytes: a renamed file (an SVG, a script) never passes as a photo. */
export function sniffDrinkPhoto(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  const starts = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  const tag = (offset: number, text: string) => [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (tag(0, "RIFF") && tag(8, "WEBP")) return "image/webp";
  return null;
}

/** The photo as it is stored: turned upright, cropped to a centred square, 640 px, WebP, without EXIF. */
export async function squarePhoto(bytes: Uint8Array): Promise<Uint8Array> {
  let sharp: typeof import("sharp").default;
  try { sharp = (await import("sharp")).default; } catch { throw new ServiceError(503, "Pengolah gambar belum tersedia di server ini. Coba lagi nanti."); }
  try {
    const data = await sharp(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), { failOn: "error", limitInputPixels: 40_000_000 })
      .autoOrient().resize({ width: DRINK_PHOTO_SIZE, height: DRINK_PHOTO_SIZE, fit: "cover", position: "centre" }).webp({ quality: 82, effort: 4 }).toBuffer();
    return new Uint8Array(data);
  } catch {
    throw new ServiceError(422, "Periksa kembali isian formulir.", { photo: ["Foto tidak bisa dibaca. Pakai berkas JPG, PNG, atau WebP yang lain."] });
  }
}

async function removePhoto(key: string): Promise<void> {
  // Only files of Coffee's own folder are ever removed, whatever the row says.
  if (!key.startsWith(`${FOLDER}/`)) return;
  try { await db().storage.from(BUCKET).remove([key]); } catch { /* a file left behind is not worth failing for */ }
}

/**
 * Ganti foto: the file is checked by its first bytes (JPEG, PNG or WebP; never SVG), cropped and
 * resized here, stored under a name the server makes up, and the drink points at it. The upload
 * it replaces is removed afterwards; the static photo of one of the first 15 drinks is not a
 * file of ours to remove.
 */
export async function setDrinkPhoto(slug: string, bytes: Uint8Array, actor: CoffeeActor, now = new Date()): Promise<AdminDrink> {
  await ready();
  if (!bytes.byteLength) throw new ServiceError(422, "Periksa kembali isian formulir.", { photo: ["Berkas kosong. Pilih foto lain."] });
  if (bytes.byteLength > DRINK_PHOTO_MAX_BYTES) throw new ServiceError(413, "Ukuran foto paling besar 5 MB.", { photo: ["Ukuran foto paling besar 5 MB."] });
  if (!sniffDrinkPhoto(bytes)) throw new ServiceError(415, "Format foto tidak dikenali. Pakai JPG, PNG, atau WebP.", { photo: ["Format foto tidak dikenali. Pakai JPG, PNG, atau WebP."] });
  const before = await db().from("coffee_drinks").select("slug,photo_key").eq("slug", slug).maybeSingle();
  if (before.error) menuError(before.error);
  if (!before.data) coffeeError({ message: "COFFEE_DRINK_NOT_FOUND" });
  const square = await squarePhoto(bytes);
  const key = `${FOLDER}/${slug}-${randomUUID()}.webp`;
  const storage = db().storage.from(BUCKET);
  const { error: failed } = await storage.upload(key, square, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (failed) {
    if (/bucket/i.test(failed.message)) throw new ServiceError(503, "Penyimpanan foto belum disiapkan. Jalankan migrasi penyimpanan terlebih dahulu.");
    throw new ServiceError(503, "Foto belum bisa disimpan. Coba lagi sebentar.");
  }
  const url = storage.getPublicUrl(key).data.publicUrl;
  const { data, error } = await db().from("coffee_drinks").update({ photo_url: url, photo_key: key, ...stamp(actor, now) }).eq("slug", slug).select("slug");
  if (error || !data?.length) {
    // The drink was not changed: the file just stored belongs to nothing.
    await removePhoto(key);
    if (error) menuError(error);
    coffeeError({ message: "COFFEE_DRINK_NOT_FOUND" });
  }
  forgetMenu();
  const old = (before.data as { photo_key: string | null }).photo_key;
  if (old && old !== key) await removePhoto(old);
  return one(slug);
}
