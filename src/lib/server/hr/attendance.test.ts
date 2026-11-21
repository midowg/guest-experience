import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_VERSION } from "@/lib/hr/attendance";
import { FACE_MODEL_VERSION, normalize } from "@/lib/hr/face-match";
import { pickChallenge, type FrameSignal, type LivenessStep } from "@/lib/hr/liveness";
import type { Member } from "../pra-wam/session";

/* Absen harian against a small in-memory stand-in for Supabase and R2. Made-up people and places. */
type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
const conflictKeys: Record<string, string[]> = { pw_daily_attendance: ["employee_id", "work_date", "kind"], pw_face_profiles: ["employee_id"], pw_hr_settings: ["id"] };

function query(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let mode: { kind: "select" } | { kind: "upsert"; row: Row; ignore: boolean } | { kind: "insert"; row: Row } | { kind: "update"; patch: Row } | { kind: "delete" } = { kind: "select" };
  let single = false;
  let limit = Infinity;
  let order: { key: string; ascending: boolean } | null = null;
  const rows = () => (db[table] ??= []);
  const run = () => {
    if (mode.kind === "upsert" || mode.kind === "insert") {
      // The database's own defaults for the columns a row leaves out.
      const defaults: Row = table === "pw_attendance_requests" ? { status: "menunggu", created_at: "2026-11-20T00:00:00Z" } : {};
      const row: Row = { id: `${table}-${rows().length + 1}`, ...defaults, ...mode.row };
      const keys = conflictKeys[table] ?? ["id"];
      const clash = rows().find(item => keys.every(key => item[key] === row[key]));
      if (clash) {
        if (mode.kind === "insert") return { data: null, error: { code: "23505", message: "duplicate" } };
        if (mode.ignore) return { data: [], error: null };
        Object.assign(clash, row);
        return { data: [clash], error: null };
      }
      rows().push(row);
      return { data: single ? row : [row], error: null };
    }
    let found = rows().filter(row => filters.every(test => test(row)));
    if (mode.kind === "update") { found.forEach(row => Object.assign(row, (mode as { patch: Row }).patch)); return { data: single ? found[0] ?? null : found, error: null }; }
    if (mode.kind === "delete") { db[table] = rows().filter(row => !found.includes(row)); return { data: found, error: null }; }
    if (order) { const { key, ascending } = order; found = [...found].sort((a, b) => (String(a[key]) < String(b[key]) ? -1 : 1) * (ascending ? 1 : -1)); }
    found = found.slice(0, limit);
    return { data: single ? found[0] ?? null : found, error: null };
  };
  const builder = {
    select: () => builder,
    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return builder; },
    neq: (key: string, value: unknown) => { filters.push(row => row[key] !== value); return builder; },
    single: () => { single = true; return builder; },
    gte: (key: string, value: string) => { filters.push(row => String(row[key]) >= value); return builder; },
    lt: (key: string, value: string) => { filters.push(row => String(row[key]) < value); return builder; },
    in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return builder; },
    not: (key: string) => { filters.push(row => row[key] !== null && row[key] !== undefined); return builder; },
    order: (key: string, options?: { ascending?: boolean }) => { order ??= { key, ascending: options?.ascending ?? true }; return builder; },
    limit: (value: number) => { limit = value; return builder; },
    maybeSingle: () => { single = true; return builder; },
    upsert: (row: Row, options?: { ignoreDuplicates?: boolean }) => { mode = { kind: "upsert", row, ignore: Boolean(options?.ignoreDuplicates) }; return builder; },
    insert: (row: Row) => { mode = { kind: "insert", row }; return builder; },
    update: (patch: Row) => { mode = { kind: "update", patch }; return builder; },
    delete: () => { mode = { kind: "delete" }; return builder; },
    then: (resolve: (result: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return builder;
}

const removeObjects = vi.fn(async (keys: string[]) => { void keys; });
const putObject = vi.fn(async (key: string, bytes: Uint8Array, type: string) => { void key; void bytes; void type; });
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]);
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: query }) }));
vi.mock("../r2", () => ({
  isR2Configured: () => true,
  presignUpload: async (key: string) => `https://r2.example/${key}?signed`,
  presignDownload: async (key: string) => `https://r2.example/${key}?view`,
  uploadedStart: async () => webp,
  removeObjects: (keys: string[]) => removeObjects(keys),
  readObject: async () => null,
  copyObject: async () => undefined,
  putObject: (key: string, bytes: Uint8Array, type: string) => putObject(key, bytes, type),
}));
vi.mock("../pra-wam/appraisal", () => ({ listPeople: async () => [{ id: PERSON, name: "Contoh", fullName: "Contoh Satu", department: "Contoh", active: true }] }));
vi.mock("../pra-wam/zone", () => ({ viewerZone: async () => "WIB" }));

const PERSON = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";
const OFFICE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const member: Member = { id: PERSON, name: "Contoh", nickname: "Contoh", department: "Contoh", position: "Staf", mustChangePassword: false, roles: [], photo: null };
const other: Member = { ...member, id: OTHER };
// Jumat 20 Nov 2026, 08.30 WIB.
const morning = new Date("2026-11-20T01:30:00Z");

const { createRequest, decideRequest, deleteOldSelfies, deleteRecord, importFaceFromLink, readChallenge, setImportedFace, setUploadedFace, startClockIn, startEnroll, startFaceUpload, startUpload, submitClockIn, submitEnroll } = await import("./attendance");

/** A made-up face: a fixed direction, and looks of it with a little noise. */
function vector(seed: number): number[] {
  let state = seed;
  return normalize(Array.from({ length: 128 }, () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648 - 0.5; }));
}
const face = vector(7);
const stranger = vector(91);
const look = (base: number[], seed: number) => normalize(base.map((value, i) => value + 0.02 * vector(seed)[i]));

function signalsFor(steps: LivenessStep[]): FrameSignal[] {
  const neutral = { blinkLeft: 0.05, blinkRight: 0.05, smileLeft: 0.05, smileRight: 0.05, yaw: 0 };
  const poses: Partial<FrameSignal>[] = [{}];
  for (const step of steps) {
    if (step === "kedip") poses.push({ blinkLeft: 0.8, blinkRight: 0.8 });
    if (step === "senyum") poses.push({ smileLeft: 0.7, smileRight: 0.7 });
    if (step === "toleh_kiri") poses.push({ yaw: -25 });
    if (step === "toleh_kanan") poses.push({ yaw: 25 });
    poses.push({});
  }
  return poses.map((pose, i) => ({ t: i * 100, ...neutral, ...pose }));
}

async function clockIn(who: Member, base: number[], extra: { lat?: number; lng?: number; accuracyM?: number; reason?: { kind: "event"; text: string }; consent?: typeof CONSENT_VERSION } = {}, kind: "masuk" | "pulang" = "masuk") {
  const start = await startClockIn(who, kind, morning);
  if (start.kind !== "tantangan") throw new Error(`no challenge: ${start.kind}`);
  const upload = await startUpload(who, { token: start.challenge.token, mime: "image/webp", size: 40_000 }, morning);
  const frames = [look(base, 1), look(base, 2), look(base, 3)];
  return submitClockIn(who, {
    token: start.challenge.token,
    embedding: normalize(frames.reduce((sum, frame) => sum.map((value, i) => value + frame[i]), new Array(128).fill(0))),
    frameEmbeddings: frames,
    signals: signalsFor(start.challenge.steps),
    location: { lat: extra.lat ?? -7.8, lng: extra.lng ?? 110.4, accuracyM: extra.accuracyM ?? 15 },
    selfie: { key: upload.key, mime: "image/webp", size: 40_000, token: upload.token },
    reason: extra.reason,
    consent: extra.consent,
  }, morning);
}

beforeEach(() => {
  vi.stubEnv("WAM_SESSION_SECRET", "x".repeat(40));
  removeObjects.mockClear();
  db = {
    pw_offices: [{ id: OFFICE, name: "Kantor Contoh", lat: -7.8, lng: 110.4, radius_m: 100, zone: "WIB", active: true, sort_order: 0 }],
    pw_face_profiles: [{ employee_id: PERSON, embedding: face, model_version: FACE_MODEL_VERSION, photo_key: null, source: "daftar", status: "aktif", note: null, consent_at: "2026-11-19T00:00:00Z", updated_at: "2026-11-19T00:00:00Z" }],
    pw_daily_attendance: [],
    pw_accounts: [{ employee_id: PERSON, active: true }],
    pw_hr_settings: [{ id: true, clock_method: "gerakan" }],
    pw_attendance_requests: [],
  };
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("clock-in", () => {
  it("records a matching face inside an office as sah, once a day", async () => {
    const first = await clockIn(member, face);
    expect(first.kind).toBe("tercatat");
    expect(first.record).toMatchObject({ kind: "masuk", status: "sah", officeName: "Kantor Contoh", workDate: "2026-11-20", flags: [] });
    expect(db.pw_daily_attendance).toHaveLength(1);
    expect(await startClockIn(member, "masuk", morning)).toMatchObject({ kind: "sudah" });
  });

  it("asks someone without a face to enrol first", async () => {
    db.pw_face_profiles = [];
    expect(await startClockIn(member, "masuk", morning)).toMatchObject({ kind: "daftar" });
  });

  it("refuses a stranger's face, records nothing and deletes the selfie", async () => {
    await expect(clockIn(member, stranger)).rejects.toMatchObject({ status: 422 });
    expect(db.pw_daily_attendance).toHaveLength(0);
    expect(removeObjects).toHaveBeenCalledTimes(1);
  });

  it("needs a reason outside every office point, then waits for an admin", async () => {
    await expect(clockIn(member, face, { lat: -7.9 })).rejects.toMatchObject({ status: 422 });
    const answer = await clockIn(member, face, { lat: -7.9, reason: { kind: "event", text: "Venue klien" } });
    expect(answer.record).toMatchObject({ status: "perlu_cek", flags: ["di_luar_area"], reasonKind: "event", officeName: "Kantor Contoh" });
  });

  it("does not trust a vague location as inside", async () => {
    const answer = await clockIn(member, face, { accuracyM: 500, reason: { kind: "event", text: "" } });
    expect(answer.record.flags).toEqual(["gps_tidak_akurat"]);
  });

  it("flags pulang without masuk", async () => {
    const answer = await clockIn(member, face, {}, "pulang");
    expect(answer.record).toMatchObject({ kind: "pulang", status: "perlu_cek", flags: ["belum_absen_masuk"] });
  });

  it("refuses another person's token and upload", async () => {
    const start = await startClockIn(member, "masuk", morning);
    if (start.kind !== "tantangan") throw new Error("no challenge");
    expect(() => readChallenge(start.challenge.token, other, morning)).toThrow();
    expect(() => readChallenge(start.challenge.token, member, new Date(morning.getTime() + 10 * 60_000))).toThrow(/habis/);
  });

  it("needs consent with an imported GreatDay face, then makes it the person's own", async () => {
    db.pw_face_profiles[0] = { ...db.pw_face_profiles[0], source: "greatday", status: "siap", consent_at: null };
    expect(await startClockIn(member, "masuk", morning)).toMatchObject({ kind: "tantangan", needsConsent: true });
    await expect(clockIn(member, face)).rejects.toMatchObject({ status: 409 });
    const answer = await clockIn(member, face, { consent: CONSENT_VERSION });
    expect(answer.kind).toBe("tercatat");
    expect(db.pw_face_profiles[0]).toMatchObject({ status: "aktif", consent_version: CONSENT_VERSION });
  });
});

describe("enrolment", () => {
  async function enroll(base: number[]) {
    const challenge = await startEnroll(member, morning);
    const upload = await startUpload(member, { token: challenge.token, mime: "image/webp", size: 40_000 }, morning);
    return submitEnroll(member, {
      consent: CONSENT_VERSION, token: challenge.token, embeddings: [look(base, 4), look(base, 5), look(base, 6)], signals: signalsFor(pickChallenge(challenge.nonce)),
      photo: { key: upload.key, mime: "image/webp", size: 40_000, token: upload.token },
    }, morning);
  }

  it("is in use at once when it matches the GreatDay photo", async () => {
    db.pw_face_profiles[0] = { ...db.pw_face_profiles[0], source: "greatday", status: "siap", consent_at: null };
    expect(await enroll(face)).toEqual({ status: "aktif" });
  });

  it("waits for an admin when it does not match, or when there is no photo to compare", async () => {
    db.pw_face_profiles[0] = { ...db.pw_face_profiles[0], source: "greatday", status: "siap", consent_at: null };
    expect(await enroll(stranger)).toEqual({ status: "menunggu" });
    db.pw_face_profiles = [];
    expect(await enroll(face)).toEqual({ status: "menunggu" });
  });

  it("is refused while a face is already in use", async () => {
    await expect(startEnroll(member, morning)).rejects.toMatchObject({ status: 409 });
  });
});

describe("Foto cepat (21 Nov 2026)", () => {
  it("takes one selfie with no liveness steps and records the method", async () => {
    db.pw_hr_settings = [{ id: true, clock_method: "foto" }];
    const start = await startClockIn(member, "masuk", morning);
    if (start.kind !== "tantangan") throw new Error("no challenge");
    expect(start.challenge).toMatchObject({ method: "foto", steps: [] });
    const upload = await startUpload(member, { token: start.challenge.token, mime: "image/webp", size: 40_000 }, morning);
    const frames = [look(face, 1), look(face, 2)];
    const answer = await submitClockIn(member, {
      token: start.challenge.token, embedding: normalize(frames[0].map((value, i) => value + frames[1][i])), frameEmbeddings: frames,
      signals: [{ t: 0, blinkLeft: 0.05, blinkRight: 0.05, smileLeft: 0.05, smileRight: 0.05, yaw: 0 }],
      location: { lat: -7.8, lng: 110.4, accuracyM: 15 }, selfie: { key: upload.key, mime: "image/webp", size: 40_000, token: upload.token },
    }, morning);
    expect(answer.record).toMatchObject({ status: "sah", faceMethod: "foto" });
    expect(db.pw_daily_attendance[0]).toMatchObject({ face_method: "foto", liveness_steps: [] });
  });
  it("tells how close a refused face was", async () => {
    db.pw_hr_settings = [{ id: true, clock_method: "foto" }];
    const start = await startClockIn(member, "masuk", morning);
    if (start.kind !== "tantangan") throw new Error("no challenge");
    const upload = await startUpload(member, { token: start.challenge.token, mime: "image/webp", size: 40_000 }, morning);
    const frames = [look(stranger, 1), look(stranger, 2)];
    await expect(submitClockIn(member, {
      token: start.challenge.token, embedding: normalize(frames[0].map((value, i) => value + frames[1][i])), frameEmbeddings: frames,
      signals: [{ t: 0, blinkLeft: 0.05, blinkRight: 0.05, smileLeft: 0.05, smileRight: 0.05, yaw: 0 }],
      location: { lat: -7.8, lng: 110.4, accuracyM: 15 }, selfie: { key: upload.key, mime: "image/webp", size: 40_000, token: upload.token },
    }, morning)).rejects.toThrow(/kecocokan \d+%/);
  });
  it("puts a processed GreatDay photo in use at once", async () => {
    db.pw_face_profiles[0] = { ...db.pw_face_profiles[0], source: "greatday", status: "impor", embedding: null, consent_at: null };
    expect(await setImportedFace(PERSON, { embedding: face })).toBe("aktif");
    expect(db.pw_face_profiles[0]).toMatchObject({ status: "aktif", embedding: face });
  });
});

describe("Unggah foto acuan (21 Nov 2026)", () => {
  const admin = { employeeId: OTHER, label: "Admin Contoh" };
  it("gives someone without a face a photo from HR, in use at once, and they clock in with it", async () => {
    db.pw_face_profiles = [];
    expect((await startClockIn(member, "masuk", morning)).kind).toBe("daftar");
    const start = await startFaceUpload(PERSON, { mime: "image/webp", size: 40_000 }, morning);
    expect(start.key).toMatch(new RegExp(`^pra-wam/wajah/${PERSON}/`));
    expect(await setUploadedFace(PERSON, { ...start, mime: "image/webp", size: 40_000, embedding: face }, admin, morning)).toBe("aktif");
    expect(db.pw_face_profiles[0]).toMatchObject({ employee_id: PERSON, source: "greatday", status: "aktif", photo_key: start.key, note: "Foto diunggah Admin Contoh" });
    expect((await clockIn(member, face)).record.status).toBe("sah");
  });
  it("replaces an old photo (and removes it), and refuses a forged or late token", async () => {
    db.pw_face_profiles[0] = { ...db.pw_face_profiles[0], photo_key: `pra-wam/wajah/${PERSON}/old.webp` };
    const start = await startFaceUpload(PERSON, { mime: "image/webp", size: 40_000 }, morning);
    await expect(setUploadedFace(PERSON, { ...start, token: `${start.token.slice(0, -4)}0000`, mime: "image/webp", size: 40_000, embedding: face }, admin, morning)).rejects.toMatchObject({ status: 403 });
    await expect(setUploadedFace(OTHER, { ...start, mime: "image/webp", size: 40_000, embedding: face }, admin, morning)).rejects.toMatchObject({ status: 403 });
    await expect(setUploadedFace(PERSON, { ...start, mime: "image/webp", size: 40_000, embedding: face }, admin, new Date(morning.getTime() + 11 * 60_000))).rejects.toMatchObject({ status: 403 });
    await setUploadedFace(PERSON, { ...start, mime: "image/webp", size: 40_000, embedding: face }, admin, morning);
    expect(removeObjects).toHaveBeenCalledWith([`pra-wam/wajah/${PERSON}/old.webp`]);
  });
  it("fetches a GreatDay photo from its link as an imported photo, which Proses puts in use", async () => {
    db.pw_face_profiles = [];
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 200, url: "https://apic9.greatdayhr.com/storage/x?fileName=a.jpg", arrayBuffer: async () => jpeg.buffer } as unknown as Response);
    try {
      expect(await importFaceFromLink(PERSON, "https://apic9.greatdayhr.com/storage/x?fileName=a.jpg", admin)).toBe("impor");
      expect(putObject).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^pra-wam/wajah/${PERSON}/.+\.jpg$`)), jpeg, "image/jpeg");
      expect(db.pw_face_profiles[0]).toMatchObject({ source: "greatday", status: "impor", embedding: null });
      expect(await setImportedFace(PERSON, { embedding: face })).toBe("aktif");
      // Only GreatDay, only https; nothing is fetched otherwise.
      fetcher.mockClear();
      await expect(importFaceFromLink(PERSON, "https://contoh.example/foto.jpg", admin)).rejects.toMatchObject({ status: 422 });
      await expect(importFaceFromLink(PERSON, "http://apic9.greatdayhr.com/foto.jpg", admin)).rejects.toMatchObject({ status: 422 });
      expect(fetcher).not.toHaveBeenCalled();
      // A redirect away from GreatDay is refused.
      fetcher.mockResolvedValue({ ok: true, status: 200, url: "http://10.0.0.1/x", arrayBuffer: async () => jpeg.buffer } as unknown as Response);
      await expect(importFaceFromLink(PERSON, "https://apic9.greatdayhr.com/storage/y", admin)).rejects.toMatchObject({ status: 502 });
    } finally { fetcher.mockRestore(); }
  });
  it("only for someone who clocks in", async () => {
    await expect(startFaceUpload(OTHER, { mime: "image/webp", size: 40_000 }, morning)).rejects.toMatchObject({ status: 404 });
  });
});

describe("Revisi (21 Nov 2026)", () => {
  const actor = { employeeId: null, label: "Super admin" };
  it("records a forgotten pulang once approved", async () => {
    const asked = await createRequest(member, { type: "tambah", workDate: "2026-11-19", kind: "pulang", recordId: null, time: "17:30", zone: "WIB", reasonKind: null, reasonText: "", note: "HP mati" }, morning);
    expect(asked).toMatchObject({ status: "menunggu", type: "tambah", proposedTime: "17:30" });
    await expect(createRequest(member, { type: "tambah", workDate: "2026-11-19", kind: "pulang", recordId: null, time: "17:40", zone: "WIB", reasonKind: null, reasonText: "", note: "Lagi" }, morning)).rejects.toMatchObject({ status: 409 });
    const decided = await decideRequest(asked.id, { approve: true, note: "" }, actor, morning);
    expect(decided.status).toBe("disetujui");
    expect(db.pw_daily_attendance).toEqual([expect.objectContaining({ kind: "pulang", work_date: "2026-11-19", method: "manual", at: "2026-11-19T10:30:00.000Z", recorded_label: "Super admin (revisi)" })]);
  });
  it("moves a time, and refuses a request for someone else's clock-in", async () => {
    db.pw_daily_attendance = [{ id: "rec-1", employee_id: PERSON, kind: "masuk", work_date: "2026-11-20", at: "2026-11-20T02:30:00Z", method: "wajah", status: "sah", flags: [] }];
    const asked = await createRequest(member, { type: "ubah_jam", workDate: "2026-11-20", kind: "masuk", recordId: "rec-1", time: "08:15", zone: "WIB", reasonKind: null, reasonText: "", note: "Antre lift" }, morning);
    await decideRequest(asked.id, { approve: true, note: "" }, actor, morning);
    expect(db.pw_daily_attendance[0].at).toBe("2026-11-20T01:15:00.000Z");
    await expect(createRequest(other, { type: "batal", workDate: "2026-11-20", kind: "masuk", recordId: "rec-1", time: null, zone: "WIB", reasonKind: null, reasonText: "", note: "Bukan punyaku" }, morning)).rejects.toMatchObject({ status: 404 });
  });
  it("leaves the absensi alone when refused", async () => {
    db.pw_daily_attendance = [{ id: "rec-2", employee_id: PERSON, kind: "masuk", work_date: "2026-11-20", at: "2026-11-20T02:30:00Z", method: "wajah", status: "sah", flags: [], selfie_key: null }];
    const asked = await createRequest(member, { type: "batal", workDate: "2026-11-20", kind: "masuk", recordId: "rec-2", time: null, zone: "WIB", reasonKind: null, reasonText: "", note: "Salah tekan" }, morning);
    const decided = await decideRequest(asked.id, { approve: false, note: "Tetap dicatat" }, actor, morning);
    expect(decided).toMatchObject({ status: "ditolak", decisionNote: "Tetap dicatat" });
    expect(db.pw_daily_attendance).toHaveLength(1);
  });
});

describe("Hapus absen", () => {
  it("deletes one clock-in and its selfie, and leaves the others", async () => {
    db.pw_daily_attendance = [
      { id: "a", employee_id: PERSON, kind: "masuk", work_date: "2026-11-20", at: "2026-11-20T01:00:00Z", method: "wajah", status: "perlu_cek", flags: [], selfie_key: "pra-wam/absen-harian/x/a.webp" },
      { id: "b", employee_id: PERSON, kind: "pulang", work_date: "2026-11-20", at: "2026-11-20T10:00:00Z", method: "wajah", status: "sah", flags: [], selfie_key: "pra-wam/absen-harian/x/b.webp" },
    ];
    const gone = await deleteRecord("a");
    expect(gone).toMatchObject({ id: "a", kind: "masuk" });
    expect(db.pw_daily_attendance.map(row => row.id)).toEqual(["b"]);
    expect(removeObjects).toHaveBeenCalledWith(["pra-wam/absen-harian/x/a.webp"]);
  });
  it("answers 404 for a clock-in that is not there", async () => {
    await expect(deleteRecord("tidak-ada")).rejects.toMatchObject({ status: 404 });
  });
});

describe("cleanup", () => {
  it("deletes selfies older than 90 days and keeps newer ones", async () => {
    db.pw_daily_attendance = [
      { id: "old", at: "2026-08-01T01:00:00Z", selfie_key: "pra-wam/absen-harian/a/old.webp", embedding: face },
      { id: "new", at: "2026-11-01T01:00:00Z", selfie_key: "pra-wam/absen-harian/a/new.webp", embedding: face },
    ];
    expect(await deleteOldSelfies(morning)).toBe(1);
    expect(removeObjects).toHaveBeenCalledWith(["pra-wam/absen-harian/a/old.webp"]);
    expect(db.pw_daily_attendance.map(row => row.selfie_key)).toEqual([null, "pra-wam/absen-harian/a/new.webp"]);
  });
});
