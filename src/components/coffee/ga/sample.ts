import { wibDay } from "@/lib/coffee/quota";
import { ROOMS, roomSpot } from "@/lib/coffee/rooms";
import { meetingSchema } from "@/lib/coffee/schemas";
import { orderNo, type GaState, type MeetingOrder, type QueueItem } from "@/lib/coffee/types";
import { CoffeeApiError } from "../api";
import type { GaApi, MeetingBody } from "./api";

/*
 * A make-believe server for GA's tablet: the same answers and refusals as the F0 APIs (the real
 * schema reads what is sent; one order per key; "Tambah lagi" takes room, PIC and guest from the
 * first sending and is refused with 409 when that one is refused, cancelled or not of today), kept
 * in memory. Used by the preview (/dev-preview/coffee/nyata/ga) and by the tests, so the real
 * components can be looked at and exercised before the migration runs. Every name is made up and says so.
 */

const person = (n: number, name: string, position: string, bu: string) => ({ id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`, name, position, bu });
export const SAMPLE_PEOPLE = [
  person(1, "Dimas Pratama (contoh)", "Account Manager", "TEE"),
  person(2, "Sari Wulandari (contoh)", "Business Development", "WNS"),
  person(3, "Andi Wijaya (contoh)", "Head of Sales", "TEE"),
  person(4, "Rina Putri (contoh)", "Communications Specialist", "WNS"),
  person(5, "Maya Lestari (contoh)", "Account Executive", "TEE"),
  person(6, "Arief Hidayat (contoh)", "Finance Staff", "WNS"),
  person(7, "Yoga Permana (contoh)", "Project Manager", "CoE"),
  person(8, "Laras Anindya (contoh)", "Creative Lead", "CoE"),
];
export const SAMPLE_GA = "Bagas (contoh)";
export const SAMPLE_PROCESSOR = "Dewi";
export const SAMPLE_REFUSAL = "Susu segar sedang habis. Mohon pilih minuman tanpa susu, mis. Americano atau Kopi Hitam.";
const PARENT_CLOSED = "Pesanan awal sudah tidak bisa ditambah. Buat pesanan baru.";

type Options = {
  /** Two orders already sent this morning (one done, one waiting). */
  seeded?: boolean;
  /** The make-believe server's time (the tests hold it still). */
  clock?: () => number;
  /** How long every answer takes (the tests use it to press twice before the first answer). */
  delay?: number;
};
export type SampleGa = ReturnType<typeof createSampleGa>;

export function createSampleGa({ seeded = false, clock = Date.now, delay = 0 }: Options = {}) {
  const iso = (msAgo = 0) => new Date(clock() - msAgo).toISOString();
  let number = 113, idSeq = 1, itemSeq = 1;
  const orders: MeetingOrder[] = [];
  const keys = new Map<string, string>();
  const calls = { state: 0, send: 0 };
  let offline = false;
  const newId = () => `00000000-0000-4000-8000-${String(idSeq++).padStart(12, "0")}`;
  const today = () => orders.filter(order => wibDay(order.orderedAt) === wibDay(iso())).sort((a, b) => Date.parse(b.orderedAt) - Date.parse(a.orderedAt) || b.id.localeCompare(a.id));
  const snapshot = (order: MeetingOrder): MeetingOrder => ({ ...order, pic: { ...order.pic }, items: order.items.map(item => ({ ...item })) });
  const wait = async () => {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if (offline) throw new CoffeeApiError("Tidak dapat terhubung. Periksa jaringan lalu coba lagi.");
  };

  function add(body: Omit<MeetingBody, "key">, more: Partial<MeetingOrder> = {}): MeetingOrder {
    const parent = body.parentId ? orders.find(order => order.id === body.parentId) : undefined;
    const root = parent ? orders.find(order => order.id === (parent.parentId ?? parent.id)) : undefined;
    const pic = root ? root.pic : SAMPLE_PEOPLE.find(item => item.id === body.picId)!;
    const round = root ? Math.max(...orders.filter(order => order.number === root.number).map(order => order.round)) + 1 : 1;
    const no = root ? root.number : number++;
    const room = root ? root.room : body.room.trim();
    const items: QueueItem[] = body.items.map(item => {
      const who = item.for === "tim" ? SAMPLE_PEOPLE.find(found => found.id === item.personId) : undefined;
      return {
        id: `item-${itemSeq++}`, for: item.for, qty: item.qty, slug: item.slug, temperature: item.temperature, sugar: item.sugar, ice: item.temperature === "es" ? item.ice : "Normal",
        person: who ? { id: who.id, name: who.name, group: "karyawan", position: who.position, bu: who.bu } : null,
      };
    });
    const order: MeetingOrder = {
      id: newId(), no: orderNo("rapat", no, round), number: no, round, parentId: root?.id ?? null, room, spot: roomSpot(room),
      guest: root ? root.guest : body.guest?.trim() ?? "", guestCount: root ? root.guestCount : body.guestCount ?? null,
      status: "diproses", rejectNote: "", orderedAt: iso(), items, sentBy: SAMPLE_GA, pic: { id: pic.id, name: pic.name }, processedLabel: "", processedAt: null, ...more,
    };
    orders.push(order);
    return order;
  }

  if (seeded) {
    add({ room: ROOMS[0].name, picId: SAMPLE_PEOPLE[2].id, guest: "PT Sinar Jaya (contoh)", guestCount: 4, items: [
      { for: "tamu", slug: "americano", temperature: "panas", sugar: "Normal", ice: "Normal", qty: 3 },
      { for: "tamu", slug: "classic-tea", temperature: "es", sugar: "Sedikit", ice: "Normal", qty: 1 },
      { for: "tim", personId: SAMPLE_PEOPLE[2].id, slug: "kopi-susu", temperature: "panas", sugar: "Normal", ice: "Normal", qty: 1 },
    ] }, { status: "selesai", orderedAt: iso(95 * 60_000), processedLabel: SAMPLE_PROCESSOR, processedAt: iso(88 * 60_000) });
    add({ room: ROOMS[2].name, picId: SAMPLE_PEOPLE[1].id, items: [
      { for: "tamu", slug: "cafe-latte", temperature: "panas", sugar: "Normal", ice: "Normal", qty: 2 },
    ] }, { orderedAt: iso(4 * 60_000) });
  }

  const api: GaApi = {
    async state(): Promise<GaState> {
      calls.state += 1;
      await wait();
      return { today: today().map(snapshot), people: SAMPLE_PEOPLE.map(item => ({ ...item })), rooms: ROOMS.map(room => ({ ...room })) };
    },
    async send(body) {
      calls.send += 1;
      await wait();
      const read = meetingSchema.safeParse(body);
      if (!read.success) throw new CoffeeApiError("Periksa kembali isian formulir.", 422, { [String(read.error.issues[0]?.path[0] ?? "items")]: [read.error.issues[0]?.message ?? ""] });
      // The same key again is the same order, as on the server (unless that order was refused meanwhile).
      const again = keys.get(body.key);
      if (again) {
        const first = orders.find(order => order.id === again)!;
        if (first.status === "ditolak" || first.status === "batal") throw new CoffeeApiError("Kiriman ini sudah pernah diproses. Muat ulang halaman, lalu kirim lagi bila masih perlu.", 409);
        return { order: snapshot(first), message: "Pesanan terkirim ke pengelola." };
      }
      if (body.parentId) {
        const parent = orders.find(order => order.id === body.parentId);
        const root = parent && orders.find(order => order.id === (parent.parentId ?? parent.id));
        if (!root) throw new CoffeeApiError("Pesanan tidak ditemukan. Muat ulang halaman.", 404);
        if (root.status === "ditolak" || root.status === "batal" || wibDay(root.orderedAt) !== wibDay(iso())) throw new CoffeeApiError(PARENT_CLOSED, 409);
      } else if (!SAMPLE_PEOPLE.some(item => item.id === body.picId)) throw new CoffeeApiError("Karyawan tidak ditemukan atau sudah tidak aktif.", 422);
      if (body.items.some(item => item.for === "tim" && !SAMPLE_PEOPLE.some(found => found.id === item.personId))) throw new CoffeeApiError("Karyawan tidak ditemukan atau sudah tidak aktif.", 422);
      const order = add(read.data);
      keys.set(body.key, order.id);
      return { order: snapshot(order), message: "Pesanan terkirim ke pengelola." };
    },
  };

  return {
    api,
    calls,
    orders,
    initial: (): GaState => ({ today: today().map(snapshot), people: SAMPLE_PEOPLE.map(item => ({ ...item })), rooms: ROOMS.map(room => ({ ...room })) }),
    /** A pengelola processes the newest waiting order (Selesai, or Tolak with a note). */
    settle(status: "selesai" | "ditolak", note = SAMPLE_REFUSAL): MeetingOrder | null {
      const order = today().find(item => item.status === "diproses");
      if (!order) return null;
      Object.assign(order, { status, rejectNote: status === "ditolak" ? note : "", processedLabel: SAMPLE_PROCESSOR, processedAt: iso() });
      return order;
    },
    /** The network goes away, or comes back. */
    setOffline(value: boolean) { offline = value; },
  };
}
