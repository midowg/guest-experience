import type { PushPayload, PushSupport } from "@/lib/pra-wam/push";
import { coffeeAdminPath, coffeePath } from "@/lib/routes";
import { firstName } from "./access";
import { drinkLabel } from "./menu";
import type { QueueOrder } from "./types";

/*
 * What WG Coffee's notifications say (F4 sends them). A new order goes to the pengelola;
 * a decision goes to whoever ordered. A notification shows on a locked screen, so it carries a
 * first name, the drink and the room, and nothing else: no position, BU, guest, guest's name or
 * the note of a refusal. Who processed it is the name the claimant sees in the app anyway
 * ("Dewi", "Super admin").
 *
 * Where a tap leads: the pengelola to the queue; a claimant to Pesanan saya; whoever sent a
 * meeting order from Mode GA to that order on the tablet; the PIC of a meeting (who may not have
 * Mode GA, and whose own list holds claims only) to the app's first page.
 */
export type CoffeePushEvent = "klaim_baru" | "rapat_baru" | "selesai" | "ditolak";
/** Who a decision about a meeting order is told to: the GA officer who sent it, or the PIC. */
export type CoffeePushReader = "pengirim" | "pic";

const drinks = (order: QueueOrder) => order.items.reduce((sum, item) => sum + item.qty, 0);
const firstDrink = (order: QueueOrder) => order.items[0] ? drinkLabel(order.items[0].slug, order.items[0].other) : "Minuman";

export function pushFor(event: CoffeePushEvent, order: QueueOrder, reader: CoffeePushReader = "pengirim"): PushPayload {
  const who = firstName(order.person.name);
  const room = order.room || "Ruang rapat";
  const by = order.processed?.label || "pengelola";
  const back = order.kind === "klaim" ? coffeePath.orders : reader === "pic" ? coffeePath.home : coffeePath.gaOrder(order.id);
  switch (event) {
    case "klaim_baru":
      return { title: "Klaim baru", body: `${who} · ${firstDrink(order)}`, url: coffeeAdminPath.home, tag: order.no };
    case "rapat_baru":
      return { title: "Pesanan rapat baru", body: `${room} · ${drinks(order)} minuman`, url: coffeeAdminPath.home, tag: order.no };
    case "selesai":
      return order.kind === "klaim"
        ? { title: "Silakan ambil di mesin", body: `${firstDrink(order)} kamu selesai diproses oleh ${by}.`, url: back, tag: order.no }
        : { title: "Pesanan rapat siap diambil", body: `${room} · ${drinks(order)} minuman. Selesai diproses oleh ${by}.`, url: back, tag: order.no };
    case "ditolak":
      return order.kind === "klaim"
        ? { title: "Pengajuan tidak bisa diproses", body: `${firstDrink(order)}. Buka aplikasi untuk melihat catatan dari ${by}. Jatah kamu tidak berkurang.`, url: back, tag: order.no }
        : { title: "Pesanan rapat tidak bisa diproses", body: `${room}. Buka ${reader === "pic" ? "aplikasi atau hubungi GA" : "Mode GA"} untuk melihat catatan dari ${by}.`, url: back, tag: order.no };
  }
}

/** "Kirim notifikasi tes": proves this device shows Coffee's notifications. */
export const testPush = (): PushPayload => ({ title: "WG Coffee", body: "Notifikasi tes. Perangkat ini siap diberi tahu.", url: coffeePath.orders, tag: "tes" });

/*
 * The states of "Nyalakan notifikasi" on one device, and the words for each. The app keeps working
 * in every one of them: the status changes by itself on screen (polling).
 *   checking     not known yet            off          can be turned on
 *   on           this device is subscribed
 *   denied       the browser blocks notifications for this site
 *   ios-install  an iPhone or iPad in Safari: only the app on the home screen may ask
 *   unsupported  the browser has no web push
 *   not-ready    the server has no VAPID keys, or the push migration has not run
 *   account      (admin) signed in without an employee row: the super admin's shared sign-in
 */
export type CoffeePushState = "checking" | "off" | "on" | "denied" | Exclude<PushSupport, "ok"> | "not-ready" | "account";
/** Why the server cannot send yet: the keys are missing from its environment, or the migration has not run. */
export type CoffeePushWaiting = "kunci" | "migrasi" | null;
export type CoffeePushInfo = { publicKey: string | null; waiting: CoffeePushWaiting };
export const COFFEE_PUSH_MIGRATION = "202612010002_coffee_push.sql";

/** Where the words are read: the employee's phone, GA's tablet, or the pengelola's admin. */
export type CoffeePushPlace = "karyawan" | "ga" | "pengelola";

const fallback: Record<CoffeePushPlace, string> = {
  karyawan: "Aplikasi tetap jalan: status pengajuan berubah sendiri di Pesanan saya.",
  ga: "Tablet tetap jalan: status pesanan berubah sendiri di layar ini.",
  pengelola: "Antrean tetap diperbarui sendiri selama halaman ini terbuka.",
};
const subject: Record<CoffeePushPlace, string> = {
  karyawan: "begitu pengajuanmu selesai diproses",
  ga: "begitu pesanan rapat selesai diproses",
  pengelola: "begitu ada klaim atau pesanan rapat baru",
};

/** One or two plain sentences for a state: what it means and, where something can be done, how. */
export function pushNote(state: CoffeePushState, place: CoffeePushPlace, waiting: CoffeePushWaiting = null): string {
  switch (state) {
    case "checking": return "Memeriksa perangkat ini…";
    case "on": return `Notifikasi aktif di perangkat ini: kamu diberi tahu ${subject[place]}.`;
    case "off": return `Nyalakan supaya kamu diberi tahu ${subject[place]}, juga saat aplikasi tertutup.`;
    case "denied": return `Notifikasi diblokir untuk situs ini. Buka pengaturan situs di browser (ikon di kiri alamat, atau Setelan → Notifikasi), pilih Izinkan, lalu muat ulang halaman. ${fallback[place]}`;
    case "ios-install": return `Di iPhone dan iPad, notifikasi baru bisa dinyalakan setelah WG Coffee dipasang dulu ke layar utama (Bagikan → Tambah ke Layar Utama) dan dibuka dari ikonnya. ${fallback[place]}`;
    case "unsupported": return `Browser ini belum mendukung notifikasi. Pakai Chrome atau Edge terbaru. ${fallback[place]}`;
    case "account": return "Masuk dengan akun karyawan untuk menerima notifikasi. Akun super admin tidak terhubung ke satu orang.";
    case "not-ready":
      if (place !== "pengelola") return `Notifikasi belum tersedia. ${fallback[place]}`;
      return waiting === "migrasi"
        ? `Notifikasi belum aktif: menunggu migrasi ${COFFEE_PUSH_MIGRATION}. ${fallback[place]}`
        : `Notifikasi belum aktif: kunci WAM_VAPID_PUBLIC_KEY dan WAM_VAPID_PRIVATE_KEY belum diisi di server. ${fallback[place]}`;
  }
}

/** The state in a word or two, beside the title "Notifikasi". */
export const pushLabel = (state: CoffeePushState): string => ({
  checking: "Memeriksa…", on: "Aktif", off: "Belum aktif", denied: "Diblokir", "ios-install": "Pasang dulu",
  unsupported: "Tidak didukung", "not-ready": "Belum tersedia", account: "Perlu akun karyawan",
} satisfies Record<CoffeePushState, string>)[state];
/** Can "Nyalakan notifikasi" do something in this state? (Otherwise the note says what is in the way.) */
export const pushCanTurnOn = (state: CoffeePushState): boolean => state === "off";
