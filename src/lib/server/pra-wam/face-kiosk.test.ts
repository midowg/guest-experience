import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { FACE_MODEL_VERSION } from "@/lib/hr/face-match";
import type { Member } from "./session";

/* Mode tablet against a small in-memory stand-in for Supabase and R2. */
type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
function query(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let mode: { kind: "select"; head: boolean } | { kind: "upsert"; row: Row } = { kind: "select", head: false };
  let single = false;
  const rows = () => (db[table] ??= []);
  const run = () => {
    if (mode.kind === "upsert") {
      const row = mode.row;
      if (rows().some(item => item.session_id === row.session_id && item.employee_id === row.employee_id)) return { data: [], error: null };
      rows().push(row);
      return { data: [row], error: null };
    }
    const found = rows().filter(row => filters.every(test => test(row)));
    if (mode.head) return { data: null, count: found.length, error: null };
    return { data: single ? found[0] ?? null : found, error: null };
  };
  const builder = {
    select: (columns = "*", options?: { head?: boolean }) => { void columns; if (mode.kind === "select") mode = { kind: "select", head: !!options?.head }; return builder; },
    limit: () => builder,
    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return builder; },
    in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return builder; },
    maybeSingle: () => { single = true; return builder; },
    upsert: (row: Row) => { mode = { kind: "upsert", row }; return builder; },
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
let session: Record<string, unknown>;
vi.mock("./sessions", () => ({ getSession: async () => session }));

const SESSION = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const AYU = "11111111-2222-4333-8444-555555555555";
const BUDI = "22222222-2222-4333-8444-555555555555";
const panitia: Member = { id: "99999999-2222-4333-8444-555555555555", name: "Panitia", nickname: "P", department: "HR", position: "Staf", mustChangePassword: false, roles: ["panitia"], photo: null };
const peserta: Member = { ...panitia, id: AYU, roles: [] };
// Senin 9 Nov 2026, 10.00–12.00 WIB: absen 09.30–12.30.
const during = new Date("2026-11-09T03:10:00Z");

/** A unit face from three numbers (the rest 0). */
function face(a: number, b: number, c: number): number[] {
  const vector = new Array<number>(128).fill(0);
  vector[0] = a; vector[1] = b; vector[2] = c;
  return vector;
}
const ayu = face(1, 0, 0), budi = face(0, 0, 1);
const signals = [0, 1, 2].map(t => ({ t: 1000 + t * 120, blinkLeft: 0.05, blinkRight: 0.05, smileLeft: 0.1, smileRight: 0.1, yaw: 2 }));
const look = (vector: number[]) => ({ embedding: vector, frameEmbeddings: [vector, vector], signals, mime: "image/webp" as const, size: 40_000 });
const profile = (employee_id: string, embedding: number[], status = "aktif") => ({ employee_id, embedding, model_version: FACE_MODEL_VERSION, photo_key: `pra-wam/wajah/${employee_id}.webp`, status });

const { identifyFace, recordKioskFace, kioskOverview } = await import("./face-kiosk");

beforeEach(() => {
  vi.stubEnv("WAM_SESSION_SECRET", "x".repeat(40));
  removeObjects.mockClear();
  session = {
    id: SESSION, title: "Forum Komunikasi", status: "terbit", startsAt: "2026-11-09T03:00:00Z", endsAt: "2026-11-09T05:00:00Z", booking: null,
    participants: [{ id: AYU, name: "Ayu Lestari", department: "Comms" }, { id: BUDI, name: "Budi Santoso", department: "Finance" }],
  };
  db = { pw_attendance: [], pw_face_profiles: [profile(AYU, ayu), profile(BUDI, budi)] };
});
afterEach(() => { vi.unstubAllEnvs(); });

const photoOf = (candidate: { upload: { key: string; token: string } }) => ({ key: candidate.upload.key, mime: "image/webp" as const, size: 40_000, token: candidate.upload.token });

describe("mode tablet", () => {
  it("finds the participant and records them as wajah, cocok", async () => {
    const answer = await identifyFace(SESSION, panitia, look(face(0.8, 0.6, 0)), during);
    if (answer.kind !== "cocok") throw new Error(`expected cocok, got ${answer.kind}`);
    expect(answer.candidate).toMatchObject({ employeeId: AYU, name: "Ayu Lestari", referenceUrl: null });
    expect(answer.candidate.upload.key.startsWith(`pra-wam/absen/${SESSION}/${AYU}/`)).toBe(true);
    const done = await recordKioskFace(SESSION, panitia, { token: answer.candidate.token, photo: photoOf(answer.candidate) }, during);
    expect(done).toMatchObject({ kind: "tercatat", person: { name: "Ayu Lestari" }, present: 1 });
    expect(db.pw_attendance[0]).toMatchObject({ employee_id: AYU, method: "wajah", face_status: "cocok", face_checked_by: null, proof_key: answer.candidate.upload.key });
    expect(await identifyFace(SESSION, panitia, look(face(0.8, 0.6, 0)), during)).toMatchObject({ kind: "sudah", person: { name: "Ayu Lestari" } });
  });

  it("offers a close call to panitia, and a yes is disahkan by them", async () => {
    const answer = await identifyFace(SESSION, panitia, look(face(0.42, Math.sqrt(1 - 0.42 ** 2 - 0.4 ** 2), 0.4)), during);
    if (answer.kind !== "konfirmasi") throw new Error(`expected konfirmasi, got ${answer.kind}`);
    expect(answer.candidates.map(item => item.name)).toEqual(["Ayu Lestari", "Budi Santoso"]);
    expect(answer.candidates[1].referenceUrl).toBe(`https://r2.example/pra-wam/wajah/${BUDI}.webp?view`);
    await recordKioskFace(SESSION, panitia, { token: answer.candidates[1].token, photo: photoOf(answer.candidates[1]) }, during);
    expect(db.pw_attendance[0]).toMatchObject({ employee_id: BUDI, face_status: "disahkan", face_checked_by: panitia.id });
  });

  it("knows nobody for a stranger, and says who has not agreed yet", async () => {
    expect(await identifyFace(SESSION, panitia, look(face(0.1, Math.sqrt(1 - 0.02), 0.1)), during)).toEqual({ kind: "tidak-dikenali" });
    db.pw_face_profiles[0].status = "siap";
    expect(await identifyFace(SESSION, panitia, look(face(0.8, 0.6, 0)), during)).toMatchObject({ kind: "belum-setuju", person: { name: "Ayu Lestari" } });
  });

  it("will not let the tablet change who or how", async () => {
    const answer = await identifyFace(SESSION, panitia, look(face(0.8, 0.6, 0)), during);
    if (answer.kind !== "cocok") throw new Error("expected cocok");
    const [payload, signature] = answer.candidate.token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), employeeId: BUDI })).toString("base64url");
    await expect(recordKioskFace(SESSION, panitia, { token: `${forged}.${signature}`, photo: photoOf(answer.candidate) }, during)).rejects.toMatchObject({ status: 403 });
    await expect(recordKioskFace(SESSION, panitia, { token: answer.candidate.token, photo: photoOf(answer.candidate) }, new Date(during.getTime() + 5 * 60_000))).rejects.toMatchObject({ status: 410 });
    expect(db.pw_attendance).toHaveLength(0);
  });

  it("is for panitia, while the check-in is open, with a real camera's frames", async () => {
    await expect(identifyFace(SESSION, peserta, look(ayu), during)).rejects.toMatchObject({ status: 403 });
    await expect(identifyFace(SESSION, panitia, look(ayu), new Date("2026-11-09T01:00:00Z"))).rejects.toMatchObject({ status: 409 });
    await expect(identifyFace(SESSION, panitia, { ...look(ayu), frameEmbeddings: [ayu, budi] }, during)).rejects.toMatchObject({ status: 422 });
    await expect(identifyFace(SESSION, panitia, { ...look(ayu), signals: [] }, during)).rejects.toMatchObject({ status: 422 });
  });

  it("counts who can be recognised and who is in", async () => {
    db.pw_face_profiles[1].status = "siap";
    db.pw_attendance.push({ session_id: SESSION, employee_id: BUDI, method: "qr", checked_in_at: during.toISOString() });
    expect(await kioskOverview(SESSION, panitia)).toMatchObject({ total: 2, withFace: 1, present: 1 });
  });
});
