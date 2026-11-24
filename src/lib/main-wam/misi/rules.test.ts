import { describe, expect, it } from "vitest";
import { checkRules, effectiveRules, parseRules, publicRules, ruleDisplays, rulesSchema, tagProblem, type CheckContext, type MissionRule, type TagCandidate } from "./rules";
import { missionRow, missionSchema, reviewSchema } from "./schema";
import { orderCandidates, seatmatesOf, seatParts, suggestionReason } from "./tags";
import { MISSION_TEMPLATES } from "./templates";
import { canMove, canResend, decide, reasonLine } from "./verify";
import { sampleMissionOf, sampleReviewQueue } from "./sample";

const NOW = new Date("2027-01-05T10:00:00+07:00");
const person = (id: string, over: Partial<TagCandidate> = {}): TagCandidate => ({ id, name: id, department: `Dept ${id}`, bod: false, seatmate: false, roommate: false, ...over });
const ME = { id: "me", department: "CoE" };
const context = (over: Partial<CheckContext> = {}): CheckContext => ({ now: NOW, inside: true, tags: [], submitter: ME, previous: 0, live: true, ...over });
const tag2bod: MissionRule = { type: "tag", count: 2, relation: "bod", required: true };

describe("the rules (TNC)", () => {
  it("accepts each kind of rule and refuses what does not fit", () => {
    expect(rulesSchema.safeParse([{ type: "foto_langsung" }, { type: "lokasi", name: "Jatim Park", latitude: -7.88, longitude: 112.52, radiusM: 150 }, tag2bod, { type: "pose", label: "Pose plank", text: "Plank." }, { type: "waktu", start: null, end: "2027-01-06T18:00:00+07:00" }, { type: "batas_kali", times: 3 }]).success).toBe(true);
    expect(rulesSchema.safeParse([{ type: "lokasi", name: "X", latitude: 99, longitude: 0, radiusM: 50 }]).success).toBe(false);
    expect(rulesSchema.safeParse([{ type: "lokasi", name: "Tempat", latitude: 1, longitude: 2, radiusM: 5 }]).success).toBe(false);
    expect(rulesSchema.safeParse([{ type: "tag", count: 0, relation: "bod" }]).success).toBe(false);
    expect(rulesSchema.safeParse([{ type: "tag", count: 7, relation: "bod" }]).success).toBe(false);
    expect(rulesSchema.safeParse([{ type: "tag", count: 2, relation: "teman" }]).success).toBe(false);
    expect(rulesSchema.safeParse([{ type: "waktu", start: null, end: null }]).success).toBe(false);
    expect(rulesSchema.safeParse([{ type: "waktu", start: "2027-01-06T18:00:00+07:00", end: "2027-01-06T08:00:00+07:00" }]).success).toBe(false);
    expect(rulesSchema.safeParse([{ type: "batas_kali", times: 0 }]).success).toBe(false);
    expect(rulesSchema.safeParse([{ type: "foto_langsung" }, { type: "foto_langsung" }]).success).toBe(false);
    expect(rulesSchema.safeParse([{ type: "foto_langsung", extra: 1 }]).success).toBe(false);
    expect(rulesSchema.parse([{ type: "tag", count: 1, relation: "sekamar" }])[0]).toMatchObject({ required: true });
  });

  it("reads stored rules rule by rule, never throwing", () => {
    expect(parseRules("bukan list")).toEqual([]);
    expect(parseRules([{ type: "foto_langsung" }, { type: "aneh" }, { type: "foto_langsung" }, null])).toEqual([{ type: "foto_langsung" }]);
  });

  it("fills a mission's rules from its older columns, and keeps the point off the phone", () => {
    const legacy = { kind: "foto", rules: [], placeName: "Alun-alun", latitude: -7.87, longitude: 112.52, radiusM: null, opensAt: null, closesAt: "2027-01-05T21:00:00+07:00" };
    const rules = effectiveRules(legacy, 50);
    expect(rules.map(rule => rule.type)).toEqual(["foto_langsung", "lokasi", "waktu"]);
    expect(rules[1]).toMatchObject({ radiusM: 50, latitude: -7.87 });
    const shown = publicRules(rules);
    expect(JSON.stringify(shown)).not.toContain("-7.87");
    expect(shown[1]).toEqual({ type: "lokasi", name: "Alun-alun", radiusM: 50 });
    // A check-in mission is not a photo mission: no camera rule is invented.
    expect(effectiveRules({ ...legacy, kind: "checkin" }).map(rule => rule.type)).toEqual(["lokasi", "waktu"]);
  });

  it("writes chips and lines for each rule, in both languages", () => {
    const rules = publicRules(sampleMissionOf("plank-jatim-park").rules);
    const id = ruleDisplays(rules, "id");
    expect(id.flatMap(rule => rule.chips)).toEqual(["Foto langsung", "Lokasi aktif", "Di Jatim Park, Batu (contoh)", "Tag teman (opsional)", "Pose plank", expect.stringMatching(/^Batas: /), "Maks 2 kali"]);
    expect(ruleDisplays(publicRules(sampleMissionOf("bod-berdua").rules), "id").flatMap(rule => rule.chips)).toContain("Tag 2 BOD");
    expect(ruleDisplays(publicRules(sampleMissionOf("sebangku-kereta").rules), "id").flatMap(rule => rule.chips)).toContain("Tag teman sebangku");
    expect(ruleDisplays(publicRules(sampleMissionOf("sekamar").rules), "id").flatMap(rule => rule.chips)).toContain("Tag teman sekamar");
    expect(ruleDisplays(rules, "en").flatMap(rule => rule.chips)).toEqual(expect.arrayContaining(["Live photo", "Location on", "Tag friends (optional)", "Max 2 tries"]));
    expect(id.find(rule => rule.type === "pose")).toMatchObject({ title: "Pose plank", note: expect.stringContaining("plank") });
  });
});

describe("the checks the server makes without AI", () => {
  const lokasi: MissionRule = { type: "lokasi", name: "Jatim Park", latitude: -7.88, longitude: 112.52, radiusM: 150 };
  const reasons = (rules: MissionRule[], over: Partial<CheckContext> = {}) => checkRules(rules, context(over));

  it("a position inside the circle passes, outside it breaks the rule, unknown is not judged", () => {
    expect(reasons([lokasi]).ok).toBe(true);
    const outside = reasons([lokasi], { inside: false });
    expect(outside.ok).toBe(false);
    expect(outside.reasons[0]).toContain("Jatim Park");
    expect(reasons([lokasi], { inside: null }).checks[0].ok).toBeNull();
  });

  it("tags: too few, enough, the wrong role, the person themselves, the same person twice", () => {
    const bod = (id: string) => person(id, { bod: true });
    expect(reasons([tag2bod], { tags: [bod("a")] })).toMatchObject({ ok: false, reasons: [expect.stringContaining("baru 1")] });
    expect(reasons([tag2bod], { tags: [bod("a"), bod("b")] }).ok).toBe(true);
    expect(reasons([tag2bod], { tags: [bod("a"), person("b")] })).toMatchObject({ ok: false, reasons: [expect.stringContaining("BOD")] });
    expect(reasons([tag2bod], { tags: [bod("a"), bod("a")] }).ok).toBe(false);
    expect(reasons([tag2bod], { tags: [bod("me"), bod("b")] }).ok).toBe(false);
    expect(reasons([tag2bod], { tags: [bod("a"), bod("b"), bod("c")] }).reasons[0]).toContain("Paling banyak 2");
  });

  it("tags of one relation: sebangku, sekamar, departemen lain, siapa saja, and an optional tag", () => {
    const rule = (relation: Extract<MissionRule, { type: "tag" }>["relation"], count = 1, required = true): MissionRule => ({ type: "tag", count, relation, required });
    expect(reasons([rule("sebangku")], { tags: [person("a", { seatmate: true })] }).ok).toBe(true);
    expect(reasons([rule("sebangku")], { tags: [person("a", { roommate: true })] }).ok).toBe(false);
    expect(reasons([rule("sekamar")], { tags: [person("a", { roommate: true })] }).ok).toBe(true);
    expect(reasons([rule("sekamar")], { tags: [person("a")] }).ok).toBe(false);
    expect(reasons([rule("departemen_lain", 2)], { tags: [person("a"), person("b")] }).ok).toBe(true);
    expect(reasons([rule("departemen_lain", 2)], { tags: [person("a", { department: "CoE" }), person("b")] }).ok).toBe(false);
    expect(reasons([rule("departemen_lain", 2)], { tags: [person("a", { department: "Finance" }), person("b", { department: "finance" })] }).ok).toBe(false);
    expect(reasons([rule("siapa_saja", 3)], { tags: [person("a"), person("b"), person("c")] }).ok).toBe(true);
    expect(reasons([rule("siapa_saja", 3)], { tags: [person("a")] }).ok).toBe(false);
    // Optional: nobody is fine, someone is fine, more than the number is not.
    expect(reasons([rule("siapa_saja", 2, false)], { tags: [] }).ok).toBe(true);
    expect(reasons([rule("siapa_saja", 2, false)], { tags: [person("a")] }).ok).toBe(true);
    expect(reasons([rule("siapa_saja", 2, false)], { tags: [person("a"), person("b"), person("c")] }).ok).toBe(false);
    expect(tagProblem({ type: "tag", count: 1, relation: "siapa_saja", required: true }, [], ME)).toContain("Tandai 1");
  });

  it("time: before the start and after the end are refused, inside is fine", () => {
    const window: MissionRule = { type: "waktu", start: "2027-01-05T08:00:00+07:00", end: "2027-01-05T12:00:00+07:00" };
    expect(reasons([window]).ok).toBe(true);
    expect(reasons([window], { now: new Date("2027-01-05T07:00:00+07:00") })).toMatchObject({ ok: false, reasons: ["Misi ini belum dibuka."] });
    expect(reasons([window], { now: new Date("2027-01-05T12:00:00+07:00") })).toMatchObject({ ok: false, reasons: ["Misi ini sudah ditutup."] });
    expect(reasons([{ type: "waktu", start: null, end: "2027-01-05T12:00:00+07:00" }]).ok).toBe(true);
  });

  it("tries: below the limit passes, at the limit is refused", () => {
    const limit: MissionRule = { type: "batas_kali", times: 2 };
    expect(reasons([limit], { previous: 1 }).ok).toBe(true);
    expect(reasons([limit], { previous: 2 })).toMatchObject({ ok: false, reasons: [expect.stringContaining("2 kali")] });
  });

  it("the camera rule, and a pose that only the verifier can judge", () => {
    expect(reasons([{ type: "foto_langsung" }], { live: false }).ok).toBe(false);
    const pose = reasons([{ type: "pose", label: "Plank", text: "Plank." }]);
    expect(pose.ok).toBe(true);
    expect(pose.checks[0].ok).toBeNull();
  });

  it("is deterministic: the same input, the same answer", () => {
    const rules = sampleMissionOf("plank-jatim-park").rules;
    expect(checkRules(rules, context())).toEqual(checkRules(rules, context()));
  });
});

describe("the road of a proof", () => {
  it("a broken rule rejects before the verifier is asked; the verifier's word decides the rest", () => {
    expect(decide({ ruleReasons: ["Tandai 2 anggota BOD (baru 1)."], verifier: null, review: false })).toEqual({ status: "ditolak", reasons: ["Tandai 2 anggota BOD (baru 1)."] });
    expect(decide({ ruleReasons: [], verifier: { putusan: "ragu", alasan: ["Menunggu tinjauan panitia."] }, review: false }).status).toBe("perlu_ditinjau");
    expect(decide({ ruleReasons: [], verifier: { putusan: "lolos", alasan: [] }, review: false })).toEqual({ status: "disetujui", reasons: [] });
    expect(decide({ ruleReasons: [], verifier: { putusan: "gagal", alasan: ["Bukan plank."] }, review: false })).toEqual({ status: "ditolak", reasons: ["Bukan plank."] });
    expect(decide({ ruleReasons: [], verifier: { putusan: "gagal", alasan: [] }, review: false }).reasons).toHaveLength(1);
    // A mission that asks for review never approves by itself.
    expect(decide({ ruleReasons: [], verifier: { putusan: "lolos", alasan: [] }, review: true }).status).toBe("perlu_ditinjau");
  });

  it("moves only along the road, points only with disetujui", () => {
    expect(canMove("dikirim", "diperiksa")).toBe(true);
    expect(canMove("diperiksa", "perlu_ditinjau")).toBe(true);
    expect(canMove("perlu_ditinjau", "disetujui")).toBe(true);
    expect(canMove("menunggu", "ditolak")).toBe(true);
    expect(canMove("disetujui", "perlu_ditinjau")).toBe(false);
    expect(canMove("disetujui", "dikirim")).toBe(false);
    expect(canMove("perlu_ditinjau", "diperiksa")).toBe(false);
    expect(canMove("ditolak", "dikirim")).toBe(true);
  });

  it("sends again only after a rejection and while the limit allows", () => {
    expect(canResend("ditolak", 1, 3)).toBe(true);
    expect(canResend("ditolak", 3, 3)).toBe(false);
    expect(canResend("ditolak", 9, null)).toBe(true);
    expect(canResend("perlu_ditinjau", 1, 3)).toBe(false);
    expect(canResend("disetujui", 1, null)).toBe(false);
  });

  it("keeps the reasons within the column", () => {
    expect(reasonLine(["a".repeat(200), "b".repeat(200)])).toHaveLength(300);
  });

  it("a rejection needs its reason; an approval does not", () => {
    expect(reviewSchema.safeParse({ status: "disetujui" }).success).toBe(true);
    expect(reviewSchema.safeParse({ status: "ditolak" }).success).toBe(false);
    expect(reviewSchema.safeParse({ status: "ditolak", note: "Bukan plank." }).success).toBe(true);
  });
});

describe("the templates and the mission schema", () => {
  it("has twelve templates that pass the schema, only photo missions, with the most points for both BOD", () => {
    expect(MISSION_TEMPLATES).toHaveLength(12);
    for (const template of MISSION_TEMPLATES) {
      expect(rulesSchema.safeParse(template.rules).success, template.key).toBe(true);
      expect(template.rules[0]).toEqual({ type: "foto_langsung" });
      expect(missionSchema.safeParse({ title: template.title, description: template.description, kind: "foto", points: template.points, rules: template.rules }).success, template.key).toBe(true);
    }
    const top = [...MISSION_TEMPLATES].sort((a, b) => b.points - a.points)[0];
    expect(top).toMatchObject({ key: "bod-berdua", points: 150 });
    expect(top.rules).toContainEqual({ type: "tag", count: 2, relation: "bod", required: true });
    const byKey = Object.fromEntries(MISSION_TEMPLATES.map(template => [template.key, template]));
    expect(byKey["sebangku-kereta"].points).toBe(60);
    expect(byKey.sekamar.points).toBe(40);
    expect(byKey["plank-jatim-park"].points).toBe(80);
    expect(byKey["plank-jatim-park"].rules.some(rule => rule.type === "lokasi" && rule.name.includes("Jatim Park"))).toBe(true);
  });

  it("only photo missions have rules, and a place or a window in the rules fills the older columns", () => {
    expect(missionSchema.safeParse({ title: "Check-in", kind: "checkin", points: 5, latitude: 1, longitude: 2, rules: [{ type: "foto_langsung" }] }).success).toBe(false);
    const plank = MISSION_TEMPLATES.find(template => template.key === "plank-jatim-park")!;
    const row = missionRow(missionSchema.parse({ title: plank.title, kind: "foto", points: plank.points, rules: plank.rules }));
    expect(row).toMatchObject({ place_name: "Jatim Park, Batu (contoh)", latitude: -7.8856, radius_m: 150, opens_at: expect.stringContaining("2027-01-05"), rules: plank.rules });
    // No rules: the row has no `rules` key, so it saves before the migration too.
    expect(missionRow(missionSchema.parse({ title: "Foto tim", kind: "foto", points: 10 }))).not.toHaveProperty("rules");
  });
});

describe("tags (pure)", () => {
  it("reads the seat text and finds the people on the same coach and row", () => {
    expect(seatParts("Gerbong 3 · Kursi 12A")).toEqual({ coach: "gerbong 3", row: "12" });
    expect(seatParts("12B")).toEqual({ coach: "", row: "12" });
    expect(seatParts("Bus 2")).toBeNull();
    expect(seatParts("")).toBeNull();
    const seats = [
      { tripId: "t", employeeId: "me", seat: "Gerbong 3 · Kursi 12A" }, { tripId: "t", employeeId: "a", seat: "Gerbong 3 · Kursi 12B" },
      { tripId: "t", employeeId: "b", seat: "Gerbong 3 · Kursi 13A" }, { tripId: "t", employeeId: "c", seat: "Gerbong 4 · Kursi 12A" }, { tripId: "u", employeeId: "d", seat: "Gerbong 3 · Kursi 12C" },
    ];
    expect([...seatmatesOf("me", seats)]).toEqual(["a"]);
    expect([...seatmatesOf("nobody", seats)]).toEqual([]);
  });

  it("suggests by the rule's relation first, then the rest by name, and searches by name or department", () => {
    const list = [person("zed", { roommate: true }), person("amir"), person("budi", { seatmate: true }), person("wulan", { bod: true, department: "BOD" })];
    expect(suggestionReason(list[0], "sekamar")).toBe("sekamar");
    expect(suggestionReason(list[0], "sebangku")).toBeNull();
    expect(suggestionReason(list[3], "bod")).toBe("bod");
    expect(suggestionReason(list[0], "siapa_saja")).toBeNull();
    expect(orderCandidates(list, "sekamar").suggested.map(candidate => candidate.id)).toEqual(["zed"]);
    expect(orderCandidates(list, "sekamar").others.map(candidate => candidate.id)).toEqual(["amir", "budi", "wulan"]);
    expect(orderCandidates(list, "siapa_saja", "BOD").others.map(candidate => candidate.id)).toEqual(["wulan"]);
    expect(orderCandidates(list, "bod", "xx")).toEqual({ suggested: [], others: [] });
  });
});

describe("the review queue's sample", () => {
  it("shows three proofs waiting, each with the photo, the TNC, the checks and the tags", () => {
    const queue = sampleReviewQueue();
    expect(queue).toHaveLength(3);
    for (const item of queue) {
      expect(item.status).toBe("perlu_ditinjau");
      expect(item.photo).toMatch(/^\/wam\/demo\/foto-\d+\.svg$/);
      expect(item.rules.length).toBeGreaterThan(1);
      expect(item.checks.length).toBe(item.rules.length);
      expect(item.verifier?.provider).toBe("manual");
    }
    expect(queue[0].tags.map(tag => tag.name)).toEqual(["Contoh Arman", "Contoh Wulan"]);
  });
});
