import { z } from "zod";
import { pushSubscriptionSchema } from "@/lib/pra-wam/push";
import { PRICE_MAX, formatRupiah } from "./money";
import { ICE_LEVELS, OTHER_DRINK, SUGAR_LEVELS, fitChoice, type Choice, type Drink, type DrinkOptions, type Ice, type Sugar, type Temperature } from "./menu";
import { ITEM_KINDS, STATUSES } from "./types";

/*
 * What WG Coffee's APIs take (25 Nov 2026). The messages are for the person at the screen,
 * in Indonesian. Since F6 the menu lives in the database and each audience is asked its own
 * options, so the shapes here only say what a drink line may look like (temperature, sugar and
 * ice are optional); whether the drink is on the menu, comes in that temperature, and which
 * options count is decided by the server with `settleLine`, against the menu and the settings.
 */

const blank = (value: unknown) => value === "" || value === null ? undefined : value;
const temperature = z.preprocess(blank, z.enum(["panas", "es"], "Pilih panas atau es.").optional());
const drinkShape = {
  slug: z.string("Pilih minuman.").trim().min(1, "Pilih minuman.").max(40, "Pilih minuman."),
  temperature,
  sugar: z.preprocess(blank, z.enum(SUGAR_LEVELS, "Pilih takaran gula.").optional()),
  ice: z.preprocess(blank, z.enum(ICE_LEVELS, "Pilih takaran es.").optional()),
};

export type DrinkIssue = { field: "slug" | "temperature" | "sugar"; message: string };
/**
 * A drink line as it is saved, for the options its audience is asked (the server's last word):
 * an option that is off is dropped whatever was sent (null, never a made-up default); one that is
 * on must be there and fit the drink. `drink`: the menu's entry, undefined for "lainnya" (Catat
 * manual, any temperature). A drink that comes one way only needs no temperature sent.
 */
export function settleLine(line: { slug: string; temperature?: Temperature | null; sugar?: Sugar | null; ice?: Ice | null }, drink: Pick<Drink, "name" | "temperatures"> | undefined, options: DrinkOptions): Choice | DrinkIssue {
  if (!drink && line.slug !== OTHER_DRINK) return { field: "slug", message: "Pilih minuman." };
  let chosen = line.temperature ?? null;
  if (options.suhu) {
    if (!chosen && drink?.temperatures.length === 1) chosen = drink.temperatures[0];
    if (!chosen) return { field: "temperature", message: "Pilih panas atau es." };
    if (drink && !drink.temperatures.includes(chosen)) return { field: "temperature", message: `${drink.name} hanya tersedia ${drink.temperatures[0] === "es" ? "dingin (es)" : "panas"}.` };
  }
  if (options.gula && !line.sugar) return { field: "sugar", message: "Pilih takaran gula." };
  return fitChoice({ temperature: chosen, sugar: line.sugar, ice: line.ice }, options);
}
export const isDrinkIssue = (value: Choice | DrinkIssue): value is DrinkIssue => "field" in value;
const optionalText = (max: number, message: string) =>
  z.preprocess(value => typeof value === "string" ? blank(value.trim()) : blank(value), z.string().max(max, message).optional());
const guestCount = z.preprocess(blank, z.number("Jumlah tamu berupa angka.").int("Jumlah tamu berupa angka bulat.").min(1, "Jumlah tamu minimal 1.").max(500, "Jumlah tamu paling banyak 500.").optional());
const qty = z.number("Jumlah berupa angka.").int("Jumlah berupa angka bulat.").min(1, "Jumlah minimal 1.").max(50, "Jumlah paling banyak 50 per baris.");
const key = z.uuid("Kunci pengiriman tidak dikenali. Muat ulang halaman.");

export const drinklineSchema = z.object(drinkShape);

/** An employee's claim: one drink, and the browser's key so a double tap is one claim. */
export const claimSchema = z.object({ ...drinkShape, key });
export type ClaimInput = z.infer<typeof claimSchema>;

/** How long a guest's own name on a drink may be (the column and the database function hold the same limit). */
export const GUEST_NAME_MAX = 40;

const meetingItemSchema = z.object({
  for: z.enum(["tamu", "tim"], "Pilih Tamu atau Tim · rapat."),
  personId: z.preprocess(blank, z.uuid("Pilih orangnya.").optional()),
  /** tamu: the guest's own name from the menu book. Optional, trimmed, GUEST_NAME_MAX letters at most. */
  guestName: optionalText(GUEST_NAME_MAX, `Nama tamu paling panjang ${GUEST_NAME_MAX} huruf.`),
  ...drinkShape,
  qty,
}).superRefine((value, ctx) => {
  if (value.for === "tim" && !value.personId) ctx.addIssue({ code: "custom", message: "Pilih orangnya.", path: ["personId"] });
}).transform(value => ({ ...value, personId: value.for === "tim" ? value.personId : undefined, guestName: value.for === "tamu" ? value.guestName : undefined }));

/** GA's meeting order: the room and the PIC are enough; guest and count are optional. */
export const meetingSchema = z.object({
  room: z.string("Pilih ruangan.").trim().min(1, "Pilih ruangan.").max(80, "Nama ruangan paling panjang 80 huruf."),
  spot: optionalText(40, "Titik denah tidak dikenali."),
  picId: z.uuid("Pilih PIC tamu."),
  guest: optionalText(120, "Nama tamu atau instansi paling panjang 120 huruf."),
  guestCount,
  /** "Tambah lagi": the first sending of the same meeting. */
  parentId: z.preprocess(blank, z.uuid("Pesanan awal tidak dikenali.").optional()),
  items: z.array(meetingItemSchema, "Tambahkan minuman dulu.").min(1, "Tambahkan minuman dulu.").max(40, "Paling banyak 40 baris per kiriman."),
  key,
});
export type MeetingInput = z.infer<typeof meetingSchema>;

export const rejectSchema = z.object({
  note: z.string("Tulis catatan untuk pemesan, minimal 3 huruf.").trim().min(3, "Tulis catatan untuk pemesan, minimal 3 huruf.").max(300, "Catatan paling panjang 300 huruf."),
});

/** One check, so a date that is not one is said once. */
const isoDate = z.string("Isi tanggal.").refine(value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const at = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(at) && new Date(at).toISOString().slice(0, 10) === value;
}, "Tanggal tidak dikenali.");
/** The moment of a WIB date and clock. Only for a date and a clock that are real ones (`manualMoment` says). */
export const manualAt = (date: string, time: string): string => new Date(`${date}T${time}:00+07:00`).toISOString();
/** The same moment in milliseconds, or NaN when the date or the clock is not one: never throws. */
const manualMoment = (date: string, time: string): number => Date.parse(`${date}T${time}:00+07:00`);

/**
 * Catat manual: a request made outside the app, recorded by a pengelola as done. `employeeId` is
 * the claimant (klaim), the team member (tim) or the PIC (tamu). The drink may be off the menu
 * ("lainnya" with its name). `key`: one per opened sheet, so a second sending of the same record
 * answers with the first one.
 */
export const manualSchema = z.object({
  kind: z.enum(ITEM_KINDS, "Pilih jenis catatan."),
  employeeId: z.string("Pilih nama karyawan.").default(""),
  date: isoDate,
  time: z.string("Isi jam.").regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Jam tidak dikenali."),
  slug: drinkShape.slug,
  other: optionalText(60, "Nama minuman paling panjang 60 huruf."),
  temperature,
  sugar: drinkShape.sugar,
  ice: drinkShape.ice,
  qty: qty.default(1),
  room: optionalText(80, "Nama ruangan paling panjang 80 huruf."),
  guest: optionalText(120, "Nama tamu atau instansi paling panjang 120 huruf."),
  guestCount,
  key,
}).superRefine((value, ctx) => {
  if (!z.uuid().safeParse(value.employeeId).success) ctx.addIssue({ code: "custom", message: value.kind === "tamu" ? "Pilih PIC tamu." : "Pilih nama karyawan.", path: ["employeeId"] });
  if (value.slug === OTHER_DRINK && !value.other) ctx.addIssue({ code: "custom", message: "Tulis nama minumannya.", path: ["other"] });
  // A date or a clock that is not one already has its own message; there is no moment to compare.
  const at = manualMoment(String(value.date), String(value.time));
  if (!Number.isNaN(at) && at > Date.now() + 60_000) ctx.addIssue({ code: "custom", message: "Tanggal dan jam tidak boleh di masa depan.", path: ["date"] });
}).transform(value => ({
  ...value,
  other: value.slug === OTHER_DRINK ? value.other : undefined,
  qty: value.kind === "klaim" ? 1 : value.qty,
  room: value.kind === "klaim" ? undefined : value.room,
  guest: value.kind === "tamu" ? value.guest : undefined,
  guestCount: value.kind === "tamu" ? value.guestCount : undefined,
}));
export type ManualInput = z.infer<typeof manualSchema>;

const quota = (label: string) => z.number(`Jatah ${label} berupa angka.`).int(`Jatah ${label} berupa angka bulat.`).min(0, `Jatah ${label} minimal 0.`).max(60, `Jatah ${label} paling banyak 60.`);
/** PIN GA: exactly four digits, as text (a leading zero counts). */
export const gaPinSchema = z.object({ pin: z.string("Isi PIN 4 angka.").regex(/^\d{4}$/, "PIN berupa 4 angka.") });
export const settingsSchema = z.object({ karyawan: quota("karyawan"), ga: quota("Tim GA"), intern: quota("intern") });
/** A drink's slug, as the database keeps it: lower-case words joined by "-", 40 letters at most. */
export const drinkSlugSchema = z.string("Minuman tidak dikenali.").regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Minuman tidak dikenali.").max(40, "Minuman tidak dikenali.");
/** Names that are addresses or have a meaning of their own, never a drink's slug. */
const RESERVED_SLUGS = [OTHER_DRINK, "urutan"];
/**
 * The slug a new drink gets from its name: "Café Latte" → "cafe-latte", "Teh  Tarik (Baru)!" →
 * "teh-tarik-baru". Accents are dropped, anything that is not a letter or a digit joins words, 40
 * letters at most; a name with nothing to keep becomes "minuman", and a reserved word gets "-1".
 */
export function slugOf(name: string): string {
  const plain = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  const slug = plain || "minuman";
  return RESERVED_SLUGS.includes(slug) ? `${slug}-1` : slug;
}
/** Tambah / Ubah minuman (the pengelola's Menu). Panas comes before Es, whatever order they were sent in. */
export const drinkSchema = z.object({
  name: z.string("Tulis nama minumannya.").trim().min(1, "Tulis nama minumannya.").max(60, "Nama paling panjang 60 huruf."),
  description: z.preprocess(value => value == null ? "" : value, z.string("Keterangan berupa teks.").trim().max(200, "Keterangan paling panjang 200 huruf.")),
  group: z.enum(["kopi", "non-kopi"], "Pilih Kopi atau Non-kopi."),
  temperatures: z.array(z.enum(["panas", "es"], "Pilih Panas, Es, atau keduanya."), "Pilih Panas, Es, atau keduanya.").min(1, "Pilih Panas, Es, atau keduanya.").max(2, "Pilih Panas, Es, atau keduanya.")
    .transform(value => (["panas", "es"] as const).filter(item => value.includes(item))),
  active: z.boolean("Pilih tampil atau tersembunyi.").default(true),
  /** Where it shows (F7). Left out: both, as every drink was before. */
  guestBook: z.boolean("Pilih tampil di Buku tamu atau tidak.").default(true),
  regular: z.boolean("Pilih tampil di Menu biasa atau tidak.").default(true),
  /** Harga satuan in whole rupiah (F9). Left out: unchanged; null: back to "belum diisi". */
  price: z.number("Harga berupa angka.").int("Isi rupiah penuh, tanpa koma atau sen.").min(0, "Harga tidak boleh negatif.").max(PRICE_MAX, `Harga paling besar ${formatRupiah(PRICE_MAX)}.`).nullable().optional(),
});
export type DrinkInput = z.infer<typeof drinkSchema>;
/** From the list, without opening the editor: Sembunyikan / Tampilkan, or one of the two "where it shows" ticks. At least one of them. */
export const drinkShownSchema = z.object({
  active: z.boolean("Pilih tampil atau tersembunyi.").optional(),
  guestBook: z.boolean("Pilih tampil di Buku tamu atau tidak.").optional(),
  regular: z.boolean("Pilih tampil di Menu biasa atau tidak.").optional(),
}).refine(value => value.active !== undefined || value.guestBook !== undefined || value.regular !== undefined, "Tidak ada yang diubah.");
export type DrinkPatch = z.infer<typeof drinkShownSchema>;
/** Atur urutan: every drink of the menu once, in its new order. */
export const drinkOrderSchema = z.object({
  slugs: z.array(drinkSlugSchema, "Urutan tidak dikenali.").min(1, "Urutan tidak dikenali.").max(500, "Urutan tidak dikenali.")
    .refine(value => new Set(value).size === value.length, "Urutan tidak dikenali."),
});

const flag = z.boolean("Pilih nyala atau mati.");
const audienceOptions = z.object({ suhu: flag, gula: flag, es: flag });
/** Pengaturan → Opsi minuman: which options each audience is asked. Takaran es never stays on without the temperature. */
export const optionsSchema = z.object({ klaim: audienceOptions, tim: audienceOptions, tamu: audienceOptions })
  .transform(value => ({ klaim: tidyOptions(value.klaim), tim: tidyOptions(value.tim), tamu: tidyOptions(value.tamu) }));
function tidyOptions(options: DrinkOptions): DrinkOptions { return { ...options, es: options.es && options.suhu }; }

/** Rekap's filter, read from the address: a span of WIB days (a year at most), and what to show. */
export const recapQuerySchema = z.object({
  dari: isoDate,
  sampai: isoDate,
  jenis: z.preprocess(blank, z.enum(ITEM_KINDS, "Jenis tidak dikenali.").optional()),
  status: z.preprocess(blank, z.enum(STATUSES, "Status tidak dikenali.").optional()),
  q: optionalText(80, "Kata pencarian paling panjang 80 huruf."),
}).superRefine((value, ctx) => {
  const days = (Date.parse(`${value.sampai}T00:00:00Z`) - Date.parse(`${value.dari}T00:00:00Z`)) / 86_400_000;
  if (days < 0) ctx.addIssue({ code: "custom", message: "Tanggal akhir tidak boleh sebelum tanggal awal.", path: ["sampai"] });
  else if (days > 366) ctx.addIssue({ code: "custom", message: "Rentang paling lama satu tahun. Persempit tanggalnya.", path: ["sampai"] });
});
export type RecapQuery = z.infer<typeof recapQuerySchema>;

/*
 * The push services a browser subscribes with (audit F5-04). The server later posts to the address
 * a device handed in, so only these hosts are taken: Chrome and other Chromium browsers and
 * Android (FCM), Firefox (Mozilla), Safari on iPhone, iPad and Mac (Apple), Edge on Windows (WNS).
 * WAM's own push has no such list (25 Nov 2026); this one is Coffee's.
 */
const PUSH_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com"];
const PUSH_HOST_ENDINGS = [".push.apple.com", ".notify.windows.com"];
/** Is this the address of a known push service: https, its usual port, no sign-in part, a host from the list? */
export function isPushServiceUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.includes(host) || PUSH_HOST_ENDINGS.some(ending => host.endsWith(ending) && host.length > ending.length);
}

/**
 * What a device sends to turn notifications on (F4): WAM's shape, and the address must be a push
 * service's (the server later posts to it; nothing else is taken, see isPushServiceUrl).
 */
export const coffeePushSchema = pushSubscriptionSchema.refine(value => isPushServiceUrl(value.subscription.endpoint), { message: "Alamat notifikasi perangkat ini tidak dikenali.", path: ["subscription", "endpoint"] });
