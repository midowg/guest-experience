import { describe, expect, it } from "vitest";
import { cosine, EMBEDDING_SIZE, FACE_MATCH } from "@/lib/hr/face-match";
import {
  addToFaceQueue, faceProblem, FACE_QUEUE_MAX, matchFace, matchFaces, matchSpots, pushRecent, readFaceQueue, recall, spotOf, tabletRequestSchema,
  TABLET_FACE_STATUSES, TABLET_MATCH, windowOf, type GalleryEntry, type QueuedFace,
} from "./face-tablet";

/** Unit vector number `i` of the standard basis. */
const unit = (i: number) => Array.from({ length: EMBEDDING_SIZE }, (_, j) => (j === i ? 1 : 0));
/** A unit vector whose cosine with `unit(0)` is exactly `c` (the rest along axis `axis`). */
const at = (c: number, axis = 1) => Array.from({ length: EMBEDDING_SIZE }, (_, j) => (j === 0 ? c : j === axis ? Math.sqrt(1 - c * c) : 0));
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const person = (n: number, embedding: number[]): GalleryEntry => ({ employeeId: ID(n), embedding });

describe("the rule's numbers", () => {
  it("are stricter than WG People's one-to-one check (cocok 0,363)", () => {
    expect(TABLET_MATCH.min).toBeGreaterThan(FACE_MATCH.cocok);
    expect(TABLET_MATCH.margin).toBeGreaterThan(0);
  });
  it("compare only a face profile that is in use", () => {
    expect([...TABLET_FACE_STATUSES]).toEqual(["aktif"]);
  });
  it("the synthetic vectors really have the cosine the tests ask for", () => {
    expect(cosine(unit(0), at(0.5))).toBeCloseTo(0.5, 10);
  });
});

describe("matchFace (one face against the event's enrolled faces)", () => {
  const me = unit(0);

  it("names the person whose score reaches the minimum and who nobody else is close to", () => {
    const verdict = matchFace(me, [person(1, at(0.7)), person(2, at(0.2, 2)), person(3, unit(5))]);
    expect(verdict).toMatchObject({ kind: "dikenali", employeeId: ID(1) });
    expect((verdict as { score: number }).score).toBeCloseTo(0.7, 6);
  });

  it("does not name anyone below the minimum, even the best one (0,44 against 0,45)", () => {
    expect(matchFace(me, [person(1, at(TABLET_MATCH.min - 0.01))]).kind).toBe("tidak-dikenali");
  });

  it("names someone exactly at the minimum", () => {
    expect(matchFace(me, [person(1, at(TABLET_MATCH.min))]).kind).toBe("dikenali");
  });

  it("is not sure when the runner-up is within the margin (two people who look alike): never a name", () => {
    const close = matchFace(me, [person(1, at(0.7)), person(2, at(0.7 - TABLET_MATCH.margin + 0.01, 2))]);
    expect(close).toEqual({ kind: "ragu" });
  });

  it("names the best one when the runner-up is a margin behind", () => {
    const verdict = matchFace(me, [person(1, at(0.7)), person(2, at(0.7 - TABLET_MATCH.margin - 0.01, 2))]);
    expect(verdict).toMatchObject({ kind: "dikenali", employeeId: ID(1) });
  });

  it("is a stranger against an empty gallery, and ignores entries of another size", () => {
    expect(matchFace(me, []).kind).toBe("tidak-dikenali");
    expect(matchFace(me, [{ employeeId: ID(1), embedding: [1, 0, 0] }]).kind).toBe("tidak-dikenali");
  });

  it("does not depend on the order of the gallery", () => {
    const gallery = [person(1, at(0.6)), person(2, at(0.9, 2)), person(3, at(0.3, 3))];
    expect(matchFace(me, gallery)).toMatchObject({ employeeId: ID(2) });
    expect(matchFace(me, [...gallery].reverse())).toMatchObject({ employeeId: ID(2) });
  });
});

describe("matchFaces (all the faces of one picture)", () => {
  it("gives each face its own person", () => {
    const gallery = [person(1, unit(0)), person(2, unit(1)), person(3, unit(2))];
    const verdicts = matchFaces([unit(1), unit(0), unit(9)], gallery);
    expect(verdicts.map(verdict => verdict.kind)).toEqual(["dikenali", "dikenali", "tidak-dikenali"]);
    expect(verdicts.map(verdict => ("employeeId" in verdict ? verdict.employeeId : null))).toEqual([ID(2), ID(1), null]);
  });

  it("never records one person twice: of two faces that are both the same person, the better one keeps the name", () => {
    const gallery = [person(1, unit(0)), person(2, unit(3))];
    const verdicts = matchFaces([at(0.6), at(0.95), unit(3)], gallery);
    expect(verdicts[0]).toEqual({ kind: "ragu" });
    expect(verdicts[1]).toMatchObject({ kind: "dikenali", employeeId: ID(1) });
    expect(verdicts[2]).toMatchObject({ kind: "dikenali", employeeId: ID(2) });
  });

  it("an empty picture and an empty gallery are fine", () => {
    expect(matchFaces([], [person(1, unit(0))])).toEqual([]);
    expect(matchFaces([unit(0)], []).map(verdict => verdict.kind)).toEqual(["tidak-dikenali"]);
  });
});

describe("the request", () => {
  const face = { embedding: unit(0) };
  const ok = { sessionId: ID(7), faces: [face] };
  it("takes one to six faces of the right size, and nothing else", () => {
    expect(tabletRequestSchema.safeParse(ok).success).toBe(true);
    expect(tabletRequestSchema.safeParse({ ...ok, faces: [] }).success).toBe(false);
    expect(tabletRequestSchema.safeParse({ ...ok, faces: Array(7).fill(face) }).success).toBe(false);
    expect(tabletRequestSchema.safeParse({ ...ok, faces: [{ embedding: [1, 0] }] }).success).toBe(false);
    expect(tabletRequestSchema.safeParse({ ...ok, image: "data:image/png;base64,AAAA" }).success).toBe(false);
    expect(tabletRequestSchema.safeParse({ ...ok, faces: [{ ...face, photo: "x" }] }).success).toBe(false);
    expect(tabletRequestSchema.safeParse({ ...ok, sessionId: "abc" }).success).toBe(false);
  });
  it("refuses numbers that are not a face's (not a unit vector, or out of range)", () => {
    expect(tabletRequestSchema.safeParse({ ...ok, faces: [{ embedding: Array(EMBEDDING_SIZE).fill(0) }] }).success).toBe(false);
    expect(tabletRequestSchema.safeParse({ ...ok, faces: [{ embedding: Array(EMBEDDING_SIZE).fill(1) }] }).success).toBe(false);
  });
  it("takes a time only as an ISO instant", () => {
    expect(tabletRequestSchema.safeParse({ ...ok, faces: [{ ...face, seenAt: "2027-01-05T08:00:00+07:00" }] }).success).toBe(true);
    expect(tabletRequestSchema.safeParse({ ...ok, faces: [{ ...face, seenAt: "tadi" }] }).success).toBe(false);
  });
});

describe("window and quality", () => {
  const session = { opens: "2027-01-05T00:30:00.000Z", closes: "2027-01-05T05:30:00.000Z" };
  it("says belum, buka, tutup around the window (both ends count as open)", () => {
    expect(windowOf(session, new Date("2027-01-05T00:29:59Z"))).toBe("belum");
    expect(windowOf(session, new Date(session.opens))).toBe("buka");
    expect(windowOf(session, new Date(session.closes))).toBe("buka");
    expect(windowOf(session, new Date("2027-01-05T05:30:01Z"))).toBe("tutup");
  });

  const quality = { minEyePx: 28, maxYaw: 30 };
  it("a face too far or turned away is not read, with the reason", () => {
    expect(faceProblem({ closeness: 0.03, signal: { yaw: 0 } }, 720, quality)).toBe("dekat");
    expect(faceProblem({ closeness: 0.1, signal: { yaw: 45 } }, 720, quality)).toBe("hadap");
    expect(faceProblem({ closeness: 0.1, signal: { yaw: -45 } }, 720, quality)).toBe("hadap");
    expect(faceProblem({ closeness: 0.1, signal: null }, 720, quality)).toBe("hadap");
    expect(faceProblem({ closeness: 0.1, signal: { yaw: 10 } }, 720, quality)).toBeNull();
  });
});

describe("following faces from frame to frame", () => {
  const box = (x: number, y: number, size = 0.1) => spotOf({ x, y, width: size, height: size });
  it("gives each look its nearest box, each box once", () => {
    const tracks = [box(0.1, 0.1), box(0.6, 0.1)];
    expect(matchSpots(tracks, [box(0.61, 0.11), box(0.11, 0.1)])).toEqual([1, 0]);
  });
  it("a face far from every box, or a very different size, is a new one", () => {
    expect(matchSpots([box(0.1, 0.1)], [box(0.7, 0.7)])).toEqual([-1]);
    expect(matchSpots([box(0.1, 0.1, 0.1)], [box(0.1, 0.1, 0.3)])).toEqual([-1]);
  });
  it("two looks cannot take the same box", () => {
    expect(matchSpots([box(0.3, 0.3)], [box(0.3, 0.3), box(0.32, 0.3)]).filter(index => index === 0)).toHaveLength(1);
  });
});

describe("cool-down: someone just answered is not sent again", () => {
  const list = [{ embedding: unit(0), until: 1000, value: "Sari" }];
  it("a face close to the remembered numbers takes the remembered answer", () => {
    expect(recall(list, at(0.9), 500)?.value).toBe("Sari");
  });
  it("not after it expired, and not for a different face", () => {
    expect(recall(list, at(0.9), 1000)).toBeNull();
    expect(recall(list, at(0.3), 500)).toBeNull();
  });
  it("takes the closest of several", () => {
    const two = [{ embedding: at(0.6, 4), until: 9, value: "a" }, { embedding: unit(0), until: 9, value: "b" }];
    expect(recall(two, unit(0), 1)?.value).toBe("b");
  });
});

describe("Baru saja", () => {
  const entry = (key: string, at = "2027-01-05T01:00:00Z", queued = false) => ({ key, name: key, role: null, at, queued, photo: null });
  it("puts the newest first, one entry per person, at most twelve", () => {
    let list = pushRecent([], entry("a"));
    list = pushRecent(list, entry("b"));
    list = pushRecent(list, entry("a", "2027-01-05T01:05:00Z"));
    expect(list.map(item => item.key)).toEqual(["a", "b"]);
    for (let i = 0; i < 20; i += 1) list = pushRecent(list, entry(`p${i}`));
    expect(list).toHaveLength(12);
  });
});

describe("the offline queue", () => {
  const now = new Date("2027-01-05T02:00:00Z");
  const face = (seenAt: string): QueuedFace => ({ sessionId: ID(1), embedding: unit(0), seenAt });
  it("reads what was stored, dropping broken entries and anything older than 30 minutes", () => {
    const raw = JSON.stringify([face("2027-01-05T01:45:00Z"), face("2027-01-05T01:20:00Z"), { sessionId: "x" }, 7]);
    expect(readFaceQueue(raw, now)).toEqual([face("2027-01-05T01:45:00Z")]);
  });
  it("reads nothing from nothing or from garbage", () => {
    expect(readFaceQueue(null, now)).toEqual([]);
    expect(readFaceQueue("{", now)).toEqual([]);
    expect(readFaceQueue("{}", now)).toEqual([]);
  });
  it("keeps the newest forty", () => {
    let queue: QueuedFace[] = [];
    for (let i = 0; i < FACE_QUEUE_MAX + 5; i += 1) queue = addToFaceQueue(queue, face(`2027-01-05T01:${String(30 + (i % 29)).padStart(2, "0")}:00Z`));
    expect(queue).toHaveLength(FACE_QUEUE_MAX);
  });
});
