import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DetectionRow, PhotoSignal } from "./deteksi-store";
import type { TagCandidate } from "@/lib/main-wam/misi/rules";
import type { MwCompletion, MwMission } from "@/lib/main-wam/misi/types";
import type { MissionItem } from "@/lib/main-wam/misi/missions";
import type { MainWamContext } from "../gate";

/*
 * Mission detection on the server, without a database: after a Momen photo is kept it is looked at once it shows to others,
 * a sure match is sent from the photo that is already there (no second upload) unless the person's switch is off (then only
 * suggested), the person can take it back, and nothing here ever stops the photo from being kept.
 */

const ME = "11111111-1111-4111-8111-111111111111";
const SARI = "22222222-2222-4222-8222-222222222222";
const PHOTO = "33333333-3333-4333-8333-333333333333";
const PHOTO2 = "44444444-4444-4444-8444-444444444444";
const M_SEKAMAR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const M_LOBI = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const M_PLANK = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const M_MATI = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const LOBBY = { latitude: -7.8815, longitude: 112.5235 };

const mission = (id: string, title: string, rules: MwMission["rules"], extra: Partial<MwMission> = {}): MwMission => ({
  id, title, description: "", kind: "foto", points: 400, placeName: "", latitude: null, longitude: null, radiusM: null, sessionId: null, credit: "panitia", review: false,
  opensAt: null, closesAt: null, sort: 1, active: true, rules, autoDetect: null, ...extra,
});

const state = vi.hoisted(() => ({
  missions: [] as unknown[], completions: [] as unknown[], pool: new Map<string, unknown>(), signals: new Map<string, unknown>(), detections: [] as unknown[],
  pref: { on: true, stored: true }, photos: new Map<string, unknown>(), kept: [] as { row: Record<string, unknown>; status: string }[], recorded: [] as unknown[], notes: [] as Record<string, unknown>[],
  savedSignals: [] as unknown[], savedTags: [] as unknown[], told: [] as unknown[], checked: [] as unknown[], deletions: [] as unknown[], taggedRows: [] as unknown[], keepFails: false, completionRow: null as unknown,
  jobs: [] as Promise<unknown>[], afterThrows: false, order: [] as string[], removedRows: [] as unknown[],
}));

vi.mock("next/server", () => ({ after: (work: () => Promise<unknown>) => { if (state.afterThrows) throw new Error("no request"); state.jobs.push(work()); } }));
vi.mock("../notes", () => ({ trySendMainWamNote: async (input: Record<string, unknown>) => { state.notes.push(input); return 1; } }));
vi.mock("../modul/rate", () => ({ limitPerson: async () => undefined }));
vi.mock("./read", () => ({
  allMissions: async () => ({ data: state.missions, migrated: true }), completionsOf: async () => ({ data: state.completions, migrated: true }),
  missionSettings: async () => ({ defaultRadiusM: 50, maxAccuracyM: 100, leaderboardOpen: true }),
}));
vi.mock("./tags", () => ({
  loadTagPool: async () => state.pool,
  savePhotoTags: async (photoId: string, by: string, tags: TagCandidate[]) => { state.order.push("tags"); state.savedTags.push({ photoId, by, ids: tags.map(tag => tag.id) }); },
  tellTagged: async (photoId: string, name: string, title: string | null) => { state.told.push({ photoId, name, title }); },
}));
vi.mock("./actions", () => ({
  doableMission: async (_context: unknown, missionId: string) => ({ mission: (state.missions as MwMission[]).find(item => item.id === missionId), settings: { defaultRadiusM: 50, maxAccuracyM: 100 }, radiusM: 50, target: null, existing: null, oldProof: [] }),
  keepCompletion: async (_context: unknown, found: { mission: MwMission }, row: Record<string, unknown>, status: string) => {
    if (state.keepFails) throw Object.assign(new Error("Misi ini sudah selesai."), { status: 409, name: "ServiceError" });
    state.kept.push({ row, status });
    return { id: `c-${state.kept.length}`, missionId: found.mission.id, employeeId: ME, status, attempts: row.attempts, photoId: row.photo_id, checkResult: row.check_result, hasProof: false } as unknown as MwCompletion;
  },
}));
vi.mock("../momen/feed", () => ({ photoRecord: async (id: string) => state.photos.get(id) ?? null }));
vi.mock("./storage", () => ({ proofAddress: async (key: string) => `https://r2/${key}?get` }));
vi.mock("./deteksi-store", () => ({
  saveSignals: async (input: unknown) => { state.order.push("signals"); state.savedSignals.push(input); return true; },
  signalsOf: async (ids: string[]) => new Map(ids.flatMap(id => (state.signals.has(id) ? [[id, state.signals.get(id) as PhotoSignal] as const] : []))),
  markChecked: async (photos: unknown[]) => { state.checked.push(photos); },
  detectionsOf: async () => state.detections as DetectionRow[],
  recordDetection: async (row: unknown) => { state.recorded.push(row); },
  readAutoPref: async () => state.pref, saveAutoPref: async () => undefined,
}));
vi.mock("../../supabase/admin", () => ({
  createPrivilegedClient: () => ({
    from: (table: string) => {
      let removing = false;
      const proxy: unknown = new Proxy({}, {
        get(_target, prop) {
          if (prop === "then") return (resolve: (value: unknown) => void) => Promise.resolve({ data: removing ? state.removedRows : table === "mw_mission_completions" ? state.completionRow : state.taggedRows, error: null }).then(resolve);
          if (prop === "maybeSingle") return () => Promise.resolve({ data: table === "mw_mission_completions" ? state.completionRow : null, error: null });
          if (prop === "delete") return () => { removing = true; state.deletions.push(table); return proxy; };
          return () => proxy;
        },
      });
      return proxy;
    },
  }),
}));

const deteksi = await import("./deteksi");
const { takeBack, afterMomenSaved, detectPhotos, submitSuggestion, checkMyPhotos } = deteksi;

const person = (id: string, extra: Partial<TagCandidate> = {}): TagCandidate => ({ id, name: id === SARI ? "Sari" : id, department: "HRGA", bod: false, seatmate: false, roommate: false, ...extra });
const context = (roles: string[] = [], misi = true): MainWamContext => ({
  viewer: { id: ME, name: "Rani", fullName: "Rani Contoh", department: "CoE", photo: null, roles, tester: false, group: null, room: null } as MainWamContext["viewer"],
  settings: { modules: { misi } } as MainWamContext["settings"],
});
const lite = (id = PHOTO) => ({ id, ownerId: ME, fileKey: `main-wam/momen/${id}.jpg`, takenAt: new Date().toISOString() });
const keptRecord = (id = PHOTO, status = "tampil") => ({ ...lite(id), status, visibleAt: new Date(Date.now() - 10_000).toISOString(), thumbKey: null, tileKey: null });
const sekamar = mission(M_SEKAMAR, "Selfie dengan teman sekamar", [{ type: "tag", count: 1, relation: "sekamar", required: true }]);
const lobi = mission(M_LOBI, "Foto di lobi", [{ type: "lokasi", name: "Lobi hotel", ...LOBBY, radiusM: 60 }]);
const plank = mission(M_PLANK, "Plank", [{ type: "pose", label: "Plank", text: "Plank." }]);
const off = mission(M_MATI, "Tag tapi mati", [{ type: "tag", count: 1, relation: "sekamar", required: true }], { autoDetect: "mati" });
const tagged = (...ids: string[]) => { state.taggedRows = ids.map(id => ({ photo_id: PHOTO, employee_id: id })); };

beforeEach(() => {
  Object.assign(state, {
    missions: [sekamar], completions: [], pool: new Map([[SARI, person(SARI, { roommate: true })]]), signals: new Map(), detections: [], pref: { on: true, stored: true }, photos: new Map([[PHOTO, keptRecord()]]),
    kept: [], recorded: [], notes: [], savedSignals: [], savedTags: [], told: [], checked: [], deletions: [], taggedRows: [], keepFails: false, completionRow: null, jobs: [], afterThrows: false, order: [], removedRows: [],
  });
  tagged(SARI);
});

describe("a sure match is sent from the photo that is already there", () => {
  it("makes the completion with the Momen photo's id, no proof file of its own and no position, then tells the person", async () => {
    const results = await detectPhotos(context(), [lite()]);
    expect(results).toEqual([expect.objectContaining({ missionId: M_SEKAMAR, outcome: "diajukan", status: "cocok", completionStatus: "perlu_ditinjau" })]);
    const [{ row, status }] = state.kept;
    expect(status).toBe("perlu_ditinjau");
    expect(row).toMatchObject({ source: "foto", photo_id: PHOTO, proof_key: null, proof_thumb_key: null, latitude: null, longitude: null, accuracy_m: null, attempts: 1 });
    expect(row.check_result).toMatchObject({ auto: { via: "momen", photoId: PHOTO, status: "cocok", by: "otomatis" }, verifier: { provider: "manual" } });
    expect((row.check_result as { auto: { passed: string[] } }).auto.passed.join(" ")).toContain("Sari");
    expect(state.recorded).toContainEqual(expect.objectContaining({ photoId: PHOTO, missionId: M_SEKAMAR, outcome: "diajukan", completionId: "c-1" }));
    expect(state.notes).toEqual([expect.objectContaining({ title: "Fotomu otomatis diajukan untuk misi Selfie dengan teman sekamar", to: { people: [ME], label: "Peserta misi" } })]);
    expect(String(state.notes[0].body)).toContain("+400");
    expect(state.checked).toHaveLength(1);
  });

  it("one photo can meet more than one mission (each is its own completion), and a mission with detection off is left alone", async () => {
    state.missions = [sekamar, lobi, plank, off];
    state.signals.set(PHOTO, { photoId: PHOTO, live: true, geo: { latitude: LOBBY.latitude + 0.0001, longitude: LOBBY.longitude, accuracy: 10 }, checkedAt: null });
    const results = await detectPhotos(context(), [lite()]);
    expect(results.map(item => [item.missionId, item.outcome]).sort((a, b) => a[0].localeCompare(b[0]))).toEqual([[M_SEKAMAR, "diajukan"], [M_LOBI, "diajukan"]]);
    expect(state.kept.map(item => item.row.photo_id)).toEqual([PHOTO, PHOTO]);
  });

  it("keeps the position out of the completion: only the distance is kept", async () => {
    state.missions = [lobi];
    state.signals.set(PHOTO, { photoId: PHOTO, live: true, geo: { latitude: LOBBY.latitude + 0.0001, longitude: LOBBY.longitude, accuracy: 10 }, checkedAt: null });
    await detectPhotos(context(), [lite()]);
    const { row } = state.kept[0];
    expect(row.distance_m).toEqual(expect.any(Number));
    expect(JSON.stringify(row)).not.toContain(String(LOBBY.longitude));
    expect(JSON.stringify(row)).not.toContain("112.52");
  });

  it("does not send what was sent, offered, taken back or waved off before; a mission that already has a proof is left alone", async () => {
    for (const outcome of ["diajukan", "saran", "ditarik", "diabaikan"] as const) {
      state.kept = []; state.detections = [{ photoId: PHOTO, missionId: M_SEKAMAR, status: "cocok", outcome, completionId: null, reasons: [], createdAt: "" }];
      expect(await detectPhotos(context(), [lite()])).toEqual([]);
      expect(state.kept).toEqual([]);
    }
    state.detections = []; state.completions = [{ missionId: M_SEKAMAR, status: "perlu_ditinjau", attempts: 1 }];
    expect(await detectPhotos(context(), [lite()])).toEqual([]);
  });

  it("an approved proof (a real verifier said lolos) is told as done", async () => {
    const verifier = await import("./verifier");
    verifier.registerVerifier({ name: "tes-lolos", verify: async () => ({ putusan: "lolos", alasan: [] }) });
    process.env.MISI_VERIFIER = "tes-lolos";
    try {
      const results = await detectPhotos(context(), [lite()]);
      expect(results[0]).toMatchObject({ outcome: "diajukan", completionStatus: "disetujui" });
      expect(state.notes[0].title).toBe("Misi Selfie dengan teman sekamar selesai");
    } finally { delete process.env.MISI_VERIFIER; }
  });

  it("stays silent when the verifier says no to a photo nobody asked to send", async () => {
    const verifier = await import("./verifier");
    verifier.registerVerifier({ name: "tes-gagal", verify: async () => ({ putusan: "gagal", alasan: ["Bukan plank."] }) });
    process.env.MISI_VERIFIER = "tes-gagal";
    try {
      expect(await detectPhotos(context(), [lite()])).toEqual([]);
      expect(state.kept).toEqual([]);
      expect(state.notes).toEqual([]);
    } finally { delete process.env.MISI_VERIFIER; }
  });
});

describe("the person's switch", () => {
  it("off: a sure match is only suggested (recorded and told once), never sent by itself", async () => {
    state.pref = { on: false, stored: true };
    const results = await detectPhotos(context(), [lite()]);
    expect(results).toEqual([expect.objectContaining({ outcome: "saran", status: "cocok" })]);
    expect(state.kept).toEqual([]);
    expect(state.recorded).toContainEqual(expect.objectContaining({ outcome: "saran", completionId: null }));
    expect(state.notes).toEqual([expect.objectContaining({ title: "Fotomu cocok untuk misi" })]);
    expect(String(state.notes[0].body)).toContain("Selfie dengan teman sekamar");
  });

  it("before the system update the switch cannot be kept, so the app only suggests", async () => {
    state.pref = { on: false, stored: false };
    expect((await detectPhotos(context(), [lite()]))[0].outcome).toBe("saran");
    expect(state.kept).toEqual([]);
  });

  it("'Ajukan' on a suggestion sends it even with the switch off, by the person; one that does not meet the rules is a 409 with why", async () => {
    state.pref = { on: false, stored: true };
    const result = await submitSuggestion(context(), M_SEKAMAR, PHOTO);
    expect(result).toMatchObject({ outcome: "diajukan" });
    expect(state.kept[0].row.check_result).toMatchObject({ auto: { by: "peserta" } });
    tagged();
    state.kept = [];
    await expect(submitSuggestion(context(), M_SEKAMAR, PHOTO)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("Tandai 1") });
    state.photos.set(PHOTO2, { ...keptRecord(PHOTO2), ownerId: SARI });
    await expect(submitSuggestion(context(), M_SEKAMAR, PHOTO2)).rejects.toMatchObject({ status: 404 });
  });
});

describe("who and when", () => {
  it("nothing for someone who does not take part in Misi (a BOD, or the module off)", async () => {
    expect(await detectPhotos(context(["bod"]), [lite()])).toEqual([]);
    expect(await detectPhotos(context([], false), [lite()])).toEqual([]);
    expect(state.kept).toEqual([]);
  });

  it("leaves photos unchecked when no mission takes detection yet, so 'Periksa fotoku' can look at them later", async () => {
    state.missions = [plank, off];
    expect(await detectPhotos(context(), [lite()])).toEqual([]);
    expect(state.checked).toEqual([]);
  });

  it("another request kept the mission first: nothing is told and nothing breaks", async () => {
    state.keepFails = true;
    expect(await detectPhotos(context(), [lite()])).toEqual([]);
    expect(state.notes).toEqual([]);
  });
});

describe("after a Momen photo is kept", () => {
  const input = { tags: [SARI], geo: { latitude: LOBBY.latitude, longitude: LOBBY.longitude, accuracy: 9 }, gallery: false };
  const soon = () => new Date(Date.now() + 5_000).toISOString();

  it("remembers the signals, keeps the tags, waits until the photo shows to others, then tells the tagged and looks for missions", async () => {
    const waited: number[] = [];
    await afterMomenSaved(context(), { id: PHOTO, visibleAt: soon() }, input, { wait: async ms => { state.order.push("wait"); waited.push(ms); } });
    expect(state.savedSignals).toEqual([{ photoId: PHOTO, ownerId: ME, live: true, geo: input.geo }]);
    expect(state.savedTags).toEqual([{ photoId: PHOTO, by: ME, ids: [SARI] }]);
    expect(state.order.slice(0, 3)).toEqual(["signals", "tags", "wait"]);
    expect(waited[0]).toBeGreaterThan(4_000);
    expect(waited[0]).toBeLessThanOrEqual(8_300);
    expect(state.told).toEqual([{ photoId: PHOTO, name: "Rani", title: null }]);
    expect(state.kept).toHaveLength(1);
  });

  it("a gallery picture has no position kept and is never a live photo", async () => {
    await afterMomenSaved(context(), { id: PHOTO, visibleAt: soon() }, { ...input, gallery: true }, { wait: async () => undefined });
    expect(state.savedSignals).toEqual([{ photoId: PHOTO, ownerId: ME, live: false, geo: null }]);
    expect(state.kept).toEqual([]);
  });

  it("a photo taken back (Batalkan) or hidden while it waited tells nobody and sends nothing", async () => {
    state.photos.delete(PHOTO);
    await afterMomenSaved(context(), { id: PHOTO, visibleAt: soon() }, input, { wait: async () => undefined });
    expect(state.told).toEqual([]);
    expect(state.kept).toEqual([]);
    state.photos.set(PHOTO, keptRecord(PHOTO, "disembunyikan"));
    await afterMomenSaved(context(), { id: PHOTO, visibleAt: soon() }, input, { wait: async () => undefined });
    expect(state.kept).toEqual([]);
  });

  it("a person who is not a participant is not tagged; the rest still are", async () => {
    await afterMomenSaved(context(), { id: PHOTO, visibleAt: soon() }, { ...input, tags: [SARI, "99999999-9999-4999-8999-999999999999"] }, { wait: async () => undefined });
    expect(state.savedTags).toEqual([{ photoId: PHOTO, by: ME, ids: [SARI] }]);
  });

  it("never throws, whatever goes wrong: the photo is already kept", async () => {
    state.missions = { map: () => { throw new Error("boom"); }, filter: () => { throw new Error("boom"); } } as unknown as unknown[];
    await expect(afterMomenSaved(context(), { id: PHOTO, visibleAt: soon() }, input, { wait: async () => undefined })).resolves.toBeUndefined();
  });

  it("is scheduled after the answer, and is only skipped, never an error, outside a request", async () => {
    state.afterThrows = true;
    expect(() => deteksi.scheduleAfterMomenSaved(context(), { id: PHOTO, visibleAt: soon() }, input)).not.toThrow();
    state.afterThrows = false;
    deteksi.scheduleAfterMomenSaved(context(), { id: PHOTO, visibleAt: new Date(Date.now() - 1000).toISOString() }, input);
    expect(state.jobs).toHaveLength(1);
    await state.jobs[0];
    expect(state.savedSignals).toHaveLength(1);
  });
});

describe("Periksa fotoku", () => {
  it("only photos that were never looked at, at most thirty", async () => {
    state.taggedRows = [];
    // The mocked database answers the same rows for any read: three photos, one already checked.
    state.completionRow = null;
    const rows = Array.from({ length: 3 }, (_, index) => ({ id: `0000000${index}-0000-4000-8000-000000000000`, owner_id: ME, file_key: "k", taken_at: new Date().toISOString() }));
    state.taggedRows = rows;
    state.signals.set(rows[0].id, { photoId: rows[0].id, live: true, geo: null, checkedAt: "2027-01-05T08:00:00Z" });
    const answer = await checkMyPhotos(context());
    expect(answer.checked).toBe(2);
  });
});

describe("Tarik", () => {
  const row = (status: string, auto: boolean) => ({
    id: "c-1", mission_id: M_SEKAMAR, employee_id: ME, source: "foto", status, attempts: 1, photo_id: PHOTO,
    check_result: { checks: [], verifier: null, decidedAt: "2027-01-05T09:00:00Z", ...(auto ? { auto: { via: "momen", photoId: PHOTO, status: "cocok", by: "otomatis", passed: [], unknown: [], distanceM: null } } : {}) },
  });

  it("takes back a proof made from a Momen photo while nobody has decided, and remembers it so it is never sent again", async () => {
    state.completionRow = row("perlu_ditinjau", true);
    state.removedRows = [{ id: "c-1" }];
    await takeBack(context(), M_SEKAMAR);
    expect(state.deletions).toContain("mw_mission_completions");
    expect(state.recorded).toEqual([expect.objectContaining({ photoId: PHOTO, missionId: M_SEKAMAR, outcome: "ditarik", completionId: null })]);
  });

  it("refuses a decided proof, a proof from the mission camera, and a mission with no proof", async () => {
    state.completionRow = row("disetujui", true);
    await expect(takeBack(context(), M_SEKAMAR)).rejects.toMatchObject({ status: 409, message: "Kiriman ini sudah diputuskan, jadi tidak bisa ditarik." });
    state.completionRow = row("perlu_ditinjau", false);
    await expect(takeBack(context(), M_SEKAMAR)).rejects.toMatchObject({ status: 409, message: "Kiriman ini dibuat dari kamera misi, jadi tidak bisa ditarik." });
    state.completionRow = null;
    await expect(takeBack(context(), M_SEKAMAR)).rejects.toMatchObject({ status: 404 });
    expect(state.deletions).toEqual([]);
  });

  it("refuses when someone decided between the read and the delete", async () => {
    state.completionRow = row("perlu_ditinjau", true);
    state.removedRows = [];
    await expect(takeBack(context(), M_SEKAMAR)).rejects.toMatchObject({ status: 409 });
    expect(state.recorded).toEqual([]);
  });
});

describe("what the Misi page shows from my photos", () => {
  const item = (id: string, status: MissionItem["status"], availability: MissionItem["availability"] = "buka"): MissionItem => ({
    id, title: id, description: "", kind: "foto", points: 300, status, availability, placeName: "", hasPlace: false, radiusM: 50, sessionId: null, sessionTitle: null, credit: "panitia", review: false,
    opensAt: null, closesAt: null, rejectedNote: "", rules: [], attempts: status === "todo" ? 0 : 1, maxAttempts: null,
  });
  const row = (missionId: string, outcome: DetectionRow["outcome"]): DetectionRow => ({ photoId: PHOTO, missionId, status: "cocok", outcome, completionId: null, reasons: [], createdAt: "" });

  it("shows a proof sent by itself with where it stands (Tarik while nobody decided), and a suggestion only while the mission can still be started", () => {
    const list = deteksi.fromPhotosOf([row("a", "diajukan"), row("b", "diajukan"), row("c", "saran"), row("d", "saran"), row("e", "saran"), row("f", "ditarik")], [item("a", "review"), item("b", "done"), item("c", "todo"), item("d", "done"), item("e", "todo", "tutup"), item("f", "todo")]);
    expect(list.map(entry => [entry.missionId, entry.outcome, entry.state, entry.canTakeBack])).toEqual([["a", "diajukan", "review", true], ["b", "diajukan", "done", false], ["c", "saran", "todo", false]]);
  });

  it("hides a sent proof whose mission is open again (it was taken back)", () => {
    expect(deteksi.fromPhotosOf([row("a", "diajukan")], [item("a", "todo")])).toEqual([]);
  });
});
