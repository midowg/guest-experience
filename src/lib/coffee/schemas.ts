import { z } from "zod";
import { ICE_LEVELS, OTHER_DRINK, SUGAR_LEVELS, drinkBySlug, type Temperature } from "./menu";
import { ITEM_KINDS, STATUSES } from "./types";

/*
 * What Werkudara Coffee's APIs take (25 Nov 2026). The messages are for the person at the screen,
 * in Indonesian. A drink must be on the menu and come in the temperature asked for; the ice level
 * only means something for a cold drink, so a hot one always carries "Normal".
 */

const temperature = z.enum(["panas", "es"], "Pilih panas atau es.");
const drinkShape = {
  slug: z.string("Pilih minuman.").trim().min(1, "Pilih minuman.").max(40, "Pilih minuman."),
  temperature,
  sugar: z.enum(SUGAR_LEVELS, "Pilih takaran gula."),
  ice: z.enum(ICE_LEVELS, "Pilih takaran es.").default("Normal"),
};
type DrinkInput = { slug: string; temperature: Temperature };
type Issues = { addIssue: (issue: { code: "custom"; message: string; path: string[] }) => void };

/** The drink is on the menu and comes hot or cold as asked. */
function checkDrink(value: DrinkInput, ctx: Issues) {
  const drink = drinkBySlug(value.slug);
  if (!drink) { ctx.addIssue({ code: "custom", message: "Pilih minuman.", path: ["slug"] }); return; }
  if (!drink.temperatures.includes(value.temperature)) {
    ctx.addIssue({ code: "custom", message: `${drink.name} hanya tersedia ${drink.temperatures[0] === "es" ? "dingin (es)" : "panas"}.`, path: ["temperature"] });
  }
}
const tidyIce = <T extends { temperature: Temperature; ice: (typeof ICE_LEVELS)[number] }>(value: T): T =>
  value.temperature === "panas" ? { ...value, ice: "Normal" } : value;
const blank = (value: unknown) => value === "" || value === null ? undefined : value;
const optionalText = (max: number, message: string) =>
  z.preprocess(value => typeof value === "string" ? blank(value.trim()) : blank(value), z.string().max(max, message).optional());
const guestCount = z.preprocess(blank, z.number("Jumlah tamu berupa angka.").int("Jumlah tamu berupa angka bulat.").min(1, "Jumlah tamu minimal 1.").max(500, "Jumlah tamu paling banyak 500.").optional());
const qty = z.number("Jumlah berupa angka.").int("Jumlah berupa angka bulat.").min(1, "Jumlah minimal 1.").max(50, "Jumlah paling banyak 50 per baris.");
const key = z.uuid("Kunci pengiriman tidak dikenali. Muat ulang halaman.");

export const drinklineSchema = z.object(drinkShape).superRefine(checkDrink).transform(tidyIce);

/** An employee's claim: one drink, and the browser's key so a double tap is one claim. */
export const claimSchema = z.object({ ...drinkShape, key }).superRefine(checkDrink).transform(tidyIce);
export type ClaimInput = z.infer<typeof claimSchema>;

const meetingItemSchema = z.object({
  for: z.enum(["tamu", "tim"], "Pilih Tamu atau Tim · rapat."),
  personId: z.preprocess(blank, z.uuid("Pilih orangnya.").optional()),
  ...drinkShape,
  qty,
}).superRefine((value, ctx) => {
  checkDrink(value, ctx);
  if (value.for === "tim" && !value.personId) ctx.addIssue({ code: "custom", message: "Pilih orangnya.", path: ["personId"] });
}).transform(value => tidyIce({ ...value, personId: value.for === "tim" ? value.personId : undefined }));

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

const isoDate = z.string("Isi tanggal.").regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak dikenali.")
  .refine(value => { const at = Date.parse(`${value}T00:00:00Z`); return !Number.isNaN(at) && new Date(at).toISOString().slice(0, 10) === value; }, "Tanggal tidak dikenali.");
/** The moment of a WIB date and clock. */
export const manualAt = (date: string, time: string): string => new Date(`${date}T${time}:00+07:00`).toISOString();

/**
 * Catat manual: a request made outside the app, recorded by a pengelola as done. `employeeId` is
 * the claimant (klaim), the team member (tim) or the PIC (tamu). The drink may be off the menu
 * ("lainnya" with its name).
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
  key: z.preprocess(blank, key.optional()),
}).superRefine((value, ctx) => {
  if (!z.uuid().safeParse(value.employeeId).success) ctx.addIssue({ code: "custom", message: value.kind === "tamu" ? "Pilih PIC tamu." : "Pilih nama karyawan.", path: ["employeeId"] });
  if (value.slug === OTHER_DRINK) { if (!value.other) ctx.addIssue({ code: "custom", message: "Tulis nama minumannya.", path: ["other"] }); }
  else checkDrink(value, ctx);
  if (Date.parse(manualAt(value.date, value.time)) > Date.now() + 60_000) ctx.addIssue({ code: "custom", message: "Tanggal dan jam tidak boleh di masa depan.", path: ["date"] });
}).transform(value => tidyIce({
  ...value,
  other: value.slug === OTHER_DRINK ? value.other : undefined,
  qty: value.kind === "klaim" ? 1 : value.qty,
  room: value.kind === "klaim" ? undefined : value.room,
  guest: value.kind === "tamu" ? value.guest : undefined,
  guestCount: value.kind === "tamu" ? value.guestCount : undefined,
}));
export type ManualInput = z.infer<typeof manualSchema>;

const quota = (label: string) => z.number(`Jatah ${label} berupa angka.`).int(`Jatah ${label} berupa angka bulat.`).min(0, `Jatah ${label} minimal 0.`).max(60, `Jatah ${label} paling banyak 60.`);
export const settingsSchema = z.object({ karyawan: quota("karyawan"), ga: quota("Tim GA"), intern: quota("intern") });

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
