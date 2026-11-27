import "server-only";
import { DRINKS, OTHER_DRINK, type Drink, type DrinkGroup, type Ice, type Sugar, type Temperature } from "@/lib/coffee/menu";
import { orderNo, type MeetingOrder, type MyOrder, type OrderKind, type QueueItem, type QueueOrder, type QuotaGroup, type Status } from "@/lib/coffee/types";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";

/*
 * WG Coffee's tables (migration 202612010001), read and written with the service role only.
 * Before the migration runs every read and write answers 503 with the migration's name, so the
 * pages can say what waits instead of failing.
 */

export const COFFEE_MIGRATION = "202612010001_coffee.sql";
/** F6: the menu in the database, the option switches, and the drink's name kept with each order. */
export const COFFEE_MENU_MIGRATION = "202612020001_coffee_menu.sql";
/** F7: where each drink shows (Buku tamu, Menu biasa). */
export const COFFEE_AUDIENCE_MIGRATION = "202612030001_coffee_menu_audience.sql";
type DbError = { code?: string; message?: string };

/**
 * The table or the function is not there yet, by the database's own code. Anything else that names
 * a coffee_ table (no permission, a mistyped column, a broken rule) is a fault, not a waiting migration.
 */
export const missing = (error: DbError): boolean => ["42P01", "PGRST205", "42883", "PGRST202"].includes(error.code ?? "");
export const waitingForMigration = () => new ServiceError(503, `WG Coffee menunggu migrasi ${COFFEE_MIGRATION}.`);

const known: Record<string, [number, string]> = {
  COFFEE_QUOTA_FULL: [409, "Jatah bulan ini sudah habis."],
  COFFEE_NOT_EMPLOYEE: [422, "Karyawan tidak ditemukan atau sudah tidak aktif."],
  COFFEE_UNDO_EXPIRED: [409, "Sudah lewat batas waktu untuk mengurungkan."],
  COFFEE_NOT_FOUND: [404, "Pesanan tidak ditemukan. Muat ulang halaman."],
  COFFEE_INVALID: [422, "Isian pesanan tidak sesuai. Muat ulang halaman lalu coba lagi."],
  COFFEE_KEY_REUSED: [409, "Kiriman ini sudah pernah diproses atau isinya berubah. Periksa pesanan, lalu kirim lagi bila masih perlu."],
  COFFEE_PARENT_CLOSED: [409, "Pesanan awal sudah tidak bisa ditambah. Buat pesanan baru."],
  COFFEE_NOT_MANUAL: [409, "Hanya catatan manual yang bisa dibatalkan."],
  COFFEE_ALREADY_CANCELLED: [409, "Catatan ini sudah dibatalkan."],
  COFFEE_DRINK_GONE: [409, "Minuman ini sudah tidak ada di menu. Muat ulang halaman, lalu pilih yang lain."],
  COFFEE_DRINK_NOT_FOUND: [404, "Minuman tidak ditemukan. Muat ulang halaman."],
  COFFEE_DRINK_USED: [409, "Minuman ini sudah pernah dipesan, jadi tidak bisa dihapus. Sembunyikan saja supaya tidak bisa dipesan lagi."],
};
/** A database error as the answer the person reads. */
export function coffeeError(error: DbError): never {
  const hit = known[(error.message ?? "").trim()];
  if (hit) throw new ServiceError(hit[0], hit[1]);
  if (missing(error)) throw waitingForMigration();
  databaseError({ message: error.message ?? "", code: error.code });
}

export const db = () => createPrivilegedClient();
/** Who acts as pengelola: their employee row when they have one, and the name the claimant sees. */
export type CoffeeActor = { employeeId: string | null; label: string };

/*
 * The app is deployed before migration 202612020001 runs, and must work on both sides of it. One
 * question decides everything that differs (which columns to ask for, where the menu and the
 * options come from): is coffee_drinks there? The migration is one transaction, so the table, the
 * new columns and the new functions arrive together. "Yes" is remembered for good (a migration is
 * not taken back); "no" is asked again after half a minute, so the app notices by itself once the
 * owner has run it. Any other fault reads as "no" for now: the old way still works on the new schema.
 */
const NOT_READY_FOR = 30_000;
/**
 * F7 adds a second step the same way: migration 202612030001 gives coffee_drinks its two "where it
 * shows" columns. `audience` says they are there. One question answers both once that migration
 * has run (and is then remembered for good); while it has not, a second question (once) settles
 * whether the table is there at all, and the app behaves as before F7: every drink in both menus,
 * and the ticks cannot be saved.
 */
let menuSchema: { ready: boolean; audience: boolean; at: number } | null = null;
async function menuSchemaNow(now: number): Promise<{ ready: boolean; audience: boolean; at: number }> {
  if (menuSchema && (menuSchema.audience || now - menuSchema.at < NOT_READY_FOR)) return menuSchema;
  const whole = await db().from("coffee_drinks").select("slug,in_guest_book,in_regular_menu").limit(1);
  if (!whole.error) return menuSchema = { ready: true, audience: true, at: now };
  // No such table: migration 202612020001 has not run either.
  if (missing(whole.error)) return menuSchema = { ready: false, audience: false, at: now };
  // Anything else (42703: the two columns are not there yet) says nothing about the table itself. It
  // was there the last time, or it is asked for on its own: the menu must never fall back to the
  // code's only because the new columns are missing, whatever code that fault comes with.
  if (menuSchema?.ready) return menuSchema = { ready: true, audience: false, at: now };
  const { error } = await db().from("coffee_drinks").select("slug").limit(1);
  return menuSchema = { ready: !error, audience: false, at: now };
}
export async function menuReady(now = Date.now()): Promise<boolean> { return (await menuSchemaNow(now)).ready; }
/** Migration 202612030001 has run: drinks carry where they show, and the database enforces it. */
export async function audienceReady(now = Date.now()): Promise<boolean> { return (await menuSchemaNow(now)).audience; }

const ORDER_HEAD = "id,kind,number,round,parent_id,employee_id,person_name,person_group,person_position,person_bu,room,room_spot,guest,guest_count,status,reject_note,processed_by,processed_label,processed_at,created_label,manual,ordered_at,";
const ITEM_COLUMNS = "id,for_whom,employee_id,person_name,person_group,person_position,person_bu,guest_name,drink_slug,drink_other,temperature,sugar,ice,qty,sort";
/** An order with its drinks; the drink's kept name only once the column exists. */
export const orderColumns = async (): Promise<string> => `${ORDER_HEAD}coffee_order_items(${ITEM_COLUMNS}${await menuReady() ? ",drink_name" : ""})`;

type ItemRow = {
  id: string; for_whom: QueueItem["for"]; employee_id: string | null; person_name: string | null; person_group: QuotaGroup | null; person_position: string | null; person_bu: string | null; guest_name?: string | null;
  drink_slug: string; drink_other: string | null; drink_name?: string | null; temperature: Temperature | null; sugar: Sugar | null; ice: Ice | null; qty: number; sort: number;
};

/*
 * The menu: every drink in its order, hidden ones included (they still show in the history).
 * From coffee_drinks once migration 202612020001 has run, else the 15 drinks of the code. Kept
 * for a quarter of a minute per server instance, so the phones' polling does not ask the database
 * for it each time; an edit in the admin clears it here at once (`forgetMenu`) and reaches the
 * other instances within that quarter minute. The pengelola's own Menu page always reads fresh.
 */
export const MENU_KEEP_MS = 15_000;
const DRINK_COLUMNS = "slug,name,description,drink_group,temperatures,photo_url,active";
const PLACE_COLUMNS = ",in_guest_book,in_regular_menu";
type DrinkRow = { slug: string; name: string; description: string | null; drink_group: DrinkGroup; temperatures: Temperature[] | null; photo_url: string | null; active: boolean; in_guest_book?: boolean | null; in_regular_menu?: boolean | null };
let menuKept: { drinks: Drink[]; at: number } | null = null;
/** Forget what is kept (after an edit; `schema` also asks again whether the migration has run: the tests). */
export function forgetMenu(schema = false) { menuKept = null; if (schema) menuSchema = null; }
export async function readMenu(fresh = false, now = Date.now()): Promise<Drink[]> {
  if (!fresh && menuKept && now - menuKept.at < MENU_KEEP_MS) return menuKept.drinks;
  if (!(await menuReady(now))) return DRINKS;
  // Before migration 202612030001 the two columns are not asked for, and every drink shows in both menus.
  const places = await audienceReady(now);
  const { data, error } = await db().from("coffee_drinks").select(`${DRINK_COLUMNS}${places ? PLACE_COLUMNS : ""}`).order("sort").order("name").limit(500);
  if (error) { if (missing(error)) return DRINKS; coffeeError(error); }
  const drinks = ((data ?? []) as unknown as DrinkRow[]).map((row): Drink => ({
    slug: row.slug, name: row.name, description: row.description ?? "", group: row.drink_group,
    temperatures: row.temperatures?.length ? row.temperatures : ["panas"], photo: row.photo_url, active: row.active,
    guestBook: row.in_guest_book ?? true, regular: row.in_regular_menu ?? true,
  }));
  menuKept = { drinks, at: now };
  return drinks;
}
const codeMenu = new Map(DRINKS.map(drink => [drink.slug, drink]));
export type OrderRow = {
  id: string; kind: OrderKind; number: number; round: number; parent_id: string | null; employee_id: string; person_name: string; person_group: QuotaGroup | null;
  person_position: string | null; person_bu: string | null; room: string | null; room_spot: string | null; guest: string | null; guest_count: number | null; status: Status;
  reject_note: string | null; processed_by: string | null; processed_label: string | null; processed_at: string | null; created_label: string | null; manual: boolean;
  ordered_at: string; coffee_order_items?: ItemRow[] | null;
};

/** Postgres writes "+00:00", JavaScript "Z": one form, so moments compare as text too. */
const moment = (value: string) => new Date(value).toISOString();

/**
 * `menu`: today's menu by slug. A drink's name is the one kept with the order (since F6), else the
 * menu's; its photo is the menu's of now, so a deleted drink (or "lainnya") has none. Options are
 * passed on as stored: null where the audience was not asked.
 */
export function toOrder(row: OrderRow, menu: ReadonlyMap<string, Drink> = codeMenu): QueueOrder {
  const items = [...(row.coffee_order_items ?? [])].sort((a, b) => a.sort - b.sort).map((item): QueueItem => ({
    id: item.id, for: item.for_whom, qty: item.qty, slug: item.drink_slug, ...(item.drink_other ? { other: item.drink_other } : {}),
    ...(item.drink_slug === OTHER_DRINK ? {} : { name: item.drink_name || menu.get(item.drink_slug)?.name || item.drink_slug, photo: menu.get(item.drink_slug)?.photo ?? null }),
    temperature: item.temperature ?? null, sugar: item.sugar ?? null, ice: item.temperature === "es" ? item.ice ?? null : null,
    person: item.for_whom === "tim" ? { id: item.employee_id, name: item.person_name ?? "—", group: item.person_group, position: item.person_position ?? "", bu: item.person_bu ?? "" } : null,
    ...(item.for_whom === "tamu" && item.guest_name ? { guestName: item.guest_name } : {}),
  }));
  return {
    id: row.id, kind: row.kind, no: orderNo(row.kind, row.number, row.round), number: row.number, round: row.round, parentId: row.parent_id,
    person: { id: row.employee_id, name: row.person_name, group: row.person_group, position: row.person_position ?? "", bu: row.person_bu ?? "" },
    room: row.room ?? "", spot: row.room_spot, guest: row.guest ?? "", guestCount: row.guest_count, status: row.status, rejectNote: row.reject_note ?? "",
    processed: row.processed_at ? { employeeId: row.processed_by, label: row.processed_label ?? "Admin", at: moment(row.processed_at) } : null,
    sentBy: row.created_label ?? "", manual: row.manual, orderedAt: moment(row.ordered_at), items,
  };
}

/** A claim as its owner's phone shows it: nothing about who else is in the queue. */
export function toMyOrder(order: QueueOrder, claimNo?: number): MyOrder {
  const drink = order.items[0];
  return {
    id: order.id, no: order.no, status: order.status, orderedAt: order.orderedAt, rejectNote: order.rejectNote,
    processedLabel: order.processed?.label ?? "", processedAt: order.processed?.at ?? null, manual: order.manual,
    slug: drink?.slug ?? "", ...(drink?.other ? { other: drink.other } : {}), ...(drink?.name ? { name: drink.name } : {}), photo: drink?.photo ?? null,
    temperature: drink?.temperature ?? null, sugar: drink?.sugar ?? null, ice: drink?.ice ?? null,
    ...(claimNo ? { claimNo } : {}),
  };
}

export function toMeetingOrder(order: QueueOrder): MeetingOrder {
  return {
    id: order.id, no: order.no, number: order.number, round: order.round, parentId: order.parentId, room: order.room, spot: order.spot, guest: order.guest,
    guestCount: order.guestCount, status: order.status, rejectNote: order.rejectNote, orderedAt: order.orderedAt, items: order.items, sentBy: order.sentBy, manual: order.manual,
    pic: { id: order.person.id, name: order.person.name }, processedLabel: order.processed?.label ?? "", processedAt: order.processed?.at ?? null,
  };
}

/** Rows as orders, with today's menu for the names and photos. */
export async function toOrders(rows: OrderRow[]): Promise<QueueOrder[]> {
  if (!rows.length) return [];
  const menu = new Map((await readMenu()).map(drink => [drink.slug, drink]));
  return rows.map(row => toOrder(row, menu));
}

export async function orderById(id: string): Promise<QueueOrder | null> {
  const { data, error } = await db().from("coffee_orders").select(await orderColumns()).eq("id", id).maybeSingle();
  if (error) coffeeError(error);
  return data ? (await toOrders([data as unknown as OrderRow]))[0] : null;
}

export type CountedClaim = { id: string; kind: "klaim"; status: Status; employeeId: string; orderedAt: string; month: string };
/**
 * The claims that take a place in the quota (diproses, selesai), of these people or of everyone,
 * in these WIB months: what "klaim ke-n" and "terpakai" are worked out from.
 */
export async function countingClaims(filter: { employeeIds?: string[]; months?: string[]; fromMonth?: string; toMonth?: string }): Promise<CountedClaim[]> {
  if (filter.employeeIds && !filter.employeeIds.length) return [];
  const found: CountedClaim[] = [];
  for (let start = 0; ; start += 1000) {
    let query = db().from("coffee_orders").select("id,status,employee_id,ordered_at,quota_month").eq("kind", "klaim").in("status", ["diproses", "selesai"]);
    if (filter.employeeIds) query = query.in("employee_id", filter.employeeIds);
    if (filter.months) query = query.in("quota_month", filter.months);
    if (filter.fromMonth) query = query.gte("quota_month", filter.fromMonth);
    if (filter.toMonth) query = query.lte("quota_month", filter.toMonth);
    const { data, error } = await query.order("ordered_at").order("id").range(start, start + 999);
    if (error) coffeeError(error);
    const rows = (data ?? []) as { id: string; status: Status; employee_id: string; ordered_at: string; quota_month: string }[];
    found.push(...rows.map(row => ({ id: row.id, kind: "klaim" as const, status: row.status, employeeId: row.employee_id, orderedAt: moment(row.ordered_at), month: row.quota_month })));
    if (rows.length < 1000) return found;
  }
}
