import { describe, expect, it } from "vitest";
import { average, cosine, EMBEDDING_SIZE, FACE_MATCH, faceVerdict, isEmbedding, normalize, sameFace, scoreLabel } from "./face-match";

/** A made-up embedding: a direction with some noise. */
function vector(seed: number, noise = 0, base?: number[]): number[] {
  let state = seed;
  const random = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648 - 0.5; };
  return Array.from({ length: EMBEDDING_SIZE }, (_, i) => (base ? base[i] : random()) + noise * random());
}

describe("vectors", () => {
  it("normalizes to length 1 and keeps a zero vector zero", () => {
    expect(Math.hypot(...normalize([3, 4]))).toBeCloseTo(1, 10);
    expect(normalize([0, 0])).toEqual([0, 0]);
  });
  it("scores 1 for the same direction, -1 for the opposite, 0 for a zero vector", () => {
    const a = vector(1);
    expect(cosine(a, a.map(item => item * 5))).toBeCloseTo(1, 10);
    expect(cosine(a, a.map(item => -item))).toBeCloseTo(-1, 10);
    expect(cosine(a, a.map(() => 0))).toBe(0);
  });
  it("refuses embeddings of different sizes", () => {
    expect(() => cosine([1, 2], [1, 2, 3])).toThrow();
    expect(() => average([[1, 2], [1]])).toThrow();
  });
  it("averages to a unit vector close to every frame", () => {
    const base = vector(7);
    const frames = [1, 2, 3].map(seed => vector(seed, 0.2, base));
    const mean = average(frames);
    expect(Math.hypot(...mean)).toBeCloseTo(1, 10);
    for (const frame of frames) expect(cosine(mean, frame)).toBeGreaterThan(0.9);
  });
  it("knows an embedding", () => {
    expect(isEmbedding(vector(1))).toBe(true);
    expect(isEmbedding([1, 2, 3])).toBe(false);
    expect(isEmbedding(vector(1).map((item, i) => (i === 0 ? Number.NaN : item)))).toBe(false);
  });
});

describe("verdict", () => {
  it("is cocok at the threshold, perlu_cek in the band, tidak_cocok below", () => {
    expect(faceVerdict(FACE_MATCH.cocok)).toBe("cocok");
    expect(faceVerdict(FACE_MATCH.cocok - 0.01)).toBe("perlu_cek");
    expect(faceVerdict(FACE_MATCH.perluCek)).toBe("perlu_cek");
    expect(faceVerdict(FACE_MATCH.perluCek - 0.01)).toBe("tidak_cocok");
  });
  it("sees one face across frames, not a swap halfway", () => {
    const one = vector(11);
    const other = vector(99);
    expect(sameFace([vector(1, 0.1, one), vector(2, 0.1, one), vector(3, 0.1, one)])).toBe(true);
    expect(sameFace([vector(1, 0.1, one), vector(2, 0.1, one), other])).toBe(false);
  });
  it("labels scores with a comma", () => {
    expect(scoreLabel(0.4234)).toBe("0,42");
  });
});
