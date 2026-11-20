import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_VERSION } from "@/lib/hr/attendance";
import { FACE_MODEL_VERSION, normalize } from "@/lib/hr/face-match";
import { pickChallenge, type FrameSignal, type LivenessStep } from "@/lib/hr/liveness";
import type { Member } from "../pra-wam/session";

/* Absen harian against a small in-memory stand-in for Supabase and R2. Made-up people and places. */
type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
const conflictKeys: Record<string, string[]> = { pw_daily_attendance: ["employee_id", "work_date", "kind"], pw_face_profiles: ["employee_id"] };

function query(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let mode: { kind: "select" } | { kind: "upsert"; row: Row; ignore: boolean } | { kind: "insert"; row: Row } | { kind: "update"; patch: Row } | { kind: "delete" } = { kind: "select" };
  let single = false;
  let limit = Infinity;
  let order: { key: string; ascending: boolean } | null = null;
  const rows = () => (db[table] ??= []);
  const run = () => {
    if (mode.kind === "upsert" || mode.kind === "insert") {
      const row: Row = { id: `${table}-${rows().length + 1}`, ...mode.row };
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

const { deleteOldSelfies, readChallenge, startClockIn, startEnroll, startUpload, submitClockIn, submitEnroll } = await import("./attendance");

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
