import { describe, expect, it } from "vitest";
import { actionFor, autoModeOf, countedTags, detectForPhoto, detectMission, hasEvidenceRules, type DetectInput, type PhotoFacts } from "./detect";
import type { MissionRule, TagCandidate } from "./rules";
import type { MwMission } from "./types";

/*
 * Detecting missions from a Momen photo, with no server: the same rules as the mission camera decide, and
 * what cannot be known (no location, a pose) is never guessed.
 */

const NOW = new Date("2027-01-05T10:00:00+07:00");
const TAKEN = "2027-01-05T09:58:00+07:00";
const LOBBY = { latitude: -7.8815, longitude: 112.5235 };
const ME = { id: "me", department: "CoE" };

const person = (id: string, extra: Partial<TagCandidate> = {}): TagCandidate => ({ id, name: id.toUpperCase(), department: "Finance", bod: false, seatmate: false, roommate: false, ...extra });
const SARI = person("sari", { roommate: true, department: "HRGA" });
const BIMA = person("bima", { seatmate: true });
const ARMAN = person("arman", { bod: true, department: "BOD" });
const WULAN = person("wulan", { bod: true, department: "BOD" });

const live: MissionRule = { type: "foto_langsung" };
const pose: MissionRule = { type: "pose", label: "Plank", text: "Orang di foto sedang plank." };
const tag = (count: number, relation: Extract<MissionRule, { type: "tag" }>["relation"], required = true): MissionRule => ({ type: "tag", count, relation, required });
const place = (radiusM = 50): MissionRule => ({ type: "lokasi", name: "Lobi hotel", ...LOBBY, radiusM });

function mission(id: string, rules: MissionRule[], extra: Partial<MwMission> = {}): MwMission {
  return {
    id, title: id, description: "", kind: "foto", points: 300, placeName: "", latitude: null, longitude: null, radiusM: null, sessionId: null, credit: "panitia",
    review: false, opensAt: null, closesAt: null, sort: 1, active: true, rules, autoDetect: null, ...extra,
  };
}
const photo = (extra: Partial<PhotoFacts> = {}): PhotoFacts => ({ photoId: "p1", takenAt: TAKEN, live: true, geo: null, tags: [], ...extra });
const near = { latitude: LOBBY.latitude + 0.0001, longitude: LOBBY.longitude, accuracy: 12 };
const input = (missions: MwMission[], facts: PhotoFacts, extra: Partial<DetectInput> = {}): DetectInput => ({
  missions, completions: [], photo: facts, submitter: ME, settings: { defaultRadiusM: 50, maxAccuracyM: 100 }, now: NOW, ...extra,
});
const one = (m: MwMission, facts: PhotoFacts, extra: Partial<DetectInput> = {}) => detectMission(m, input([m], facts, extra));

describe("the mode of a mission", () => {
  it("is on by default when the rules give evidence (a place or a required tag), off for a pose alone", () => {
    expect(autoModeOf(mission("a", [live, tag(1, "sekamar")]))).toBe("cocok");
    expect(autoModeOf(mission("b", [live, place()]))).toBe("cocok");
    expect(autoModeOf(mission("c", [live, pose]))).toBe("mati");
    expect(autoModeOf(mission("d", [live, tag(2, "siapa_saja", false), pose]))).toBe("mati");
    expect(autoModeOf(mission("e", [live, pose]), true)).toBe("cocok");
  });

  it("follows the admin's choice, and only a photo mission takes detection", () => {
    expect(autoModeOf(mission("a", [live, pose], { autoDetect: "mungkin" }))).toBe("mungkin");
    expect(autoModeOf(mission("b", [live, tag(1, "sekamar")], { autoDetect: "mati" }))).toBe("mati");
    expect(autoModeOf(mission("c", [], { kind: "checkin", autoDetect: "cocok" }))).toBe("mati");
    expect(hasEvidenceRules([live, pose])).toBe(false);
  });
});

describe("tags", () => {
  const sekamar = mission("sekamar", [live, tag(1, "sekamar")]);
  it("cocok when enough people of the right kind are tagged", () => {
    const result = one(sekamar, photo({ tags: [SARI] }));
    expect(result).toMatchObject({ status: "cocok", autoSubmit: true, suggest: true, counted: ["sari"] });
    expect(result.passed.join(" ")).toContain("SARI");
  });

  it("tidak when too few are tagged, or the person is not the right kind (a role that is wrong)", () => {
    expect(one(sekamar, photo({ tags: [] }))).toMatchObject({ status: "tidak", autoSubmit: false, suggest: false });
    expect(one(sekamar, photo({ tags: [] })).reasons[0]).toContain("Tandai 1");
    expect(one(sekamar, photo({ tags: [BIMA] })).status).toBe("tidak");
    expect(one(sekamar, photo({ tags: [BIMA] })).reasons[0]).toContain("sekamar");
  });

  it("counts only the people who fit, so a photo with more friends than the rule asks still meets it", () => {
    expect(one(sekamar, photo({ tags: [BIMA, SARI, ARMAN] }))).toMatchObject({ status: "cocok", counted: ["sari"] });
    const bod = mission("bod", [live, tag(2, "bod")]);
    expect(one(bod, photo({ tags: [ARMAN, SARI] })).status).toBe("tidak");
    expect(one(bod, photo({ tags: [ARMAN, WULAN, SARI] }))).toMatchObject({ status: "cocok", counted: ["arman", "wulan"] });
  });

  it("departemen_lain: different from mine and from each other", () => {
    const rule = { type: "tag", count: 2, relation: "departemen_lain", required: true } as const;
    expect(countedTags(rule, [person("a", { department: "CoE" }), person("b", { department: "Finance" }), person("c", { department: "finance" }), person("d", { department: "HRGA" })], ME).map(item => item.id)).toEqual(["b", "d"]);
    expect(one(mission("x", [live, rule]), photo({ tags: [person("b", { department: "Finance" }), person("c", { department: "Finance" })] })).status).toBe("tidak");
  });

  it("an optional tag rule is no evidence: nothing tagged does not break it, but it does not make the photo a match either", () => {
    const optional = mission("opt", [live, tag(3, "siapa_saja", false), pose], { autoDetect: "mungkin" });
    expect(one(optional, photo())).toMatchObject({ status: "mungkin" });
  });
});

describe("the place", () => {
  const lobby = mission("lobi", [live, place(60)]);
  it("cocok inside the radius, tidak outside it", () => {
    expect(one(lobby, photo({ geo: near }))).toMatchObject({ status: "cocok", autoSubmit: true });
    expect(one(lobby, photo({ geo: near })).distanceM).toBeLessThanOrEqual(60);
    const far = one(lobby, photo({ geo: { latitude: LOBBY.latitude + 0.01, longitude: LOBBY.longitude, accuracy: 10 } }));
    expect(far).toMatchObject({ status: "tidak", suggest: false });
    expect(far.reasons[0]).toContain("Lobi hotel");
  });

  it("mungkin without a position (it is not guessed), and when the fix is too coarse to say", () => {
    const none = one(lobby, photo());
    expect(none).toMatchObject({ status: "mungkin", autoSubmit: false, suggest: true });
    expect(none.unknown.join(" ")).toContain("Lokasi foto tidak dibagikan");
    const coarse = one(lobby, photo({ geo: { ...near, accuracy: 500 } }));
    expect(coarse.status).toBe("mungkin");
    expect(coarse.unknown.join(" ")).toContain("kurang teliti");
  });

  it("a mission that takes 'mungkin' sends a photo without a position by itself, but never one outside", () => {
    const loose = mission("lobi2", [live, place(60)], { autoDetect: "mungkin" });
    expect(one(loose, photo())).toMatchObject({ status: "mungkin", autoSubmit: true });
    expect(one(loose, photo({ geo: { latitude: LOBBY.latitude + 0.01, longitude: LOBBY.longitude, accuracy: 10 } })).autoSubmit).toBe(false);
  });

  it("place and tags together: the tags hold but the place is unknown, so only mungkin", () => {
    const both = mission("both", [live, place(60), tag(1, "sekamar")]);
    expect(one(both, photo({ tags: [SARI] }))).toMatchObject({ status: "mungkin" });
    expect(one(both, photo({ tags: [SARI], geo: near }))).toMatchObject({ status: "cocok" });
  });
});

describe("time, tries and what is already done", () => {
  const timed = mission("pagi", [live, tag(1, "sekamar"), { type: "waktu", start: "2027-01-05T06:00:00+07:00", end: "2027-01-05T09:00:00+07:00" }], { opensAt: "2027-01-05T06:00:00+07:00", closesAt: "2027-01-05T09:00:00+07:00" });
  it("the window is judged at the time of the photo, and a mission closed now takes nothing", () => {
    // Taken inside the window but looked at after it closed: the mission is closed.
    expect(one(timed, photo({ takenAt: "2027-01-05T08:30:00+07:00", tags: [SARI] })).reasons[0]).toContain("sudah ditutup");
    const open = mission("pagi2", [live, tag(1, "sekamar"), { type: "waktu", start: "2027-01-05T06:00:00+07:00", end: "2027-01-05T12:00:00+07:00" }], { opensAt: "2027-01-05T06:00:00+07:00", closesAt: "2027-01-05T12:00:00+07:00" });
    expect(one(open, photo({ takenAt: "2027-01-05T08:30:00+07:00", tags: [SARI] })).status).toBe("cocok");
    // Taken before the window opened.
    expect(one(open, photo({ takenAt: "2027-01-05T05:00:00+07:00", tags: [SARI] })).status).toBe("tidak");
  });

  it("not yet open is tidak", () => {
    const later = mission("nanti", [live, tag(1, "sekamar")], { opensAt: "2027-01-06T06:00:00+07:00" });
    expect(one(later, photo({ tags: [SARI] })).reasons[0]).toContain("belum dibuka");
  });

  it("a mission already done, or with a proof waiting, is tidak; a rejected one may be sent again while tries are left", () => {
    const limited = mission("batas", [live, tag(1, "sekamar"), { type: "batas_kali", times: 2 }]);
    const withDone = (status: "disetujui" | "perlu_ditinjau" | "ditolak", attempts = 1) => one(limited, photo({ tags: [SARI] }), { completions: [{ missionId: "batas", status, attempts }] });
    expect(withDone("disetujui").reasons[0]).toContain("sudah selesai");
    expect(withDone("perlu_ditinjau").reasons[0]).toContain("sedang ditinjau");
    expect(withDone("ditolak", 1).status).toBe("cocok");
    expect(withDone("ditolak", 2).reasons[0]).toContain("Batas kirim");
  });

  it("a gallery picture is never a live photo", () => {
    expect(one(mission("g", [live, tag(1, "sekamar")]), photo({ live: false, tags: [SARI] })).reasons[0]).toContain("kamera aplikasi");
  });
});

describe("pose and objects", () => {
  it("a pose-only mission is off by default; with the admin's yes it is only mungkin, because nobody but the verifier can tell", () => {
    const plank = mission("plank", [live, pose]);
    expect(one(plank, photo())).toMatchObject({ status: "tidak", suggest: false });
    expect(one(plank, photo()).reasons[0]).toContain("mati");
    const asked = mission("plank2", [live, pose], { autoDetect: "mungkin" });
    const result = one(asked, photo());
    expect(result).toMatchObject({ status: "mungkin", autoSubmit: true });
    expect(result.unknown.join(" ")).toContain("pemeriksa");
  });

  it("with a real AI verifier a pose-only mission can be cocok", () => {
    expect(one(mission("plank3", [live, pose]), photo(), { aiVerifier: true })).toMatchObject({ status: "cocok" });
  });

  it("a mission with a place and a pose is cocok when the place holds: the pose is left to the verifier", () => {
    const result = one(mission("pp", [live, place(60), pose]), photo({ geo: near }));
    expect(result.status).toBe("cocok");
    expect(result.unknown.join(" ")).toContain("Pose");
  });
});

describe("one photo, many missions", () => {
  it("every mission is judged on its own, in the admin's order; only photo missions that are active are listed", () => {
    const missions = [mission("a", [live, tag(1, "sekamar")]), mission("b", [live, tag(2, "bod")]), mission("c", [live, place(60)]), mission("d", [live, pose]), mission("e", [], { kind: "checkin" }), mission("f", [live, tag(1, "sekamar")], { active: false })];
    const result = detectForPhoto(input(missions, photo({ tags: [SARI], geo: near })));
    expect(result.map(item => [item.missionId, item.status])).toEqual([["a", "cocok"], ["b", "tidak"], ["c", "cocok"], ["d", "tidak"]]);
  });
});

describe("what to do with a candidate", () => {
  const sure = { status: "cocok", autoSubmit: true, suggest: true } as const;
  it("sends a sure match by itself while the person's switch is on, and only suggests it when it is off", () => {
    expect(actionFor(sure, { personAuto: true, before: null })).toBe("ajukan");
    expect(actionFor(sure, { personAuto: false, before: null })).toBe("saran");
  });
  it("suggests a doubtful one when the mission does not send it by itself", () => {
    expect(actionFor({ status: "mungkin", autoSubmit: false, suggest: true }, { personAuto: true, before: null })).toBe("saran");
  });
  it("does nothing for tidak, for a mission with detection off, or for a pair that was sent, offered, taken back or waved off", () => {
    expect(actionFor({ status: "tidak", autoSubmit: false, suggest: false }, { personAuto: true, before: null })).toBe("lewati");
    expect(actionFor({ ...sure, suggest: false }, { personAuto: true, before: null })).toBe("lewati");
    for (const before of ["diajukan", "saran", "ditarik", "diabaikan"] as const) expect(actionFor(sure, { personAuto: true, before })).toBe("lewati");
  });
});
