import { DEFAULT_OPTIONS, DRINKS, drinkIn, type CoffeeOptions, type Drink } from "@/lib/coffee/menu";
import { wibDay } from "@/lib/coffee/quota";
import { ROOMS, roomSpot } from "@/lib/coffee/rooms";
import { isDrinkIssue, meetingSchema, settleLine } from "@/lib/coffee/schemas";
import { orderNo, type GaState, type MeetingOrder, type QueueItem } from "@/lib/coffee/types";
import { CoffeeApiError, OFFLINE_TEXT } from "../api";
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
  /** The PIN GA the make-believe pengelola set ("" or missing: none yet). */
  pin?: string;
  /** What the team and guests are asked with a drink (Pengaturan); the real defaults (everything) when not given. */
  options?: Pick<CoffeeOptions, "tim" | "tamu">;
  /** The menu (the pengelola's); the code's 15 drinks when not given. */
  menu?: Drink[];
};
export type SampleGa = ReturnType<typeof createSampleGa>;

export function createSampleGa({ seeded = false, clock = Date.now, delay = 0, pin = "", options: firstOptions = DEFAULT_OPTIONS, menu: firstMenu = DRINKS }: Options = {}) {
  let options = { tim: { ...firstOptions.tim }, tamu: { ...firstOptions.tamu } };
  let menu = firstMenu.map(drink => ({ ...drink }));
  const book = () => ({ menu: menu.map(drink => ({ ...drink })), options: { tim: { ...options.tim }, tamu: { ...options.tamu } } });
  const iso = (msAgo = 0) => new Date(clock() - msAgo).toISOString();
  let number = 113, idSeq = 1, itemSeq = 1;
  const orders: MeetingOrder[] = [];
  const keys = new Map<string, string>();
  const calls = { state: 0, send: 0, pin: 0 };
  let offline = false;
  /** Answers that get lost on the way back (the server did the work), and requests that never answer. */
  let lose = 0, hang = 0;
  let pinTries = 0;
  const prints = new Map<string, string>();
  const printOf = (body: MeetingBody) => { const { key: _key, ...rest } = body; void _key; return JSON.stringify(rest); };
  const newId = () => `00000000-0000-4000-8000-${String(idSeq++).padStart(12, "0")}`;
  const today = () => orders.filter(order => wibDay(order.orderedAt) === wibDay(iso())).sort((a, b) => Date.parse(b.orderedAt) - Date.parse(a.orderedAt) || b.id.localeCompare(a.id));
  const snapshot = (order: MeetingOrder): MeetingOrder => ({ ...order, pic: { ...order.pic }, items: order.items.map(item => ({ ...item })) });
  const wait = async () => {
    if (hang > 0) { hang -= 1; await new Promise(() => undefined); }
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if (offline) throw new CoffeeApiError(OFFLINE_TEXT);
  };
  const sent = <T,>(answer: T): T => {
    if (lose > 0) { lose -= 1; throw new CoffeeApiError(OFFLINE_TEXT); }
    return answer;
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
      // As the server: each line keeps only what its audience is asked; the drink's name and photo come from the menu.
      const drink = drinkIn(menu, item.slug);
      const choice = settleLine(item, drink, options[item.for]);
      return {
        id: `item-${itemSeq++}`, for: item.for, qty: item.qty, slug: item.slug, ...(drink ? { name: drink.name, photo: drink.photo } : {}),
        ...(isDrinkIssue(choice) ? { temperature: null, sugar: null, ice: null } : choice),
        person: who ? { id: who.id, name: who.name, group: "karyawan", position: who.position, bu: who.bu } : null,
        ...(item.for === "tamu" && item.guestName ? { guestName: item.guestName } : {}),
      };
    });
    const order: MeetingOrder = {
      id: newId(), no: orderNo("rapat", no, round), number: no, round, parentId: root?.id ?? null, room, spot: roomSpot(room), manual: false,
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
      return { ...book(), today: today().map(snapshot), people: SAMPLE_PEOPLE.map(item => ({ ...item })), rooms: ROOMS.map(room => ({ ...room })), pin: Boolean(pin) };
    },
    async checkPin(typed) {
      calls.pin += 1;
      await wait();
      if (!pin) throw new CoffeeApiError("PIN GA belum diatur. Minta pengelola mengaturnya di Pengaturan.", 409);
      if (++pinTries > 10) throw new CoffeeApiError("Terlalu sering dalam waktu singkat. Tunggu sepuluh menit lalu coba lagi.", 429);
      if (typed !== pin) throw new CoffeeApiError("PIN tidak cocok. Coba lagi.", 422);
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
        // Refused meanwhile, or the same key with other contents: not the same sending (409), as on the server.
        if (first.status === "ditolak" || first.status === "batal" || prints.get(body.key) !== printOf(read.data as MeetingBody)) throw new CoffeeApiError("Kiriman ini sudah pernah diproses atau isinya berubah. Periksa pesanan, lalu kirim lagi bila masih perlu.", 409);
        return sent({ order: snapshot(first), message: "Pesanan terkirim ke pengelola." });
      }
      if (body.parentId) {
        const parent = orders.find(order => order.id === body.parentId);
        const root = parent && orders.find(order => order.id === (parent.parentId ?? parent.id));
        if (!root) throw new CoffeeApiError("Pesanan tidak ditemukan. Muat ulang halaman.", 404);
        if (root.status === "ditolak" || root.status === "batal" || wibDay(root.orderedAt) !== wibDay(iso())) throw new CoffeeApiError(PARENT_CLOSED, 409);
      } else if (!SAMPLE_PEOPLE.some(item => item.id === body.picId)) throw new CoffeeApiError("Karyawan tidak ditemukan atau sudah tidak aktif.", 422);
      if (body.items.some(item => item.for === "tim" && !SAMPLE_PEOPLE.some(found => found.id === item.personId))) throw new CoffeeApiError("Karyawan tidak ditemukan atau sudah tidak aktif.", 422);
      // A drink that left the menu (hidden or deleted) is gone; an option that is asked must be there.
      if (read.data.items.some(item => !drinkIn(menu, item.slug)?.active)) throw new CoffeeApiError("Minuman ini sudah tidak ada di menu. Muat ulang halaman, lalu pilih yang lain.", 409);
      const issue = read.data.items.map(item => settleLine(item, drinkIn(menu, item.slug), options[item.for])).find(isDrinkIssue);
      if (issue) throw new CoffeeApiError("Pilihan minuman berubah. Tutup lalu buka lagi minumannya, kemudian pilih ulang.", 422, { [issue.field]: [issue.message] });
      const order = add(read.data);
      keys.set(body.key, order.id);
      prints.set(body.key, printOf(read.data as MeetingBody));
      return sent({ order: snapshot(order), message: "Pesanan terkirim ke pengelola." });
    },
  };

  return {
    api,
    calls,
    orders,
    initial: (): GaState => ({ ...book(), today: today().map(snapshot), people: SAMPLE_PEOPLE.map(item => ({ ...item })), rooms: ROOMS.map(room => ({ ...room })), pin: Boolean(pin) }),
    /** What a page loaded in guest mode carries: the menu and the options, no GA data. */
    held: (): GaState => ({ ...book(), today: [], people: [], rooms: [], pin: Boolean(pin) }),
    /** The pengelola changes what is asked (Pengaturan), or the menu; the next read brings it. */
    setOptions(next: Pick<CoffeeOptions, "tim" | "tamu">) { options = { tim: { ...next.tim }, tamu: { ...next.tamu } }; },
    setMenu(next: Drink[]) { menu = next.map(drink => ({ ...drink })); },
    /** A pengelola records a meeting order by hand (Catat manual): it arrives already done, and cannot be added to. */
    recordManual(room = ""): MeetingOrder {
      return add({ room: room || " ", picId: SAMPLE_PEOPLE[0].id, items: [{ for: "tamu", slug: "kopi-susu", temperature: "panas", sugar: "Normal", ice: "Normal", qty: 2 }] },
        { room, spot: room ? roomSpot(room) : null, manual: true, status: "selesai", processedLabel: SAMPLE_PROCESSOR, processedAt: iso() });
    },
    /** The pengelola sets (or changes) the PIN GA. */
    setPin(value: string) { pin = value; pinTries = 0; },
    /** The next `count` answers to Kirim are lost on the way back (the server did the work). */
    loseAnswers(count = 1) { lose = count; },
    /** The next `count` requests never answer. */
    hangNext(count = 1) { hang = count; },
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
