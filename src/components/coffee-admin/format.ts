import { firstName } from "@/lib/coffee/access";
import { drinkLabel } from "@/lib/coffee/menu";
import { KIND_LABEL, type QueueOrder, type RecapRow, type Status } from "@/lib/coffee/types";
import type { CancelTarget } from "./api";

/* Small words the pengelola's screens share. Pure. */

export const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
/** "November 2026" of "2026-11". */
export const monthName = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
/** The last day of a month, "2026-11" → "2026-11-30". */
export const monthEnd = (month: string) => {
  const [year, number] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(year, number, 0)).getUTCDate()).padStart(2, "0")}`;
};
/** The months a list offers: this one and the eleven before it, newest first. */
export function recentMonths(current: string, count = 12): string[] {
  const months = [current];
  while (months.length < count) {
    const [year, number] = months[months.length - 1].split("-").map(Number);
    months.push(number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, "0")}`);
  }
  return months;
}

/** "baru saja", "12 mnt", "1 j 5 mnt". */
export function waited(iso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} mnt`;
  return `${Math.floor(minutes / 60)} j ${minutes % 60} mnt`;
}

export const STATUS_TONE: Record<Status, "wait" | "ok" | "no" | "off"> = { diproses: "wait", selesai: "ok", ditolak: "no", batal: "off" };
export const drinkCount = (order: QueueOrder) => order.items.reduce((sum, item) => sum + item.qty, 0);
/** "Rina · Café Latte" for a claim, "Kaliya Limasan · 5 minuman" for a meeting. */
export function orderTitle(order: QueueOrder): string {
  if (order.kind === "klaim") {
    const item = order.items[0];
    return `${firstName(order.person.name)} · ${item ? drinkLabel(item.slug, item.other) : "Minuman"}`;
  }
  return `${order.room || "Tanpa ruangan"} · ${drinkCount(order)} minuman`;
}
/** "T-0113 · tambahan ke-2" for a later round of a meeting. */
export const orderNumber = (order: QueueOrder) => order.round > 1 ? `${order.no.replace(/-\d+$/, "")} · tambahan ke-${order.round}` : order.no;

/** A record made by hand that is still in force: the only kind "Batalkan catatan" is offered for. */
export const canCancel = (order: Pick<QueueOrder, "manual" | "status">) => order.manual && order.status === "selesai";
export const cancelOfOrder = (order: QueueOrder): CancelTarget => ({ id: order.id, title: `${orderTitle(order)} · ${order.no}`, claim: order.kind === "klaim" });
export const cancelOfRow = (row: RecapRow): CancelTarget =>
  ({ id: row.orderId, title: `${KIND_LABEL[row.kind]} · ${firstName(row.name)} · ${row.drink} · ${row.no}`, claim: row.kind === "klaim" });

/** The Urungkan window (the server's UNDO_WINDOW_SECONDS); the server has the last word. */
export const UNDO_MS = 300_000;
export const canUndo = (order: QueueOrder, now: number) => !!order.undoable && !!order.processed && now - Date.parse(order.processed.at) < UNDO_MS;

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const area = document.createElement("textarea");
    area.value = text; area.style.position = "fixed"; area.style.opacity = "0";
    document.body.appendChild(area); area.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    area.remove();
    return ok;
  }
}
