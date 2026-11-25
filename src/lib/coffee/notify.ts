import type { PushPayload } from "@/lib/pra-wam/push";
import { coffeeAdminPath, coffeePath } from "@/lib/routes";
import { firstName } from "./access";
import { drinkLabel } from "./menu";
import type { QueueOrder } from "./types";

/*
 * What Werkudara Coffee's notifications say (F4 sends them). A new order goes to the pengelola;
 * a decision goes to whoever ordered. A notification shows on a locked screen, so it carries a
 * first name, the drink and the room, and nothing else: no position, BU, guest or note.
 */
export type CoffeePushEvent = "klaim_baru" | "rapat_baru" | "selesai" | "ditolak";

const drinks = (order: QueueOrder) => order.items.reduce((sum, item) => sum + item.qty, 0);
const firstDrink = (order: QueueOrder) => order.items[0] ? drinkLabel(order.items[0].slug, order.items[0].other) : "Minuman";

export function pushFor(event: CoffeePushEvent, order: QueueOrder): PushPayload {
  const who = firstName(order.person.name);
  const room = order.room || "ruang rapat";
  const back = order.kind === "klaim" ? coffeePath.orders : coffeePath.ga;
  switch (event) {
    case "klaim_baru":
      return { title: "Klaim baru", body: `${who} · ${firstDrink(order)}`, url: coffeeAdminPath.home, tag: order.no };
    case "rapat_baru":
      return { title: "Pesanan rapat baru", body: `${room} · ${drinks(order)} minuman`, url: coffeeAdminPath.home, tag: order.no };
    case "selesai":
      return order.kind === "klaim"
        ? { title: "Silakan ambil di mesin", body: `${firstDrink(order)} kamu sudah diproses.`, url: back, tag: order.no }
        : { title: "Pesanan rapat selesai diproses", body: `${room} · ${drinks(order)} minuman`, url: back, tag: order.no };
    case "ditolak":
      return order.kind === "klaim"
        ? { title: "Pengajuan tidak bisa diproses", body: `${firstDrink(order)}. Buka aplikasi untuk melihat catatannya. Jatah kamu tidak berkurang.`, url: back, tag: order.no }
        : { title: "Pesanan rapat tidak bisa diproses", body: `${room}. Buka Mode GA untuk melihat catatannya.`, url: back, tag: order.no };
  }
}
