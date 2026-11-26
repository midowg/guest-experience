import "server-only";
import type { Ice, Sugar, Temperature } from "@/lib/coffee/menu";
import { orderNo, type MeetingOrder, type MyOrder, type OrderKind, type QueueItem, type QueueOrder, type QuotaGroup, type Status } from "@/lib/coffee/types";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";

/*
 * Werkudara Coffee's tables (migration 202612010001), read and written with the service role only.
 * Before the migration runs every read and write answers 503 with the migration's name, so the
 * pages can say what waits instead of failing.
 */

export const COFFEE_MIGRATION = "202612010001_coffee.sql";
type DbError = { code?: string; message?: string };

/**
 * The table or the function is not there yet, by the database's own code. Anything else that names
 * a coffee_ table (no permission, a mistyped column, a broken rule) is a fault, not a waiting migration.
 */
export const missing = (error: DbError): boolean => ["42P01", "PGRST205", "42883", "PGRST202"].includes(error.code ?? "");
export const waitingForMigration = () => new ServiceError(503, `Werkudara Coffee menunggu migrasi ${COFFEE_MIGRATION}.`);

const known: Record<string, [number, string]> = {
  COFFEE_QUOTA_FULL: [409, "Jatah bulan ini sudah habis."],
  COFFEE_NOT_EMPLOYEE: [422, "Karyawan tidak ditemukan atau sudah tidak aktif."],
  COFFEE_UNDO_EXPIRED: [409, "Sudah lewat batas waktu untuk mengurungkan."],
  COFFEE_NOT_FOUND: [404, "Pesanan tidak ditemukan. Muat ulang halaman."],
  COFFEE_INVALID: [422, "Isian pesanan tidak sesuai. Muat ulang halaman lalu coba lagi."],
  COFFEE_KEY_REUSED: [409, "Kiriman ini sudah pernah diproses. Muat ulang halaman, lalu kirim lagi bila masih perlu."],
  COFFEE_PARENT_CLOSED: [409, "Pesanan awal sudah tidak bisa ditambah. Buat pesanan baru."],
  COFFEE_NOT_MANUAL: [409, "Hanya catatan manual yang bisa dibatalkan."],
  COFFEE_ALREADY_CANCELLED: [409, "Catatan ini sudah dibatalkan."],
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

export const ORDER_COLUMNS = "id,kind,number,round,parent_id,employee_id,person_name,person_group,person_position,person_bu,room,room_spot,guest,guest_count,status,reject_note,processed_by,processed_label,processed_at,created_label,manual,ordered_at,"
  + "coffee_order_items(id,for_whom,employee_id,person_name,person_group,person_position,person_bu,guest_name,drink_slug,drink_other,temperature,sugar,ice,qty,sort)";

type ItemRow = {
  id: string; for_whom: QueueItem["for"]; employee_id: string | null; person_name: string | null; person_group: QuotaGroup | null; person_position: string | null; person_bu: string | null; guest_name?: string | null;
  drink_slug: string; drink_other: string | null; temperature: Temperature; sugar: Sugar; ice: Ice; qty: number; sort: number;
};
export type OrderRow = {
  id: string; kind: OrderKind; number: number; round: number; parent_id: string | null; employee_id: string; person_name: string; person_group: QuotaGroup | null;
  person_position: string | null; person_bu: string | null; room: string | null; room_spot: string | null; guest: string | null; guest_count: number | null; status: Status;
  reject_note: string | null; processed_by: string | null; processed_label: string | null; processed_at: string | null; created_label: string | null; manual: boolean;
  ordered_at: string; coffee_order_items?: ItemRow[] | null;
};

/** Postgres writes "+00:00", JavaScript "Z": one form, so moments compare as text too. */
const moment = (value: string) => new Date(value).toISOString();

export function toOrder(row: OrderRow): QueueOrder {
  const items = [...(row.coffee_order_items ?? [])].sort((a, b) => a.sort - b.sort).map((item): QueueItem => ({
    id: item.id, for: item.for_whom, qty: item.qty, slug: item.drink_slug, ...(item.drink_other ? { other: item.drink_other } : {}),
    temperature: item.temperature, sugar: item.sugar, ice: item.ice,
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
    slug: drink?.slug ?? "", ...(drink?.other ? { other: drink.other } : {}), temperature: drink?.temperature ?? "panas", sugar: drink?.sugar ?? "Normal", ice: drink?.ice ?? "Normal",
    ...(claimNo ? { claimNo } : {}),
  };
}

export function toMeetingOrder(order: QueueOrder): MeetingOrder {
  return {
    id: order.id, no: order.no, number: order.number, round: order.round, parentId: order.parentId, room: order.room, spot: order.spot, guest: order.guest,
    guestCount: order.guestCount, status: order.status, rejectNote: order.rejectNote, orderedAt: order.orderedAt, items: order.items, sentBy: order.sentBy,
    pic: { id: order.person.id, name: order.person.name }, processedLabel: order.processed?.label ?? "", processedAt: order.processed?.at ?? null,
  };
}

export async function orderById(id: string): Promise<QueueOrder | null> {
  const { data, error } = await db().from("coffee_orders").select(ORDER_COLUMNS).eq("id", id).maybeSingle();
  if (error) coffeeError(error);
  return data ? toOrder(data as unknown as OrderRow) : null;
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
