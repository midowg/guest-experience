import { describe, expect, it } from "vitest";
import {
  requestSchema, requestSummary,
  dailyStatus, faceKeyFor, instantOf, isOwnFaceKey, isOwnSelfieKey, manualSchema, nextKind, officeSchema, reasonSchema, reviewSchema, selfieKeyFor, usableFace, workDate,
} from "./attendance";

const person = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const file = "33333333-3333-4333-8333-333333333333";

describe("work date", () => {
  it("is the date in the zone of the clock-in", () => {
    // 23.30 WIB on the 19th is 00.30 WITA on the 20th.
    expect(workDate("2026-11-19T16:30:00Z", "WIB")).toBe("2026-11-19");
    expect(workDate("2026-11-19T16:30:00Z", "WITA")).toBe("2026-11-20");
  });
  it("turns a clock time in a zone into an instant", () => {
    expect(instantOf("2026-11-20", "08:30", "WIB")).toBe("2026-11-20T01:30:00.000Z");
    expect(instantOf("2026-11-20", "08:30", "WITA")).toBe("2026-11-20T00:30:00.000Z");
  });
});

describe("status", () => {
  it("is sah with a matching face inside an office", () => {
    expect(dailyStatus({ inside: true, face: "cocok", faceStatus: "aktif" })).toEqual({ status: "sah", flags: [] });
  });
  it("waits for an admin outside, with a low score, or with a face not approved yet", () => {
    expect(dailyStatus({ inside: false, outsideWhy: "jauh", face: "cocok", faceStatus: "aktif" })).toEqual({ status: "perlu_cek", flags: ["di_luar_area"] });
    expect(dailyStatus({ inside: false, outsideWhy: "tidak_akurat", face: "cocok", faceStatus: "aktif" }).flags).toEqual(["gps_tidak_akurat"]);
    expect(dailyStatus({ inside: true, face: "perlu_cek", faceStatus: "menunggu", pulangWithoutMasuk: true }).flags).toEqual(["skor_rendah", "wajah_belum_disetujui", "belum_absen_masuk"]);
  });
  it("uses only a reference that may be compared", () => {
    expect(usableFace("aktif")).toBe(true);
    expect(usableFace("siap")).toBe(true);
    expect(usableFace("impor")).toBe(false);
    expect(usableFace("ditolak")).toBe(false);
    expect(usableFace(null)).toBe(false);
  });
  it("goes masuk, then pulang, then nothing", () => {
    const record = { id: "x" } as never;
    expect(nextKind({ workDate: "2026-11-20", masuk: null, pulang: null })).toBe("masuk");
    expect(nextKind({ workDate: "2026-11-20", masuk: record, pulang: null })).toBe("pulang");
    expect(nextKind({ workDate: "2026-11-20", masuk: record, pulang: record })).toBeNull();
  });
});

describe("storage keys", () => {
  it("keeps each person's files in their own folder", () => {
    const selfie = selfieKeyFor(person, file, "image/webp");
    expect(selfie).toBe(`pra-wam/absen-harian/${person}/${file}.webp`);
    expect(isOwnSelfieKey(selfie, person, "image/webp")).toBe(true);
    expect(isOwnSelfieKey(selfie, other, "image/webp")).toBe(false);
    expect(isOwnSelfieKey(selfie, person, "image/jpeg")).toBe(false);
    const face = faceKeyFor(person, file, "image/jpeg");
    expect(isOwnFaceKey(face, person, "image/jpeg")).toBe(true);
    expect(isOwnFaceKey(`pra-wam/wajah/${person}/../${file}.jpg`, person, "image/jpeg")).toBe(false);
  });
});

describe("forms", () => {
  it("needs a note for Lainnya and for a refusal", () => {
    expect(reasonSchema.safeParse({ kind: "event", text: "" }).success).toBe(true);
    expect(reasonSchema.safeParse({ kind: "lainnya", text: "" }).success).toBe(false);
    expect(reviewSchema.safeParse({ status: "sah" }).success).toBe(true);
    expect(reviewSchema.safeParse({ status: "ditolak", note: "" }).success).toBe(false);
  });
  it("checks an office point", () => {
    expect(officeSchema.safeParse({ name: "Kantor Contoh", lat: -7.8, lng: 110.4, radiusM: 100, zone: "WIB" }).success).toBe(true);
    expect(officeSchema.safeParse({ name: "Kantor Contoh", lat: -7.8, lng: 110.4, radiusM: 10, zone: "WIB" }).success).toBe(false);
  });
  it("checks a manual record", () => {
    expect(manualSchema.safeParse({ employeeId: person, workDate: "2026-11-20", kind: "masuk", time: "08:30", note: "HP rusak" }).success).toBe(true);
    expect(manualSchema.safeParse({ employeeId: person, workDate: "2026-11-20", kind: "masuk", time: "25:00", note: "HP rusak" }).success).toBe(false);
  });
});

describe("revisi", () => {
  const base = { workDate: "2026-11-20", kind: "masuk", note: "HP mati" };
  it("asks for a time when adding or moving one, a clock-in for the rest, and a reason always", () => {
    expect(requestSchema.safeParse({ ...base, type: "tambah", time: "08:15" }).success).toBe(true);
    expect(requestSchema.safeParse({ ...base, type: "tambah" }).success).toBe(false);
    expect(requestSchema.safeParse({ ...base, type: "ubah_jam", time: "08:15" }).success).toBe(false);
    expect(requestSchema.safeParse({ ...base, type: "ubah_jam", time: "08:15", recordId: person }).success).toBe(true);
    expect(requestSchema.safeParse({ ...base, type: "ubah_alasan", recordId: person }).success).toBe(false);
    expect(requestSchema.safeParse({ ...base, type: "ubah_alasan", recordId: person, reasonKind: "wfh" }).success).toBe(true);
    expect(requestSchema.safeParse({ ...base, type: "batal", recordId: person, note: "" }).success).toBe(false);
  });
  it("says what is asked in one line", () => {
    expect(requestSummary({ type: "tambah", kind: "pulang", proposedTime: "17:30", reasonKind: null, reasonText: null })).toBe("Pulang 17.30 (lupa absen)");
    expect(requestSummary({ type: "ubah_jam", kind: "masuk", proposedTime: "08:15", reasonKind: null, reasonText: null })).toBe("Masuk jadi 08.15");
    expect(requestSummary({ type: "ubah_alasan", kind: "masuk", proposedTime: null, reasonKind: "event", reasonText: "Venue" })).toBe("Masuk: Event / venue · Venue");
    expect(requestSummary({ type: "batal", kind: "masuk", proposedTime: null, reasonKind: null, reasonText: null })).toBe("Hapus absen masuk");
  });
});
