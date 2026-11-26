import { firstName } from "./access";
import { GROUP_LABEL, drinkLabel, optionsLabel } from "./menu";
import type { QueueItem, QueueOrder } from "./types";

/*
 * "Salin rincian": an order as plain text, for the pengelola to keep beside JumpStart while buying
 * by hand. The same words as the approved prototype.
 */

const line = (item: QueueItem) => `${item.qty}× ${drinkLabel(item.slug, item.other)} · ${optionsLabel(item.temperature, item.sugar, item.ice)}`;

export function claimText(order: QueueOrder): string {
  const group = order.person.group ? ` (${GROUP_LABEL[order.person.group]})` : "";
  return [`Klaim ${order.no} · ${firstName(order.person.name)}${group}`, ...order.items.map(line)].join("\n");
}

export function meetingText(order: QueueOrder): string {
  // A guest who gave a name in the menu book: "(Tamu · Budi)", so the cup can be marked.
  const row = (item: QueueItem) => `- ${line(item)}${item.person ? ` (${item.person.name})` : item.guestName ? ` (Tamu · ${item.guestName})` : ""}`;
  const guests = order.items.filter(item => item.for === "tamu");
  const team = order.items.filter(item => item.for === "tim");
  const total = order.items.reduce((sum, item) => sum + item.qty, 0);
  const number = order.round > 1 ? order.no.replace(/-\d+$/, "") : order.no;
  return [
    `Rapat ${number}${order.round > 1 ? ` (tambahan ke-${order.round})` : ""} · ${order.room || "Tanpa ruangan"} · PIC ${order.person.name}`,
    ...(guests.length ? [`Tamu${order.guest ? ` ${order.guest}` : ""}${order.guestCount ? ` (${order.guestCount} orang)` : ""}:`, ...guests.map(row)] : []),
    ...(team.length ? ["Tim · rapat:", ...team.map(row)] : []),
    `Total ${total} minuman`,
  ].join("\n");
}

export const orderText = (order: QueueOrder): string => order.kind === "klaim" ? claimText(order) : meetingText(order);
