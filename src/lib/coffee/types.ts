import type { CoffeeOptions, Drink, DrinkOptions, Ice, QuotaGroup, Sugar, Temperature } from "./menu";

/*
 * WG Coffee's shapes (25 Nov 2026), shared by the browser and the server. An order is one
 * request: a claim (one drink, counted against the monthly quota), or one sending of a meeting
 * order (guests' and team's drinks, no quota). Pure, so it is tested without a server.
 */

export type { QuotaGroup };
export type Status = "diproses" | "selesai" | "ditolak" | "batal";
export type OrderKind = "klaim" | "rapat";
/** Who a drink is for: the claimant, a guest (recorded under the PIC), or a team member in the meeting. */
export type ItemFor = "klaim" | "tamu" | "tim";
export const STATUSES = ["diproses", "selesai", "ditolak", "batal"] as const satisfies readonly Status[];
export const ITEM_KINDS = ["klaim", "tamu", "tim"] as const satisfies readonly ItemFor[];

export const STATUS_LABEL: Record<Status, string> = { diproses: "Diproses", selesai: "Selesai", ditolak: "Ditolak", batal: "Batal" };
export const KIND_LABEL: Record<ItemFor, string> = { klaim: "Klaim", tamu: "Tamu", tim: "Tim · rapat" };

/** "K-418", "T-0113", and "T-0113-2" for a later round of the same meeting. */
export function orderNo(kind: OrderKind, number: number, round = 1): string {
  if (kind === "klaim") return `K-${number}`;
  return `T-${String(number).padStart(4, "0")}${round > 1 ? `-${round}` : ""}`;
}

/**
 * A drink as ordered; `other` names it when the slug is "lainnya" (Catat manual). `name`: the
 * drink's name as it was when ordered (kept with the order since F6, so a renamed or deleted
 * drink still reads right); `photo`: where its picture is now, null when the drink is gone or has
 * none. Temperature, sugar and ice are null when that option was not asked of the audience.
 */
export type Drinkline = { slug: string; other?: string; name?: string; photo?: string | null; temperature: Temperature | null; sugar: Sugar | null; ice: Ice | null };

/** A person as copied onto an order when it was made (later changes in Data karyawan do not reach it). */
export type OrderPerson = { id: string | null; name: string; group: QuotaGroup | null; position: string; bu: string };

export type QueueItem = Drinkline & {
  id: string;
  for: ItemFor;
  qty: number;
  /** tim: the team member the drink is recorded under. */
  person: OrderPerson | null;
  /** tamu: the name the guest gave in the menu book (optional, 40 letters at most), shown as "Tamu · Budi". */
  guestName?: string;
  /**
   * What one drink cost when it was ordered (rupiah; F9). Absent: the drink had no price then, or
   * migration 202612050001 has not run. Only the pengelola's screens read it: the server leaves it
   * out of what the employee app and the GA tablet receive.
   */
  unitPrice?: number;
};

/** Who processed an order (Selesai or Tolak) and when; `label` is what the claimant sees ("Dewi"). */
export type Processor = { employeeId: string | null; label: string; at: string };

/** One order with everything the pengelola's queue shows. */
export type QueueOrder = {
  id: string;
  kind: OrderKind;
  /** "K-418" / "T-0113-2". */
  no: string;
  number: number;
  round: number;
  parentId: string | null;
  /** klaim: the claimant; rapat: the PIC. */
  person: OrderPerson;
  room: string;
  spot: string | null;
  guest: string;
  guestCount: number | null;
  status: Status;
  rejectNote: string;
  processed: Processor | null;
  /** Who sent it: the claimant, GA, or the pengelola for Catat manual. */
  sentBy: string;
  manual: boolean;
  orderedAt: string;
  items: QueueItem[];
  /** klaim that counts (diproses, selesai): which one of the person's month it is. */
  claimNo?: number;
  /** klaim: the person's quota and how many of it are used in the order's month (this one included when it counts). */
  quota?: number;
  used?: number;
  /** "Baru diproses": the viewer processed it and the Urungkan window is still open. */
  undoable?: boolean;
};

/** An employee's own claim, as their phone shows it. */
export type MyOrder = Drinkline & {
  id: string;
  no: string;
  status: Status;
  orderedAt: string;
  rejectNote: string;
  /** "Selesai oleh Dewi · 09.14". */
  processedLabel: string;
  processedAt: string | null;
  manual: boolean;
  claimNo?: number;
};

/** A meeting order as GA's tablet shows it. */
export type MeetingOrder = Pick<QueueOrder, "id" | "no" | "number" | "round" | "parentId" | "room" | "spot" | "guest" | "guestCount" | "status" | "rejectNote" | "orderedAt" | "items" | "sentBy" | "manual"> & {
  pic: { id: string | null; name: string };
  processedLabel: string;
  processedAt: string | null;
};

export type CoffeeSettings = { karyawan: number; ga: number; intern: number };
/**
 * A drink as the pengelola's Menu shows it: its place in the order, how many orders ever used it
 * (only at zero may it be deleted), whether its photo is an upload (else a static file or none),
 * and who changed it last.
 */
export type AdminDrink = Drink & { sort: number; orders: number; uploaded: boolean; updatedAt: string | null; updatedLabel: string; /** Rupiah per drink (F9); null: not filled in yet. */ price: number | null };
/**
 * `ready` false: migration 202612020001 has not run; the menu is the code's and cannot be changed yet.
 * `places` false: migration 202612030001 has not run; every drink shows in both menus and the two
 * ticks (Buku tamu, Menu biasa) cannot be changed yet.
 * `prices` false: migration 202612050001 has not run; no drink has a price and none can be saved yet.
 */
export type MenuData = { drinks: AdminDrink[]; ready: boolean; places: boolean; prices: boolean };
export type { CoffeeOptions, DrinkOptions };

/** Someone the pickers offer: an active employee. `used`: claims that count in the month asked for. */
export type CoffeePerson = { id: string; name: string; nickname: string; position: string; bu: string; group: QuotaGroup; used?: number };

/** What the phone knows about its owner. */
export type CoffeeMe = { id: string; name: string; group: QuotaGroup; quota: number; used: number; left: number; month: string };
/** `menu`: every drink, hidden ones included (they still show in the history); `options`: what a claim is asked. */
export type MyState = { me: CoffeeMe; orders: MyOrder[]; ga: boolean; pengelola: boolean; menu: Drink[]; options: DrinkOptions };
/** What the tablet needs before any GA data: the menu and what the team and guests are asked. Public within the app, so the guest menu book may hold it. */
export type GaMenu = { menu: Drink[]; options: Pick<CoffeeOptions, "tim" | "tamu"> };
/** `pin`: a PIN GA is set, so leaving the guest menu book asks for it (never the PIN itself). */
export type GaState = GaMenu & { today: MeetingOrder[]; people: Pick<CoffeePerson, "id" | "name" | "position" | "bu">[]; rooms: { name: string; spot: string }[]; pin: boolean };
export type QueueState = { waiting: QueueOrder[]; recent: QueueOrder[]; today: { diproses: number; selesai: number; ditolak: number }; now: string };

/** One recap row: one drink (a line of three is three rows). */
export type RecapRow = {
  key: string;
  /** The order the drink belongs to (a line of three shares one). */
  orderId: string;
  at: string;
  no: string;
  kind: ItemFor;
  /** Whose row it is: the claimant, the team member, or the PIC for a guest's drink. */
  employeeId: string | null;
  name: string;
  /** "Karyawan", "Tim GA", "Intern", or "Tamu". */
  group: string;
  quotaGroup: QuotaGroup | null;
  position: string;
  bu: string;
  pic: string;
  guest: string;
  /** tamu: the guest's own name, when one was given. */
  guestName: string;
  guestCount: number | null;
  room: string;
  drink: string;
  /** What this drink cost when ordered (F9); null: no price then. */
  unitPrice: number | null;
  temperature: Temperature | null;
  sugar: Sugar | null;
  ice: Ice | null;
  status: Status;
  reason: string;
  doneBy: string;
  doneAt: string;
  claimNo?: number;
  manual: boolean;
};
