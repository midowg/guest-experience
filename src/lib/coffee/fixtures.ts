import type { QueueItem, QueueOrder } from "./types";

/* Made-up orders for the tests of the pure Coffee logic ("Contoh ..." people only). */

export const person = (id: string, name: string, group: "karyawan" | "ga" | "intern" = "karyawan", bu = "WNS", position = "Contoh Staf") => ({ id, name, group, position, bu });
export const item = (id: string, kind: QueueItem["for"], slug: string, more: Partial<QueueItem> = {}): QueueItem =>
  ({ id, for: kind, qty: 1, slug, temperature: "panas", sugar: "Normal", ice: "Normal", person: null, ...more });

export function claim(id: string, number: number, who: ReturnType<typeof person>, slug: string, more: Partial<QueueOrder> = {}): QueueOrder {
  return {
    id, kind: "klaim", no: `K-${number}`, number, round: 1, parentId: null, person: who, room: "", spot: null, guest: "", guestCount: null,
    status: "diproses", rejectNote: "", processed: null, sentBy: who.name, manual: false, orderedAt: "2026-11-25T02:12:00.000Z", items: [item(`${id}-a`, "klaim", slug)], ...more,
  };
}

export function meeting(id: string, number: number, pic: ReturnType<typeof person>, items: QueueItem[], more: Partial<QueueOrder> = {}): QueueOrder {
  const round = more.round ?? 1;
  return {
    id, kind: "rapat", no: `T-${String(number).padStart(4, "0")}${round > 1 ? `-${round}` : ""}`, number, round, parentId: null, person: pic, room: "Kaliya Limasan", spot: "limasan",
    guest: "Contoh PT Sinar", guestCount: 5, status: "diproses", rejectNote: "", processed: null, sentBy: "Contoh Bagas", manual: false, orderedAt: "2026-11-25T02:40:00.000Z", items, ...more,
  };
}
