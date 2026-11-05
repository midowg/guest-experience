import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proofKeyFor } from "@/lib/pra-wam/attendance";
import type { Member } from "./session";

/* "Saya hadir" against a small in-memory stand-in for Supabase and R2. */
type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
/** Before migration 202611050003: no proof column, and the old method check. */
let unmigrated = false;
function query(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let columns = "*";
  let mode: { kind: "select" } | { kind: "upsert"; row: Row } | { kind: "delete" } = { kind: "select" };
  let single = false;
  const rows = () => (db[table] ??= []);
  const run = () => {
    if (table === "pw_attendance" && unmigrated) {
      if (columns.includes("proof_key")) return { data: null, error: { code: "42703", message: "column pw_attendance.proof_key does not exist" } };
      if (mode.kind === "upsert" && "proof_key" in mode.row) return { data: null, error: { code: "PGRST204", message: "Could not find the 'proof_key' column of 'pw_attendance'" } };
    }
    if (mode.kind === "upsert") {
      const row = mode.row;
      if (rows().some(item => item.session_id === row.session_id && item.employee_id === row.employee_id)) return { data: [], error: null };
      rows().push(row);
      return { data: [row], error: null };
    }
    const found = rows().filter(row => filters.every(test => test(row)));
    if (mode.kind === "delete") { db[table] = rows().filter(row => !found.includes(row)); return { data: found, error: null }; }
    return { data: single ? found[0] ?? null : found, error: null };
  };
  const builder = {
    select: (value = "*") => { if (mode.kind === "select") columns = value; return builder; },
    limit: () => builder,
    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return builder; },
    maybeSingle: () => { single = true; return builder; },
    upsert: (row: Row) => { mode = { kind: "upsert", row }; return builder; },
    delete: () => { mode = { kind: "delete" }; return builder; },
    then: (resolve: (result: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return builder;
}

const removeObjects = vi.fn(async (keys: string[]) => { void keys; });
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]);
let uploaded = webp;
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: query }) }));
vi.mock("../r2", () => ({
  isR2Configured: () => true,
  presignUpload: async (key: string) => `https://r2.example/${key}?signed`,
  presignDownload: async (key: string) => `https://r2.example/${key}?view`,
  uploadedStart: async () => uploaded,
  removeObjects: (keys: string[]) => removeObjects(keys),
}));
vi.mock("./appraisal", () => ({ listPeople: async () => [] }));
vi.mock("./sessions", () => ({ getSession: async () => ({ id: SESSION, participants: [{ id: PERSON, name: "Ayu Lestari", department: "Comms" }] }) }));

const SESSION = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const PERSON = "11111111-2222-4333-8444-555555555555";
const secret = "x".repeat(40);
const member: Member = { id: PERSON, name: "Ayu Lestari", nickname: "Ayu", department: "Comms", position: "Staf", mustChangePassword: false, roles: [], photo: null };
const panitia: Member = { ...member, id: "99999999-2222-4333-8444-555555555555", roles: ["panitia"] };
// Senin 9 Nov 2026, 10.00–12.00 WIB: absen 09.30–12.30.
const during = new Date("2026-11-09T03:10:00Z");

const { attendance, checkIn, proofTokenMatches, proofViewUrl, selfCheckIn, setPresent, startProofUpload } = await import("./attendance");

beforeEach(() => {
  vi.stubEnv("WAM_SESSION_SECRET", secret);
  unmigrated = false;
  uploaded = webp;
  removeObjects.mockClear();
  db = {
    // A session made from a room booking: "Saya hadir" is its way in.
    pw_sessions: [{ id: SESSION, title: "Review data departemen", status: "terbit", starts_at: "2026-11-09T03:00:00Z", ends_at: "2026-11-09T05:00:00Z", booking_id: "b1" }],
    pw_session_participants: [{ session_id: SESSION, employee_id: PERSON }],
    pw_attendance: [],
  };
});
afterEach(() => { vi.unstubAllEnvs(); });

/** Step one of online, as the browser would do it. */
async function started(size = 300_000, now = during) {
  const start = await startProofUpload(SESSION, { mime: "image/webp", size }, member, now);
  if (start.kind !== "unggah") throw new Error("expected an upload");
  return { key: start.key, token: start.token, size, mime: "image/webp" as const };
}

describe("Saya hadir, di kantor", () => {
  it("records offline once; a second time answers sudah", async () => {
    expect(await selfCheckIn(SESSION, member, { mode: "offline" }, during)).toEqual({ kind: "tercatat", checkedInAt: during.toISOString(), method: "offline" });
    expect(db.pw_attendance).toHaveLength(1);
    expect(db.pw_attendance[0]).toMatchObject({ method: "offline", proof_key: null });
    expect(await selfCheckIn(SESSION, member, { mode: "offline" }, new Date("2026-11-09T03:20:00Z"))).toMatchObject({ kind: "sudah", checkedInAt: during.toISOString(), method: "offline" });
    expect(db.pw_attendance).toHaveLength(1);
  });

  it("answers belum and tutup outside the window, and refuses someone who is not a participant", async () => {
    await expect(selfCheckIn(SESSION, member, { mode: "offline" }, new Date("2026-11-09T02:00:00Z"))).rejects.toMatchObject({ status: 409, message: "Absen belum dibuka. Absen sesi ini berlaku 09.30–12.30." });
    await expect(selfCheckIn(SESSION, member, { mode: "offline" }, new Date("2026-11-09T05:31:00Z"))).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/^Absen sudah ditutup 12\.30\./) });
    await expect(selfCheckIn(SESSION, { ...member, id: panitia.id }, { mode: "offline" }, during)).rejects.toMatchObject({ status: 403 });
    db.pw_sessions[0].status = "draf";
    await expect(selfCheckIn(SESSION, member, { mode: "offline" }, during)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("belum diterbitkan") });
    expect(db.pw_attendance).toHaveLength(0);
  });

  it("says plainly that it waits for the migration", async () => {
    unmigrated = true;
    await expect(selfCheckIn(SESSION, member, { mode: "offline" }, during)).rejects.toMatchObject({ status: 503, message: expect.stringContaining("202611050003") });
    await expect(startProofUpload(SESSION, { mime: "image/webp", size: 1000 }, member, during)).rejects.toMatchObject({ status: 503, message: expect.stringMatching(/^Absen online menunggu migrasi 202611050003/) });
  });
});

describe("Saya hadir, online", () => {
  it("signs the upload for this session and person only", async () => {
    const proof = await started();
    expect(proof.key).toMatch(new RegExp(`^pra-wam/absen/${SESSION}/${PERSON}/[0-9a-f-]{36}\\.webp$`));
    expect(proofTokenMatches(proof.token, proof.key, proof, SESSION, member, during.getTime())).toBe(true);
    expect(proofTokenMatches(proof.token, proof.key, { ...proof, size: proof.size + 1 }, SESSION, member, during.getTime())).toBe(false);
    expect(proofTokenMatches(proof.token, proof.key, proof, SESSION, panitia, during.getTime())).toBe(false);
    expect(proofTokenMatches(proof.token, proof.key, proof, "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee", member, during.getTime())).toBe(false);
    expect(proofTokenMatches(proof.token, proof.key, proof, SESSION, member, during.getTime() + 16 * 60_000)).toBe(false);
  });

  it("checks the screenshot and keeps its key", async () => {
    const proof = await started();
    expect(await selfCheckIn(SESSION, member, { mode: "online", proof }, during)).toMatchObject({ kind: "tercatat", method: "online" });
    expect(db.pw_attendance[0]).toMatchObject({ method: "online", proof_key: proof.key });
    expect(removeObjects).not.toHaveBeenCalled();
  });

  it("refuses a key or token that is not this person's, without deleting anything", async () => {
    const proof = await started();
    const other = proofKeyFor(SESSION, panitia.id, "cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee", "image/webp");
    await expect(selfCheckIn(SESSION, member, { mode: "online", proof: { ...proof, key: other } }, during)).rejects.toMatchObject({ status: 403 });
    const forged = `${Math.floor(during.getTime() / 1000) + 600}.${createHmac("sha256", "wrong".repeat(10)).update("x").digest("hex")}`;
    await expect(selfCheckIn(SESSION, member, { mode: "online", proof: { ...proof, token: forged } }, during)).rejects.toMatchObject({ status: 403 });
    expect(removeObjects).not.toHaveBeenCalled();
    expect(db.pw_attendance).toHaveLength(0);
  });

  it("deletes a file that is not a picture, and an unused one after an earlier check-in", async () => {
    const proof = await started();
    uploaded = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0, 0, 0, 0, 0, 0, 0, 0]);
    await expect(selfCheckIn(SESSION, member, { mode: "online", proof }, during)).rejects.toMatchObject({ status: 422 });
    expect(removeObjects).toHaveBeenLastCalledWith([proof.key]);
    expect(db.pw_attendance).toHaveLength(0);

    uploaded = webp;
    const second = await started();
    await selfCheckIn(SESSION, member, { mode: "offline" }, during);
    expect(await selfCheckIn(SESSION, member, { mode: "online", proof: second }, during)).toMatchObject({ kind: "sudah", method: "offline" });
    expect(removeObjects).toHaveBeenLastCalledWith([second.key]);
    // Once signed in there is nothing more to upload.
    expect(await startProofUpload(SESSION, { mime: "image/webp", size: 1000 }, member, during)).toMatchObject({ kind: "sudah", method: "offline" });
  });

  it("deletes the uploaded screenshot when the window closed meanwhile", async () => {
    const proof = await started(300_000, new Date("2026-11-09T05:28:00Z"));
    await expect(selfCheckIn(SESSION, member, { mode: "online", proof }, new Date("2026-11-09T05:31:00Z"))).rejects.toMatchObject({ status: 409 });
    expect(removeObjects).toHaveBeenLastCalledWith([proof.key]);
  });
});

describe("panitia and BOD", () => {
  it("see the method and the proof; removing an online check-in deletes its screenshot", async () => {
    const proof = await started();
    await selfCheckIn(SESSION, member, { mode: "online", proof }, during);
    expect(await attendance(SESSION, panitia)).toEqual([expect.objectContaining({ employeeId: PERSON, method: "online", hasProof: true })]);
    expect(await proofViewUrl(SESSION, PERSON, panitia)).toContain(proof.key);
    await expect(proofViewUrl(SESSION, PERSON, member)).rejects.toMatchObject({ status: 403 });

    expect(await setPresent(SESSION, PERSON, false, panitia)).toEqual([expect.objectContaining({ checkedInAt: null, method: null, hasProof: false })]);
    expect(removeObjects).toHaveBeenLastCalledWith([proof.key]);
    await expect(proofViewUrl(SESSION, PERSON, panitia)).rejects.toMatchObject({ status: 404 });
  });

  it("still read Daftar hadir before the migration", async () => {
    db.pw_attendance.push({ session_id: SESSION, employee_id: PERSON, method: "qr", checked_in_at: during.toISOString() });
    unmigrated = true;
    expect(await attendance(SESSION, panitia)).toEqual([expect.objectContaining({ method: "qr", hasProof: false })]);
  });
});

describe("one way per session", () => {
  it("refuses Saya hadir for a panitia's session: that one takes its QR", async () => {
    db.pw_sessions[0].booking_id = null;
    await expect(selfCheckIn(SESSION, member, { mode: "offline" }, during)).rejects.toMatchObject({ status: 409, message: "Absen sesi ini dengan scan QR yang ditempel di ruang." });
    expect(db.pw_attendance).toEqual([]);
  });
  it("refuses a QR scan for a booking's session, and records it for a panitia's session", async () => {
    db.pw_sessions[0].qr_token = "tok";
    expect((await checkIn("tok", member, during)).result).toEqual({ kind: "pakai-tombol" });
    expect(db.pw_attendance).toEqual([]);
    db.pw_sessions[0].booking_id = null;
    expect((await checkIn("tok", member, during)).result.kind).toBe("tercatat");
    expect(db.pw_attendance[0]).toMatchObject({ method: "qr" });
  });
});
