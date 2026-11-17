import { describe, expect, it } from "vitest";
import { defaultSettings } from "../settings";
import { samplePeople, sampleTrips } from "../sample";
import { carbonInputSchema, eventInfoColumns, eventInfoSchema, eventInfoOf } from "./event-info";
import { fileLabel, guideFileKey, guideFileStartSchema, guideInputSchema, guideSlug, isGuideFileKey } from "./guides";
import { sampleAdminPeople } from "./sample";
import { blankTrip, carbonLine, parseSeatPaste, seatsInputSchema, tripInputSchema, tripRow, tripToInput } from "./trips";

describe("perjalanan", () => {
  const valid = { ...blankTrip("berangkat", "2027-01-04"), kind: "kereta" as const, title: "Kereta", start: "06:30", end: "14:00", distanceKm: 350 };
  it("checks a step and turns its WIB times into instants", () => {
    expect(tripInputSchema.safeParse(valid).success).toBe(true);
    expect(tripRow(valid)).toMatchObject({ starts_at: "2027-01-03T23:30:00.000Z", ends_at: "2027-01-04T07:00:00.000Z", distance_km: 350 });
    expect(tripRow({ ...valid, date: null, start: null, end: null }).starts_at).toBeNull();
    const issues = (input: object) => tripInputSchema.safeParse({ ...valid, ...input }).error?.issues.map(issue => issue.message) ?? [];
    expect(issues({ end: "06:00" })).toContain("Jam tiba harus setelah jam berangkat.");
    expect(issues({ date: null })).toContain("Pilih harinya juga.");
    expect(issues({ mapUrl: "http://maps.example" })).toContain("Tautan peta diawali https://.");
    expect(issues({ distanceKm: -1 })).toContain("Jarak tidak boleh minus.");
    expect(issues({ vehicles: 2.5 })).toContain("Jumlah kendaraan bilangan bulat.");
  });
  it("round-trips a saved step and says what Jejak karbon reads", () => {
    const shuttle = sampleTrips[2];
    expect(tripToInput(shuttle)).toMatchObject({ date: "2027-01-04", start: "14:30", end: null, distanceKm: 22, vehicles: 4 });
    expect(carbonLine(shuttle)).toBe("22 km · 4 bus");
    expect(carbonLine(sampleTrips[1])).toBe("350 km");
    expect(carbonLine(sampleTrips[0])).toBe("");
  });
  it("reads seats pasted from a sheet", () => {
    const paste = ["Nama karyawan\tKursi\tKendaraan", "Rani Contoh\tGerbong 3 · 12A\t", "Sari\t\tBus 2", "Budi\t1A\t", "Rani Contoh\t1B\t", "Dewi Contoh\t\t"].join("\n");
    const rows = parseSeatPaste(paste, sampleAdminPeople).rows;
    expect(rows[0].input).toEqual({ employeeId: samplePeople.rani.id, seat: "Gerbong 3 · 12A", vehicle: "" });
    expect(rows[1].input).toEqual({ employeeId: samplePeople.sari.id, seat: "", vehicle: "Bus 2" });
    expect(rows[2].errors[0]).toMatch(/Budi tidak ada/);
    expect(rows[3].errors).toEqual(["Rani Contoh sudah ada di baris 2."]);
    expect(rows[4].errors).toEqual(["Isi kursi atau kendaraannya."]);
    expect(seatsInputSchema.safeParse({ seats: [rows[0].input, rows[0].input], replace: false }).success).toBe(false);
  });
});

describe("panduan", () => {
  it("makes an address from the title, unique among the others", () => {
    expect(guideSlug("Hotel & fasilitas", [])).toBe("hotel-dan-fasilitas");
    expect(guideSlug("Denah venue", ["denah-venue"])).toBe("denah-venue-2");
    expect(guideSlug("Ä", [])).toBe("a-panduan");
    expect(guideSlug("!!!", [])).toBe("panduan");
    expect(guideSlug("Tata tertib kegiatan trekking Coban Rondo dan sekitarnya", [])).toMatch(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/);
  });
  it("names files the way the migration accepts", () => {
    const key = guideFileKey("11111111-1111-4111-8111-111111111111", "application/pdf");
    expect(key).toBe("main-wam/panduan/11111111-1111-4111-8111-111111111111.pdf");
    expect(isGuideFileKey(key)).toBe(true);
    expect(isGuideFileKey("main-wam/momen/x.pdf")).toBe(false);
    expect(guideFileStartSchema.safeParse({ guideId: "11111111-1111-4111-8111-111111111111", mime: "image/gif", size: 10 }).success).toBe(false);
    expect(guideFileStartSchema.safeParse({ guideId: "11111111-1111-4111-8111-111111111111", mime: "application/pdf", size: 26 * 1024 * 1024 }).success).toBe(false);
    expect(fileLabel({ mime: "application/pdf", size: 1_150_000, version: "1" })).toBe("PDF · 1,1 MB");
    expect(fileLabel({ mime: "image/webp", size: 640_000, version: "1" })).toBe("Gambar · 625 KB");
  });
  it("keeps text plain and bounded", () => {
    expect(guideInputSchema.parse({ kind: "hotel", title: "Hotel", body: " Baris 1\r\nBaris 2 ", sort: 1, published: true }).body).toBe("Baris 1\nBaris 2");
    expect(guideInputSchema.safeParse({ kind: "komitmen", title: "Hotel", body: "", sort: 1, published: true }).success).toBe(false);
  });
});

describe("info acara", () => {
  it("accepts any part and refuses check-out before check-in", () => {
    expect(eventInfoSchema.safeParse({ hotel: "Hotel (contoh)" }).success).toBe(true);
    expect(eventInfoSchema.safeParse({ checkIn: { date: "2027-01-04", time: "15:30" }, checkOut: { date: "2027-01-04", time: "10:00" } }).error?.issues[0].message).toBe("Check-out harus setelah check-in.");
    expect(eventInfoSchema.safeParse({ mode: "semua" }).success).toBe(false);
  });
  it("marks the bills final only when all four are in", () => {
    expect(carbonInputSchema.safeParse({ listrikKwh: 1, airM3: 2, lpgKg: null, sampahKg: 4, final: true }).success).toBe(false);
    expect(carbonInputSchema.safeParse({ listrikKwh: 1, airM3: 2, lpgKg: 3, sampahKg: 4, final: true }).success).toBe(true);
    expect(carbonInputSchema.safeParse({ listrikKwh: -1, airM3: null, lpgKg: null, sampahKg: null, final: false }).success).toBe(false);
  });
  it("writes only the parts sent, and keeps the first publishing time", () => {
    const now = new Date("2026-12-20T03:00:00Z");
    expect(eventInfoColumns({ address: "Jl. Contoh No. 1" }, now, null)).toEqual({ hotel_address: "Jl. Contoh No. 1" });
    expect(eventInfoColumns({ checkIn: { date: "2027-01-04", time: "15:30" }, checkOut: null }, now, null)).toEqual({ check_in_at: "2027-01-04T08:30:00.000Z", check_out_at: null });
    expect(eventInfoColumns({ groupsPublished: true }, now, null)).toEqual({ groups_published_at: now.toISOString() });
    expect(eventInfoColumns({ groupsPublished: true }, now, "2026-12-01T00:00:00Z")).toEqual({ groups_published_at: "2026-12-01T00:00:00Z" });
    expect(eventInfoColumns({ groupsPublished: false }, now, "2026-12-01T00:00:00Z")).toEqual({ groups_published_at: null });
    expect(eventInfoOf(defaultSettings())).toMatchObject({ name: "WAM 2026", checkIn: null, contacts: { kamar: null, perjalanan: null, umum: null } });
  });
});
