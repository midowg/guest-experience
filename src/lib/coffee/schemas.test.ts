import { describe, expect, it } from "vitest";
import { coffeePath } from "../routes";
import { ALL_OPTIONS, DRINKS, NO_OPTIONS, drinkBySlug } from "./menu";
import { claimSchema, coffeePushSchema, drinklineSchema, isPushServiceUrl, manualSchema, meetingSchema, optionsSchema, recapQuerySchema, rejectSchema, settingsSchema, settleLine } from "./schemas";

const KEY = "11111111-1111-4111-8111-111111111111";
const PERSON = "22222222-2222-4222-8222-222222222222";
const drink = { slug: "cafe-latte", temperature: "es", sugar: "Sedikit", ice: "Ekstra" } as const;
const fields = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((result.error?.issues ?? []).map(issue => [issue.path.join("."), issue.message]));

describe("a drink", () => {
  // F6: the shape only says what a line may look like; the menu and the options decide the rest (settleLine).
  it("may come with or without its options, but never with a value that is not one", () => {
    expect(drinklineSchema.parse(drink)).toEqual(drink);
    expect(drinklineSchema.parse({ slug: "cafe-latte" })).toEqual({ slug: "cafe-latte" });
    expect(drinklineSchema.parse({ slug: "cafe-latte", temperature: null, sugar: "", ice: null })).toEqual({ slug: "cafe-latte" });
    expect(drinklineSchema.safeParse({ ...drink, sugar: "Banyak" }).success).toBe(false);
    expect(drinklineSchema.safeParse({ ...drink, temperature: "hangat" }).success).toBe(false);
    expect(drinklineSchema.safeParse({ ...drink, ice: "Banyak" }).success).toBe(false);
    expect(fields(drinklineSchema.safeParse({ temperature: "es" }))).toEqual({ slug: "Pilih minuman." });
  });
  const latte = drinkBySlug("cafe-latte"), espresso = drinkBySlug("espresso"), cucumber = drinkBySlug("cucumber-ice");
  it("with every option asked: must be on the menu, come in the temperature asked for, and carry its sugar", () => {
    expect(settleLine(drink, latte, ALL_OPTIONS)).toEqual({ temperature: "es", sugar: "Sedikit", ice: "Ekstra" });
    expect(settleLine({ ...drink, slug: "es-teh-manis" }, undefined, ALL_OPTIONS)).toEqual({ field: "slug", message: "Pilih minuman." });
    expect(settleLine({ ...drink, slug: "espresso" }, espresso, ALL_OPTIONS)).toEqual({ field: "temperature", message: "Espresso hanya tersedia panas." });
    expect(settleLine({ ...drink, slug: "cucumber-ice", temperature: "panas" }, cucumber, ALL_OPTIONS)).toEqual({ field: "temperature", message: "Cucumber Ice hanya tersedia dingin (es)." });
    expect(settleLine({ slug: "cafe-latte", sugar: "Normal" }, latte, ALL_OPTIONS)).toEqual({ field: "temperature", message: "Pilih panas atau es." });
    expect(settleLine({ slug: "cafe-latte", temperature: "panas" }, latte, ALL_OPTIONS)).toEqual({ field: "sugar", message: "Pilih takaran gula." });
    // A drink that comes one way only needs no temperature sent.
    expect(settleLine({ slug: "espresso", sugar: "Tanpa" }, espresso, ALL_OPTIONS)).toEqual({ temperature: "panas", sugar: "Tanpa", ice: null });
    expect(settleLine({ slug: "cucumber-ice", sugar: "Normal" }, cucumber, ALL_OPTIONS)).toEqual({ temperature: "es", sugar: "Normal", ice: "Normal" });
  });
  it("carries no ice level when hot, whatever was sent", () => {
    expect(settleLine({ ...drink, temperature: "panas" }, latte, ALL_OPTIONS)).toEqual({ temperature: "panas", sugar: "Sedikit", ice: null });
  });
  it("drops what its audience is not asked, whatever the browser sent: null, never a made-up default", () => {
    expect(settleLine(drink, latte, NO_OPTIONS)).toEqual({ temperature: null, sugar: null, ice: null });
    expect(settleLine({ slug: "cafe-latte" }, latte, NO_OPTIONS)).toEqual({ temperature: null, sugar: null, ice: null });
    // An unfitting temperature is not even looked at when the temperature is not asked.
    expect(settleLine({ ...drink, slug: "espresso" }, espresso, NO_OPTIONS)).toEqual({ temperature: null, sugar: null, ice: null });
    expect(settleLine(drink, latte, { suhu: false, gula: true, es: false })).toEqual({ temperature: null, sugar: "Sedikit", ice: null });
    expect(settleLine(drink, latte, { suhu: true, gula: false, es: false })).toEqual({ temperature: "es", sugar: null, ice: null });
    // Takaran es never counts without the temperature.
    expect(settleLine(drink, latte, { suhu: false, gula: false, es: true })).toEqual({ temperature: null, sugar: null, ice: null });
  });
  it("takes a drink off the menu ('lainnya', Catat manual) in any temperature", () => {
    expect(settleLine({ ...drink, slug: "lainnya" }, undefined, ALL_OPTIONS)).toEqual({ temperature: "es", sugar: "Sedikit", ice: "Ekstra" });
    expect(settleLine({ slug: "lainnya" }, undefined, NO_OPTIONS)).toEqual({ temperature: null, sugar: null, ice: null });
  });
  it("is seeded as 15 drinks, each with its static photo and shown", () => {
    expect(DRINKS).toHaveLength(15);
    expect(DRINKS.every(item => item.active && item.photo === coffeePath.photo(item.slug))).toBe(true);
  });
});

describe("Opsi minuman", () => {
  const all = { suhu: true, gula: true, es: true }, none = { suhu: false, gula: false, es: false };
  it("takes three switches for each of the three audiences", () => {
    expect(optionsSchema.parse({ klaim: none, tim: all, tamu: all })).toEqual({ klaim: none, tim: all, tamu: all });
    expect(optionsSchema.safeParse({ klaim: none, tim: all }).success).toBe(false);
    expect(optionsSchema.safeParse({ klaim: { ...none, gula: "ya" }, tim: all, tamu: all }).success).toBe(false);
    expect(optionsSchema.safeParse({ klaim: { suhu: true }, tim: all, tamu: all }).success).toBe(false);
  });
  it("never keeps takaran es on without the temperature", () => {
    expect(optionsSchema.parse({ klaim: { suhu: false, gula: true, es: true }, tim: all, tamu: all }).klaim).toEqual({ suhu: false, gula: true, es: false });
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
    expect(fields(meetingSchema.safeParse({ ...order, items: [{ for: "tamu", ...drink, sugar: "Banyak", qty: 1 }] }))).toHaveProperty("items.0.sugar");
    // F6: a line may come without options (its audience is not asked them).
    expect(meetingSchema.parse({ ...order, items: [{ for: "tamu", slug: "espresso", qty: 1 }] }).items[0]).toMatchObject({ slug: "espresso", qty: 1 });
    // The guest's own name (26 Nov): optional, trimmed, 40 letters at most, and only on a guest's drink.
    expect(meetingSchema.parse({ ...order, items: [{ for: "tamu", ...drink, qty: 1, guestName: "  Pak Budi " }] }).items[0].guestName).toBe("Pak Budi");
    expect(meetingSchema.parse({ ...order, items: [{ for: "tamu", ...drink, qty: 1, guestName: "   " }] }).items[0].guestName).toBeUndefined();
    expect(meetingSchema.parse({ ...order, items: [{ for: "tamu", ...drink, qty: 1, guestName: "x".repeat(40) }] }).items[0].guestName).toHaveLength(40);
    expect(fields(meetingSchema.safeParse({ ...order, items: [{ for: "tamu", ...drink, qty: 1, guestName: "x".repeat(41) }] }))).toEqual({ "items.0.guestName": "Nama tamu paling panjang 40 huruf." });
    expect(meetingSchema.parse({ ...order, items: [{ for: "tim", personId: PERSON, ...drink, qty: 1, guestName: "Budi" }] }).items[0].guestName).toBeUndefined();
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
    // Whether a drink is on the menu is the server's to say (the menu lives in the database since F6).
    expect(manualSchema.safeParse({ ...manual, slug: "tidak-ada" }).success).toBe(true);
    expect(manualSchema.parse({ kind: "klaim", employeeId: PERSON, date: "2026-11-20", time: "09:30", slug: "cafe-latte", key: KEY })).toMatchObject({ slug: "cafe-latte", qty: 1 });
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

describe("the address of a device's push service (audit F5-04)", () => {
  it("takes the known push services over https only", () => {
    for (const url of ["https://fcm.googleapis.com/fcm/send/abc:def", "https://fcm.googleapis.com/wp/abc", "https://FCM.googleapis.com/fcm/send/abc", "https://fcm.googleapis.com:443/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc", "https://web.push.apple.com/QGuQyavXutnMH", "https://api.push.apple.com/3/device/x", "https://wns2-sg2p.notify.windows.com/w/?token=abc", "https://db5p.notify.windows.com/w/?token=abc"]) {
      expect(isPushServiceUrl(url), url).toBe(true);
    }
  });
  it("refuses every other host, an address by number, another port or scheme, and look-alikes", () => {
    for (const url of ["https://push.example/x", "http://fcm.googleapis.com/fcm/send/abc", "https://fcm.googleapis.com:8443/x", "https://fcm.googleapis.com.evil.example/x", "https://evilfcm.googleapis.com/x",
      "https://xfcm.googleapis.com/x", "https://googleapis.com/x", "https://push.apple.com/x", "https://notify.windows.com/x", "https://evilpush.apple.com/x", "https://web.push.apple.com.evil.example/x",
      "https://user:pw@fcm.googleapis.com/x", "https://fcm.googleapis.com@evil.example/x", "https://evil.example/?u=https://fcm.googleapis.com/", "https://evil.example/#fcm.googleapis.com",
      "https://127.0.0.1/x", "https://10.0.0.1/x", "https://169.254.169.254/latest", "https://[::1]/x", "https://localhost/x", "https://fcm.googleapis.com./x", "wss://fcm.googleapis.com/x", "file:///etc/passwd", "bukan alamat", "", null, 7]) {
      expect(isPushServiceUrl(url), String(url)).toBe(false);
    }
  });
  it("is what the push schema asks of a device", () => {
    const keys = { p256dh: "p".repeat(40), auth: "a".repeat(16) };
    expect(coffeePushSchema.safeParse({ subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys } }).success).toBe(true);
    expect(coffeePushSchema.safeParse({ subscription: { endpoint: "https://push.example/abc", keys } }).success).toBe(false);
  });
});
