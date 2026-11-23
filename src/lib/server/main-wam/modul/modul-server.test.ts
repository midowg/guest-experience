import { createHmac, hkdfSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SilentResult } from "@/lib/main-wam/module-state";
import { sampleAwards, samplePeople, sampleSession, sampleSessions, sampleSilentQuestion } from "@/lib/main-wam/sample";
import type { MwAwardApproval, MwAwardCategory, MwSession, MwSilentQuestion } from "@/lib/main-wam/types";

/*
 * Agen D's server rules without a database (audit S9): Absen QR (the window and a queued scan's
 * time, M5), Silent Meeting (a send writes the feedback and nothing else, H1; openers under a key
 * of their own, L7; closed is final and no count while open, H2; the recap's threshold), Voting
 * (the window, not for oneself) and the BOD's approval (after it closes, panitia told once, L3).
 */

const SESSION_SECRET = "s".repeat(40);
vi.mock("@/lib/pra-wam/session-token", () => ({ praWamSecret: () => SESSION_SECRET }));

const state = vi.hoisted(() => ({
  sessions: [] as MwSession[],
  questions: [] as MwSilentQuestion[],
  results: new Map<string, SilentResult>(),
  categories: [] as MwAwardCategory[],
  approvals: [] as MwAwardApproval[],
  rpc: [] as { name: string; args: Record<string, unknown> }[],
  rpcAnswer: (() => ({ data: "ok", error: null })) as (name: string, args: Record<string, unknown>) => { data: unknown; error: unknown },
  from: [] as { table: string; ops: [string, unknown[]][] }[],
  fromAnswer: (() => ({ data: null, error: null })) as (call: { table: string; ops: [string, unknown[]][] }) => { data?: unknown; error?: unknown; count?: number },
  notes: [] as { title: string }[],
}));

// A query chain that records every call and answers when awaited.
function chain(table: string) {
  const call = { table, ops: [] as [string, unknown[]][] };
  state.from.push(call);
  const proxy: unknown = new Proxy({}, {
    get(_target, prop) {
      if (prop === "then") return (resolve: (value: unknown) => void, reject: (error: unknown) => void) => Promise.resolve(state.fromAnswer(call)).then(resolve, reject);
      return (...args: unknown[]) => { call.ops.push([String(prop), args]); return proxy; };
    },
  });
  return proxy;
}
vi.mock("../../supabase/admin", () => ({
  createPrivilegedClient: () => ({
    from: chain,
    rpc: (name: string, args: Record<string, unknown>) => { state.rpc.push({ name, args }); return Promise.resolve(state.rpcAnswer(name, args)); },
  }),
}));
vi.mock("../read", () => ({
  allSessions: async () => ({ data: state.sessions, migrated: true }),
  silentQuestions: async () => ({ data: state.questions, migrated: true }),
  silentResults: async () => ({ data: state.results, migrated: true }),
  awardCategories: async () => ({ data: state.categories, migrated: true }),
  awardApprovals: async () => ({ data: state.approvals, migrated: true }),
  attendanceOf: async () => ({ data: [], migrated: true }),
}));
vi.mock("../notes", () => ({ trySendMainWamNote: vi.fn(async (note: { title: string }) => { state.notes.push(note); return 1; }) }));
vi.mock("../people", () => ({
  mainWamPeople: async () => new Map(Object.values(samplePeople).map(person => [person.id, { ...person, active: true }])),
  mainWamAttendees: async () => Object.values(samplePeople).map(person => person.id),
}));

const silent = await import("./silent");
const absen = await import("./absen");
const awards = await import("./awards");
const { resetMemoryLimits } = await import("./memory-limit");

const at = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);
const statusOf = (promise: Promise<unknown>) => promise.then(() => 200, (error: { status?: number }) => error.status ?? 500);
const rani = { id: samplePeople.rani.id, roles: [] as never[], name: "Rani" };
const dimas = { id: samplePeople.dimas.id, roles: ["panitia"] as never[], name: "Dimas" };
const question = sampleSilentQuestion; // its session: Sel, 5 Jan 13.00–14.30
const OPEN = at("2027-01-05", "13:45");

beforeEach(() => {
  state.sessions = sampleSessions; state.questions = [question]; state.results = new Map(); state.categories = sampleAwards; state.approvals = [];
  state.rpc = []; state.from = []; state.notes = [];
  state.rpcAnswer = () => ({ data: "ok", error: null });
  state.fromAnswer = () => ({ data: null, error: null });
  resetMemoryLimits();
  delete process.env.MW_SILENT_SECRET;
});

describe("Silent Meeting: a send", () => {
  it("writes the feedback and nothing else: no person, no count, no rate-limit row (audit H1)", async () => {
    expect(await silent.sendSilentFeedback({ questionId: question.id, topic: "Cara kerja", body: "Rapat terlalu panjang." }, rani, OPEN)).toEqual({ remaining: 9 });
    expect(state.rpc).toEqual([{ name: "mw_silent_send", args: { p_question: question.id, p_topic: "Cara kerja", p_body: "Rapat terlalu panjang." } }]);
    expect(JSON.stringify(state.rpc)).not.toContain(rani.id);
    expect(state.from).toEqual([]);
  });

  it("limits a person in memory only: the 11th in 10 minutes is refused before the database", async () => {
    for (let index = 0; index < 10; index += 1) await silent.sendSilentFeedback({ questionId: question.id, topic: "", body: `Masukan ${index}` }, rani, OPEN);
    expect(await statusOf(silent.sendSilentFeedback({ questionId: question.id, topic: "", body: "Kesebelas" }, rani, OPEN))).toBe(429);
    expect(state.rpc.filter(call => call.name === "mw_silent_send")).toHaveLength(10);
    expect(state.rpc.some(call => call.name === "consume_rate_limit")).toBe(false);
    // Another person is not limited by Rani's sends.
    expect(await statusOf(silent.sendSilentFeedback({ questionId: question.id, topic: "", body: "Dari Sari" }, { id: samplePeople.sari.id }, OPEN))).toBe(200);
  });

  it("is refused before it opens, after it closes, for a topic it has not, and when the database says closed", async () => {
    expect(await statusOf(silent.sendSilentFeedback({ questionId: question.id, topic: "", body: "Awal" }, rani, at("2027-01-05", "12:00")))).toBe(409);
    expect(await statusOf(silent.sendSilentFeedback({ questionId: question.id, topic: "", body: "Telat" }, rani, at("2027-01-05", "14:30")))).toBe(409);
    expect(await statusOf(silent.sendSilentFeedback({ questionId: question.id, topic: "Gaji direksi", body: "Topik asing" }, rani, OPEN))).toBe(422);
    expect(state.rpc).toEqual([]);
    state.rpcAnswer = () => ({ data: "closed", error: null });
    expect(await statusOf(silent.sendSilentFeedback({ questionId: question.id, topic: "", body: "Bersamaan ditutup" }, rani, OPEN))).toBe(409);
  });
});

describe("Silent Meeting: who opened it", () => {
  it("is a separate call, under an HMAC with a key derived for Silent Meeting (audit L7)", async () => {
    await silent.recordOpener(question.id, rani, OPEN);
    expect(state.rpc).toHaveLength(1);
    const { name, args } = state.rpc[0];
    expect(name).toBe("mw_silent_open");
    const derived = Buffer.from(hkdfSync("sha256", SESSION_SECRET, Buffer.alloc(0), "mw-silent-v1", 32));
    expect(args).toEqual({ p_question: question.id, p_opener: createHmac("sha256", derived).update(`mw-silent-open\0${question.id}\0${rani.id}`).digest("hex") });
    // Not the session secret itself.
    expect(args.p_opener).not.toBe(createHmac("sha256", SESSION_SECRET).update(`mw-silent-open\0${question.id}\0${rani.id}`).digest("hex"));
  });

  it("uses MW_SILENT_SECRET when set (rotating the session secret changes nobody), and refuses a short one", () => {
    const fromSession = silent.openerKey(question.id, rani.id);
    process.env.MW_SILENT_SECRET = "m".repeat(40);
    const own = silent.openerKey(question.id, rani.id);
    expect(own).not.toBe(fromSession);
    expect(own).toMatch(/^[0-9a-f]{64}$/);
    process.env.MW_SILENT_SECRET = "pendek";
    expect(() => silent.openerKey(question.id, rani.id)).toThrow(/MW_SILENT_SECRET/);
  });

  it("is only recorded while it is open", async () => {
    expect(await statusOf(silent.recordOpener(question.id, rani, at("2027-01-05", "12:00")))).toBe(409);
    expect(await statusOf(silent.recordOpener(question.id, rani, at("2027-01-05", "15:00")))).toBe(409);
    expect(state.rpc).toEqual([]);
  });
});

describe("Silent Meeting: panitia's hand (audit H2)", () => {
  const closedNow = (when: string) => { state.questions = [{ ...question, closedAt: at("2027-01-05", when).toISOString() }]; };

  it("closes while open, then refuses to open it again (tutup → buka), here before the database", async () => {
    state.rpcAnswer = () => ({ data: "closed", error: null });
    const closed = await silent.controlSilent(question.id, "tutup", dimas, OPEN);
    expect(state.rpc).toEqual([{ name: "mw_silent_control", args: { p_question: question.id, p_action: "tutup", p_by: dimas.id } }]);
    expect(closed.count).toBeNull();
    // The database stamped the close: the next read says closed.
    closedNow("13:45");
    state.rpc = [];
    const again = silent.controlSilent(question.id, "buka", dimas, at("2027-01-05", "13:50"));
    await expect(again).rejects.toMatchObject({ status: 409, message: "Silent Meeting yang sudah ditutup tidak bisa dibuka lagi." });
    expect(state.rpc).toEqual([]);
    expect(state.notes).toEqual([]);
  });

  it("also refuses when the database says it is final (a close that came in between)", async () => {
    state.rpcAnswer = () => ({ data: "final", error: null });
    await expect(silent.controlSilent(question.id, "buka", dimas, at("2027-01-05", "12:00"))).rejects.toMatchObject({ status: 409 });
    expect(state.notes).toEqual([]);
  });

  it("closed by its end: never opens again", async () => {
    await expect(silent.controlSilent(question.id, "buka", dimas, at("2027-01-05", "15:00"))).rejects.toMatchObject({ status: 409 });
    expect(state.rpc).toEqual([]);
  });

  it("opens early once, telling everyone once; a second Buka is refused without a note (audit L3)", async () => {
    state.rpcAnswer = () => ({ data: "opened", error: null });
    const opened = await silent.controlSilent(question.id, "buka", dimas, at("2027-01-05", "12:40"));
    expect(state.notes.map(note => note.title)).toEqual(["Silent Meeting dibuka"]);
    // While open the answer carries its state, never a count.
    expect(opened.count).toBeNull();
    expect(Object.keys(opened)).toEqual(["view", "count"]);
    state.questions = [{ ...question, openedAt: at("2027-01-05", "12:40").toISOString() }];
    await expect(silent.controlSilent(question.id, "buka", dimas, at("2027-01-05", "12:41"))).rejects.toMatchObject({ status: 409 });
    expect(state.notes).toHaveLength(1);
  });

  it("answers a count after the close only from 5 feedbacks of 5 people", async () => {
    // The database closes it (and finalizes the counts): the next read says closed.
    state.rpcAnswer = name => {
      if (name === "mw_silent_control") closedNow("13:45");
      return { data: "closed", error: null };
    };
    state.results = new Map([[question.id, { feedback: 47, openers: 41 }]]);
    expect(await silent.controlSilent(question.id, "tutup", dimas, OPEN)).toMatchObject({ view: { state: "tutup" }, count: 47 });
    state.questions = [question];
    state.results = new Map([[question.id, { feedback: 47, openers: 4 }]]);
    expect(await silent.controlSilent(question.id, "tutup", dimas, OPEN)).toMatchObject({ view: { state: "tutup" }, count: null });
  });
});

describe("Absen QR on the server", () => {
  const pemaparan = sampleSession("pemaparan"); // Sel, 5 Jan 08.00–12.00, absen 07.30–12.30
  const row = (session: MwSession) => ({
    id: session.id, title: session.title, kind: session.kind, status: session.status, starts_at: session.startsAt, ends_at: session.endsAt, place: session.place, uses_attendance: session.usesAttendance,
  });
  let existing: string | null = null;
  beforeEach(() => {
    existing = null;
    state.fromAnswer = call => {
      if (call.table === "mw_sessions") return { data: row(pemaparan), error: null };
      if (call.table === "mw_attendance" && call.ops.some(([op]) => op === "upsert")) {
        const values = call.ops.find(([op]) => op === "upsert")![1][0] as { checked_in_at: string };
        return { data: [{ checked_in_at: values.checked_in_at }], error: null };
      }
      return { data: existing ? { checked_in_at: existing } : null, error: null };
    };
  });
  const upserts = () => state.from.filter(call => call.ops.some(([op]) => op === "upsert"));
  const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWx";

  it("records a scan in the window at the server's time, and answers BOD and a second scan without a row", async () => {
    expect(await absen.checkInWithQr(TOKEN, rani, { now: at("2027-01-05", "07:52") })).toMatchObject({ kind: "tercatat", checkedInAt: at("2027-01-05", "07:52").toISOString() });
    expect(await absen.checkInWithQr(TOKEN, { id: "b", roles: ["bod"] }, { now: at("2027-01-05", "07:52") })).toEqual({ kind: "bod" });
    existing = at("2027-01-05", "07:52").toISOString();
    expect(await absen.checkInWithQr(TOKEN, rani, { now: at("2027-01-05", "08:30") })).toMatchObject({ kind: "sudah" });
    expect(upserts()).toHaveLength(1);
  });

  it("keeps a queued scan's time only inside the window and at most 30 minutes old (audit M5)", async () => {
    // Queued at 12.20, sent at 12.50 (window closed 12.30): kept.
    expect(await absen.checkInWithQr(TOKEN, rani, { now: at("2027-01-05", "12:50"), scannedAt: at("2027-01-05", "12:20").toISOString() }))
      .toMatchObject({ kind: "tercatat", checkedInAt: at("2027-01-05", "12:20").toISOString() });
    // A photo of the QR, 5 hours after the session, claiming 10.00: refused, nothing written.
    state.from = [];
    expect(await absen.checkInWithQr(TOKEN, rani, { now: at("2027-01-05", "17:30"), scannedAt: at("2027-01-05", "10:00").toISOString() })).toMatchObject({ kind: "tutup" });
    expect(upserts()).toEqual([]);
  });

  it("reads a session's QR without writing; without one it asks to save the session again (R15)", async () => {
    state.fromAnswer = () => ({ data: { ...row(pemaparan), qr_token: null }, error: null });
    await expect(absen.sessionQrToken(pemaparan.id)).rejects.toMatchObject({ status: 409 });
    expect(state.from.every(call => call.ops.every(([op]) => op !== "update"))).toBe(true);
    state.fromAnswer = () => ({ data: { ...row(pemaparan), qr_token: TOKEN }, error: null });
    expect((await absen.sessionQrToken(pemaparan.id)).token).toBe(TOKEN);
  });

  it("counts Hadir of the people of the event only (R5)", async () => {
    state.fromAnswer = () => ({ data: [{ employee_id: samplePeople.rani.id }, { employee_id: "bukan-orang-acara" }], error: null });
    expect(await absen.presentCount(pemaparan.id)).toEqual({ present: 1, expected: Object.keys(samplePeople).length });
  });
});

describe("Voting and the BOD's approval on the server", () => {
  const [suportif] = sampleAwards; // voting Rab 6 Jan 08.00–15.00
  const sari = suportif.nominees[0];
  const upserts = () => state.from.filter(call => call.ops.some(([op]) => op === "upsert"));

  it("takes a vote while open, never for oneself or after it closed", async () => {
    await awards.castVote(suportif.id, sari.id, rani, at("2027-01-06", "10:00"));
    expect(upserts()).toHaveLength(1);
    expect(await statusOf(awards.castVote(suportif.id, sari.id, { id: sari.employeeId! }, at("2027-01-06", "10:00")))).toBe(422);
    expect(await statusOf(awards.castVote(suportif.id, sari.id, rani, at("2027-01-06", "15:00")))).toBe(409);
    expect(upserts()).toHaveLength(1);
  });

  it("approves only after voting closed, tells panitia once, and not again for the same winner", async () => {
    const bod = { id: samplePeople.wulan.id, name: "Wulan" };
    expect(await statusOf(awards.approveWinner(suportif.id, sari.id, bod, at("2027-01-06", "14:59")))).toBe(409);
    const approved = { category_id: suportif.id, nominee_id: sari.id, approved_by: bod.id, approved_at: at("2027-01-06", "16:00").toISOString() };
    state.fromAnswer = call => (call.table === "mw_award_approvals" ? { data: approved, error: null } : { data: [], error: null });
    await awards.approveWinner(suportif.id, sari.id, bod, at("2027-01-06", "16:00"));
    expect(state.notes.map(note => note.title)).toEqual(["Pemenang awarding disetujui"]);
    state.approvals = [{ categoryId: suportif.id, nomineeId: sari.id, approvedBy: bod.id, approvedAt: approved.approved_at }];
    state.from = [];
    await awards.approveWinner(suportif.id, sari.id, bod, at("2027-01-06", "16:01"));
    expect(state.notes).toHaveLength(1);
    expect(upserts()).toEqual([]);
  });
});
