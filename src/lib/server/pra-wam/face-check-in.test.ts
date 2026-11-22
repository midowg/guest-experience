import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { CONSENT_VERSION } from "@/lib/hr/attendance";
import { FACE_MODEL_VERSION } from "@/lib/hr/face-match";
import type { Member } from "./session";

/* Absen pakai wajah against a small in-memory stand-in for Supabase and R2. */
type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
/** Before migration 202611290001: no face columns. */
let unmigrated = false;
function query(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let columns = "*";
  let mode: { kind: "select" } | { kind: "upsert"; row: Row } | { kind: "update"; row: Row } | { kind: "delete" } = { kind: "select" };
  let single = false;
  const rows = () => (db[table] ??= []);
  const run = () => {
    if (table === "pw_attendance" && unmigrated && (columns.includes("face_s") || (mode.kind !== "select" && mode.kind !== "delete" && "face_score" in mode.row))) {
      return { data: null, error: { code: "42703", message: "column pw_attendance.face_score does not exist" } };
    }
    if (mode.kind === "upsert") {
      const row = mode.row;
      if (rows().some(item => item.session_id === row.session_id && item.employee_id === row.employee_id)) return { data: [], error: null };
      rows().push(row);
      return { data: [row], error: null };
    }
    const found = rows().filter(row => filters.every(test => test(row)));
    if (mode.kind === "update") { for (const row of found) Object.assign(row, mode.row); return { data: found, error: null }; }
    if (mode.kind === "delete") { db[table] = rows().filter(row => !found.includes(row)); return { data: found, error: null }; }
    return { data: single ? found[0] ?? null : found, error: null };
  };
  const builder = {
    select: (value = "*") => { if (mode.kind === "select") columns = value; return builder; },
    limit: () => builder,
    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return builder; },
    maybeSingle: () => { single = true; return builder; },
    upsert: (row: Row) => { mode = { kind: "upsert", row }; return builder; },
    update: (row: Row) => { mode = { kind: "update", row }; return builder; },
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
}));
vi.mock("./appraisal", () => ({ listPeople: async () => [] }));
vi.mock("./sessions", () => ({ getSession: async () => ({ id: SESSION, participants: [{ id: PERSON, name: "Ayu Lestari", department: "Comms" }] }) }));

const SESSION = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const PERSON = "11111111-2222-4333-8444-555555555555";
const member: Member = { id: PERSON, name: "Ayu Lestari", nickname: "Ayu", department: "Comms", position: "Staf", mustChangePassword: false, roles: [], photo: null };
const panitia: Member = { ...member, id: "99999999-2222-4333-8444-555555555555", roles: ["panitia"] };
// Senin 9 Nov 2026, 10.00–12.00 WIB: absen 09.30–12.30.
const during = new Date("2026-11-09T03:10:00Z");

/** A face at cosine `score` from the reference (the first axis). */
function face(score: number): number[] {
  const vector = new Array<number>(128).fill(0);
  vector[0] = score; vector[1] = Math.sqrt(1 - score * score);
  return vector;
}
const reference = face(1);
const signals = [0, 1, 2].map(t => ({ t: 1000 + t * 120, blinkLeft: 0.05, blinkRight: 0.05, smileLeft: 0.1, smileRight: 0.1, yaw: 2 }));

const { startFaceCheckIn, startFacePhoto, submitFaceCheckIn } = await import("./face-check-in");
const { approveFace, attendance } = await import("./attendance");

beforeEach(() => {
  vi.stubEnv("WAM_SESSION_SECRET", "x".repeat(40));
  unmigrated = false;
  removeObjects.mockClear();
  db = {
    // A panitia's session: its QR, or a face.
    pw_sessions: [{ id: SESSION, title: "Forum Komunikasi", status: "terbit", starts_at: "2026-11-09T03:00:00Z", ends_at: "2026-11-09T05:00:00Z", booking_id: null }],
    pw_session_participants: [{ session_id: SESSION, employee_id: PERSON }],
    pw_attendance: [],
    pw_face_profiles: [{ employee_id: PERSON, embedding: reference, model_version: FACE_MODEL_VERSION, photo_key: "pra-wam/wajah/acuan.webp", status: "aktif" }],
  };
});
afterEach(() => { vi.unstubAllEnvs(); });

/** The whole flow as the phone does it, with the face at `score`. */
async function shoot(score: number, extra: { consent?: typeof CONSENT_VERSION } = {}) {
  const start = await startFaceCheckIn(SESSION, member, during);
  if (start.kind !== "mulai") throw new Error(`expected mulai, got ${start.kind}`);
  const upload = await startFacePhoto(SESSION, member, { token: start.token, mime: "image/webp", size: 40_000 }, during);
  const look = face(score);
  const input = { token: start.token, embedding: look, frameEmbeddings: [look, look], signals, photo: { key: upload.key, mime: "image/webp" as const, size: 40_000, token: upload.token }, ...extra };
  return { start, upload, input, answer: () => submitFaceCheckIn(SESSION, member, input, during) };
}

describe("absen pakai wajah", () => {
  it("records a clear match with its score and photo, once", async () => {
    const { start, upload, answer } = await shoot(0.9);
    expect(start).toMatchObject({ needsConsent: false, referenceUrl: "https://r2.example/pra-wam/wajah/acuan.webp?view" });
    expect(upload.key.startsWith(`pra-wam/absen/${SESSION}/${PERSON}/`)).toBe(true);
    expect(await answer()).toMatchObject({ kind: "tercatat", method: "wajah", status: "cocok", percent: 100 });
    expect(db.pw_attendance[0]).toMatchObject({ method: "wajah", face_status: "cocok", proof_key: upload.key });
    expect(removeObjects).not.toHaveBeenCalled();
    expect(await startFaceCheckIn(SESSION, member, during)).toMatchObject({ kind: "sudah", method: "wajah" });
  });

  it("records a fair match for panitia to look at, who may agree", async () => {
    const { answer } = await shoot(0.33);
    expect(await answer()).toMatchObject({ kind: "tercatat", status: "perlu_cek" });
    const rows = await attendance(SESSION, panitia);
    expect(rows[0]).toMatchObject({ method: "wajah", faceStatus: "perlu_cek", hasProof: true });
    const after = await approveFace(SESSION, PERSON, panitia);
    expect(after[0]).toMatchObject({ faceStatus: "disahkan" });
    expect(db.pw_attendance[0].face_checked_by).toBe(panitia.id);
    await expect(approveFace(SESSION, PERSON, member)).rejects.toMatchObject({ status: 403 });
  });

  it("writes nothing for a face that is not alike, and deletes its photo", async () => {
    const { upload, answer } = await shoot(0.1);
    expect(await answer()).toEqual({ kind: "tidak-cocok", percent: 3 });
    expect(db.pw_attendance).toHaveLength(0);
    expect(removeObjects).toHaveBeenCalledWith([upload.key]);
  });

  it("sends someone without a WG People face to the QR", async () => {
    db.pw_face_profiles = [];
    expect(await startFaceCheckIn(SESSION, member, during)).toMatchObject({ kind: "tanpa-wajah" });
    db.pw_face_profiles = [{ employee_id: PERSON, embedding: null, model_version: null, photo_key: null, status: "impor" }];
    expect(await startFaceCheckIn(SESSION, member, during)).toMatchObject({ kind: "tanpa-wajah" });
  });

  it("asks once for the WG People consent of an imported face", async () => {
    db.pw_face_profiles[0].status = "siap";
    const first = await shoot(0.9);
    expect(first.start).toMatchObject({ needsConsent: true });
    await expect(first.answer()).rejects.toMatchObject({ status: 409 });
    const second = await shoot(0.9, { consent: CONSENT_VERSION });
    expect(await second.answer()).toMatchObject({ kind: "tercatat" });
    expect(db.pw_face_profiles[0]).toMatchObject({ status: "aktif", consent_version: CONSENT_VERSION });
  });

  it("refuses a forged upload, frames of two faces, and another person's token", async () => {
    const { input } = await shoot(0.9);
    await expect(submitFaceCheckIn(SESSION, member, { ...input, photo: { ...input.photo, token: `${input.photo.token.split(".")[0]}.${"0".repeat(64)}` } }, during)).rejects.toMatchObject({ status: 403 });
    await expect(submitFaceCheckIn(SESSION, member, { ...input, frameEmbeddings: [face(0.9), face(-0.9)] }, during)).rejects.toMatchObject({ status: 422 });
    await expect(submitFaceCheckIn(SESSION, { ...member, id: panitia.id }, input, during)).rejects.toMatchObject({ status: 403 });
    expect(db.pw_attendance).toHaveLength(0);
  });

  it("keeps the same window as the QR, and waits for its migration", async () => {
    await expect(startFaceCheckIn(SESSION, member, new Date("2026-11-09T02:00:00Z"))).rejects.toMatchObject({ status: 409, message: expect.stringContaining("belum dibuka") });
    await expect(startFaceCheckIn(SESSION, { ...member, id: panitia.id }, during)).rejects.toMatchObject({ status: 403 });
    unmigrated = true;
    await expect(startFaceCheckIn(SESSION, member, during)).rejects.toMatchObject({ status: 503, message: expect.stringContaining("202611290001") });
  });
});
