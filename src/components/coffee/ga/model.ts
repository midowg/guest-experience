import { drinkBySlug, type Ice, type Sugar, type Temperature } from "@/lib/coffee/menu";
import type { GaState, ItemFor, MeetingOrder, Status } from "@/lib/coffee/types";
import { clock } from "../format";
import type { MeetingBody } from "./api";

/*
 * What GA's tablet works with before anything is sent: the meeting being ordered for (the draft)
 * and its drinks (the lines). Pure, so the screens stay about the screen.
 */

export type GaPerson = GaState["people"][number];
export type LineFor = Exclude<ItemFor, "klaim">;

/** The meeting an order is being written for. `parent`: "Tambah lagi", the first sending of the same meeting. */
export type Draft = {
  room: string;
  spot?: string;
  pic: { id: string; name: string };
  guest?: string;
  guestCount?: number;
  parent?: { id: string; no: string };
};

/** One row of the order panel. */
export type Line = {
  id: string;
  slug: string;
  for: LineFor;
  /** tim: the team member the drink is recorded under. */
  person?: { id: string; name: string };
  /** tamu: the name a guest typed in the menu book, so the cups are not mixed up. Kept on this tablet only. */
  guestName?: string;
  qty: number;
  temperature: Temperature;
  sugar: Sugar;
  ice: Ice;
};

export const MAX_LINES = 40;
export const MAX_QTY = 50;
export const MAX_GUESTS = 500;

let lineSeq = 0;
export const newLineId = () => `l${Date.now().toString(36)}${(lineSeq++).toString(36)}`;

/** A tapped drink: its first temperature, gula Normal. */
export const defaultLine = (slug: string, who: LineFor): Line => ({
  id: newLineId(), slug, for: who, qty: 1, temperature: drinkBySlug(slug)?.temperatures[0] ?? "panas", sugar: "Normal", ice: "Normal",
});

type Counted = { for: ItemFor; qty: number };
export function counts(items: readonly Counted[]) {
  const tamu = items.filter(item => item.for === "tamu").reduce((sum, item) => sum + item.qty, 0);
  const tim = items.filter(item => item.for === "tim").reduce((sum, item) => sum + item.qty, 0);
  return { total: tamu + tim, tamu, tim };
}
/** "6 minuman · Tamu 5 · Tim · rapat 1". */
export function countLabel(items: readonly Counted[]) {
  const { total, tamu, tim } = counts(items);
  return [`${total} minuman`, tamu ? `Tamu ${tamu}` : "", tim ? `Tim · rapat ${tim}` : ""].filter(Boolean).join(" · ");
}

export const STATUS: Record<Status, { label: string; tone: "wait" | "ok" | "no" | "off" }> = {
  diproses: { label: "Diproses", tone: "wait" },
  selesai: { label: "Selesai", tone: "ok" },
  ditolak: { label: "Ditolak", tone: "no" },
  batal: { label: "Dibatalkan", tone: "off" },
};

/** "Selesai diproses oleh Dewi · 09.14". */
export function doneLine(order: MeetingOrder): string {
  const who = order.processedLabel || "pengelola", at = order.processedAt ? ` · ${clock(order.processedAt)}` : "";
  if (order.status === "selesai") return `Selesai diproses oleh ${who}${at}`;
  if (order.status === "ditolak") return `Ditolak oleh ${who}${at}`;
  if (order.status === "batal") return `Dibatalkan oleh ${who}${at}`;
  return "Menunggu pengelola";
}

/** One status per room: anything still waiting wins, then a rejection, then done. */
export function statusOf(list: readonly MeetingOrder[]): Status | undefined {
  return (["diproses", "ditolak", "selesai"] as const).find(status => list.some(order => order.status === status));
}
export function roomStatuses(orders: readonly MeetingOrder[], rooms: GaState["rooms"]): Record<string, Status> {
  const result: Record<string, Status> = {};
  for (const room of rooms) {
    const status = statusOf(orders.filter(order => order.spot === room.spot));
    if (status) result[room.spot] = status;
  }
  return result;
}

/** The first sending of an order's meeting, when today's list still has it. */
export const rootOf = (order: MeetingOrder, today: readonly MeetingOrder[]): MeetingOrder | undefined =>
  order.parentId ? today.find(item => item.id === order.parentId) : order;

/**
 * "Tambah lagi": the next round of the same meeting. The server only adds to a first sending that
 * was not refused or cancelled; for any other one the same room and PIC start a new order instead.
 */
export function nextDraft(order: MeetingOrder, today: readonly MeetingOrder[]): Draft {
  const root = rootOf(order, today);
  const open = root && (root.status === "diproses" || root.status === "selesai");
  const from = root ?? order;
  return {
    room: from.room, spot: from.spot ?? undefined, pic: { id: from.pic.id ?? "", name: from.pic.name },
    guest: from.guest || undefined, guestCount: from.guestCount ?? undefined,
    ...(open ? { parent: { id: root.id, no: root.no } } : {}),
  };
}
/** Whether "Tambah lagi" joins the same meeting (else it starts a replacement order). */
export const canAddTo = (order: MeetingOrder, today: readonly MeetingOrder[]): boolean => Boolean(nextDraft(order, today).parent);

/** What is sent: the server reads room, PIC and guest only for a first sending. */
export function toBody(draft: Draft, lines: readonly Line[], key: string): MeetingBody {
  return {
    room: draft.room, picId: draft.pic.id, guest: draft.guest, guestCount: draft.guestCount, parentId: draft.parent?.id, key,
    items: lines.map(line => ({
      for: line.for, personId: line.for === "tim" ? line.person?.id : undefined, slug: line.slug, temperature: line.temperature, sugar: line.sugar,
      ice: line.temperature === "es" ? line.ice : "Normal", qty: line.qty,
    })),
  };
}

/** "Tamu", "Tamu · Budi", "Tim · rapat · Rina". */
export const lineTag = (who: ItemFor, name?: string | null): string =>
  who === "tim" ? `Tim · rapat${name ? ` · ${name}` : ""}` : `Tamu${name ? ` · ${name}` : ""}`;

export const matches = (person: GaPerson, query: string): boolean =>
  !query.trim() || `${person.name} ${person.position} ${person.bu}`.toLowerCase().includes(query.trim().toLowerCase());
