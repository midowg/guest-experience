import { describe, expect, it } from "vitest";
import { claimSchema, drinklineSchema, manualSchema, meetingSchema, recapQuerySchema, rejectSchema, settingsSchema } from "./schemas";

const KEY = "11111111-1111-4111-8111-111111111111";
const PERSON = "22222222-2222-4222-8222-222222222222";
const drink = { slug: "cafe-latte", temperature: "es", sugar: "Sedikit", ice: "Ekstra" } as const;
const fields = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((result.error?.issues ?? []).map(issue => [issue.path.join("."), issue.message]));

describe("a drink", () => {
  it("must be on the menu and come in the temperature asked for", () => {
    expect(drinklineSchema.parse(drink)).toEqual(drink);
    expect(fields(drinklineSchema.safeParse({ ...drink, slug: "es-teh-manis" }))).toEqual({ slug: "Pilih minuman." });
    expect(fields(drinklineSchema.safeParse({ ...drink, slug: "espresso" }))).toEqual({ temperature: "Espresso hanya tersedia panas." });
    expect(fields(drinklineSchema.safeParse({ ...drink, slug: "cucumber-ice", temperature: "panas" }))).toEqual({ temperature: "Cucumber Ice hanya tersedia dingin (es)." });
    expect(fields(drinklineSchema.safeParse({ ...drink, slug: "lainnya" }))).toEqual({ slug: "Pilih minuman." });
    expect(drinklineSchema.safeParse({ ...drink, sugar: "Banyak" }).success).toBe(false);
  });
  it("carries a normal ice level when hot, whatever was sent", () => {
    expect(drinklineSchema.parse({ ...drink, temperature: "panas" }).ice).toBe("Normal");
    expect(drinklineSchema.parse({ slug: "espresso", temperature: "panas", sugar: "Tanpa" }).ice).toBe("Normal");
  });
});

describe("a claim", () => {
  it("needs the browser's key", () => {
    expect(claimSchema.parse({ ...drink, key: KEY })).toEqual({ ...drink, key: KEY });
    expect(fields(claimSchema.safeParse(drink))).toHaveProperty("key");
    expect(fields(claimSchema.safeParse({ ...drink, key: "abc" }))).toHaveProperty("key");
  });
});

describe("a meeting order", () => {
  const order = { room: " Kaliya Limasan ", picId: PERSON, items: [{ for: "tamu", ...drink, qty: 3 }], key: KEY };
  it("takes a room, a PIC and drinks; guest and count are optional", () => {
    const parsed = meetingSchema.parse({ ...order, guest: "", guestCount: null });
    expect(parsed).toMatchObject({ room: "Kaliya Limasan", picId: PERSON, guest: undefined, guestCount: undefined });
    expect(parsed.parentId).toBeUndefined();
    expect(parsed.items[0]).toMatchObject({ for: "tamu", qty: 3, personId: undefined });
    expect(meetingSchema.parse({ ...order, guest: "Contoh PT Sinar", guestCount: 5, parentId: KEY })).toMatchObject({ guest: "Contoh PT Sinar", guestCount: 5, parentId: KEY });
  });
  it("names what is missing", () => {
    expect(fields(meetingSchema.safeParse({ ...order, picId: "" }))).toEqual({ picId: "Pilih PIC tamu." });
    expect(fields(meetingSchema.safeParse({ ...order, room: " " }))).toEqual({ room: "Pilih ruangan." });
    expect(fields(meetingSchema.safeParse({ ...order, items: [] }))).toEqual({ items: "Tambahkan minuman dulu." });
    expect(fields(meetingSchema.safeParse({ ...order, items: [{ for: "tim", ...drink, qty: 1 }] }))).toEqual({ "items.0.personId": "Pilih orangnya." });
    expect(fields(meetingSchema.safeParse({ ...order, items: [{ for: "tamu", ...drink, qty: 0 }] }))).toEqual({ "items.0.qty": "Jumlah minimal 1." });
    expect(fields(meetingSchema.safeParse({ ...order, items: [{ for: "tamu", ...drink, qty: 51 }] }))).toHaveProperty("items.0.qty");
    expect(fields(meetingSchema.safeParse({ ...order, items: [{ for: "tamu", ...drink, slug: "espresso", qty: 1 }] }))).toHaveProperty("items.0.temperature");
    expect(meetingSchema.safeParse({ ...order, items: Array.from({ length: 41 }, () => ({ for: "tamu", ...drink, qty: 1 })) }).success).toBe(false);
    expect(meetingSchema.safeParse({ ...order, guestCount: 501 }).success).toBe(false);
  });
  it("keeps a person only on a team line", () => {
    const parsed = meetingSchema.parse({ ...order, items: [{ for: "tamu", personId: PERSON, ...drink, qty: 1 }, { for: "tim", personId: PERSON, ...drink, qty: 1 }] });
    expect(parsed.items.map(item => item.personId)).toEqual([undefined, PERSON]);
  });
});

describe("Tolak", () => {
  it("needs a note of three letters", () => {
    expect(rejectSchema.parse({ note: "  Susu habis.  " })).toEqual({ note: "Susu habis." });
    expect(fields(rejectSchema.safeParse({ note: " a " }))).toEqual({ note: "Tulis catatan untuk pemesan, minimal 3 huruf." });
    expect(fields(rejectSchema.safeParse({}))).toEqual({ note: "Tulis catatan untuk pemesan, minimal 3 huruf." });
    expect(rejectSchema.safeParse({ note: "x".repeat(301) }).success).toBe(false);
  });
});

describe("Catat manual", () => {
  const manual = { kind: "klaim", employeeId: PERSON, date: "2026-11-20", time: "09:30", ...drink, key: KEY };
  it("records a claim as one drink, without meeting fields", () => {
    expect(manualSchema.parse({ ...manual, qty: 4, room: "Vasuki Room", guest: "Contoh Tamu", guestCount: 3 })).toMatchObject({ kind: "klaim", qty: 1, room: undefined, guest: undefined, guestCount: undefined });
    expect(manualSchema.parse({ ...manual, kind: "tamu", qty: 4, room: "Vasuki Room", guest: "Contoh Tamu", guestCount: 3 })).toMatchObject({ qty: 4, room: "Vasuki Room", guest: "Contoh Tamu", guestCount: 3 });
    expect(manualSchema.parse({ ...manual, kind: "tim", guest: "Contoh Tamu" })).toMatchObject({ qty: 1, guest: undefined });
  });
  it("takes a drink off the menu only with its name", () => {
    expect(fields(manualSchema.safeParse({ ...manual, slug: "lainnya" }))).toEqual({ other: "Tulis nama minumannya." });
    expect(fields(manualSchema.safeParse({ ...manual, slug: "lainnya", other: "  " }))).toEqual({ other: "Tulis nama minumannya." });
    expect(manualSchema.parse({ ...manual, slug: "lainnya", other: " Teh tarik " })).toMatchObject({ slug: "lainnya", other: "Teh tarik" });
    expect(manualSchema.parse({ ...manual, other: "Teh tarik" }).other).toBeUndefined();
    expect(fields(manualSchema.safeParse({ ...manual, slug: "tidak-ada" }))).toEqual({ slug: "Pilih minuman." });
  });
  it("asks for the person in the words of its kind, and refuses the future", () => {
    expect(fields(manualSchema.safeParse({ ...manual, employeeId: "" }))).toEqual({ employeeId: "Pilih nama karyawan." });
    expect(fields(manualSchema.safeParse({ ...manual, kind: "tamu", employeeId: undefined }))).toEqual({ employeeId: "Pilih PIC tamu." });
    expect(fields(manualSchema.safeParse({ ...manual, date: "2999-01-01" }))).toEqual({ date: "Tanggal dan jam tidak boleh di masa depan." });
    expect(manualSchema.safeParse({ ...manual, date: "2026-02-30" }).success).toBe(false);
    expect(manualSchema.safeParse({ ...manual, time: "24:00" }).success).toBe(false);
  });
  // Audit V-1: a date or a clock that is not one used to throw inside the check for the future (503 instead of 422).
  it("names the field for an empty or impossible date or clock, and never throws", () => {
    expect(fields(manualSchema.safeParse({ ...manual, time: "" }))).toEqual({ time: "Jam tidak dikenali." });
    expect(fields(manualSchema.safeParse({ ...manual, time: "aa:bb" }))).toEqual({ time: "Jam tidak dikenali." });
    expect(fields(manualSchema.safeParse({ ...manual, time: undefined }))).toEqual({ time: "Isi jam." });
    expect(fields(manualSchema.safeParse({ ...manual, date: "2026-13-45" }))).toEqual({ date: "Tanggal tidak dikenali." });
    expect(fields(manualSchema.safeParse({ ...manual, date: "" }))).toEqual({ date: "Tanggal tidak dikenali." });
    expect(fields(manualSchema.safeParse({ ...manual, date: undefined, time: null }))).toEqual({ date: "Isi tanggal.", time: "Isi jam." });
    expect(fields(manualSchema.safeParse({ ...manual, date: "2026-02-30", time: "9:5" }))).toEqual({ date: "Tanggal tidak dikenali.", time: "Jam tidak dikenali." });
  });
  // Audit B-2: without a key a second sending is a second record.
  it("needs the sheet's key", () => {
    expect(fields(manualSchema.safeParse({ ...manual, key: undefined }))).toHaveProperty("key");
    expect(fields(manualSchema.safeParse({ ...manual, key: "" }))).toHaveProperty("key");
    expect(manualSchema.parse(manual).key).toBe(KEY);
  });
});

describe("Pengaturan and Rekap", () => {
  it("keeps the quotas between 0 and 60, whole numbers", () => {
    expect(settingsSchema.parse({ karyawan: 4, ga: 2, intern: 0 })).toEqual({ karyawan: 4, ga: 2, intern: 0 });
    expect(settingsSchema.safeParse({ karyawan: 61, ga: 2, intern: 2 }).success).toBe(false);
    expect(settingsSchema.safeParse({ karyawan: 4, ga: -1, intern: 2 }).success).toBe(false);
    expect(settingsSchema.safeParse({ karyawan: 4, ga: 1.5, intern: 2 }).success).toBe(false);
    expect(settingsSchema.safeParse({ karyawan: "4", ga: 2, intern: 2 }).success).toBe(false);
  });
  it("reads Rekap's filter from the address, a year at most", () => {
    expect(recapQuerySchema.parse({ dari: "2026-11-01", sampai: "2026-11-30", jenis: "", status: "", q: "" })).toEqual({ dari: "2026-11-01", sampai: "2026-11-30", jenis: undefined, status: undefined, q: undefined });
    expect(recapQuerySchema.parse({ dari: "2026-11-01", sampai: "2026-11-30", jenis: "tamu", status: "ditolak", q: " latte " })).toMatchObject({ jenis: "tamu", status: "ditolak", q: "latte" });
    expect(fields(recapQuerySchema.safeParse({ dari: "2026-11-30", sampai: "2026-11-01" }))).toHaveProperty("sampai");
    expect(fields(recapQuerySchema.safeParse({ dari: "2025-01-01", sampai: "2026-11-01" }))).toHaveProperty("sampai");
    expect(recapQuerySchema.safeParse({ dari: "2026-11-01" }).success).toBe(false);
    expect(recapQuerySchema.safeParse({ dari: "2026-11-01", sampai: "2026-11-30", jenis: "rapat" }).success).toBe(false);
    expect(recapQuerySchema.safeParse({ dari: "2026-11-01", sampai: "2026-11-30", q: "x".repeat(81) }).success).toBe(false);
  });
});
