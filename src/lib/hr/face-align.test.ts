import { describe, expect, it } from "vitest";
import {
  applySimilarity, canvasMatrix, eyeDistance, laplacianVariance, MESH, points5FromMesh, SFACE_TEMPLATE, similarityTransform, toTensorData, yawFromMesh, type Landmark, type Point,
} from "./face-align";

/** A mesh with only the points face-align reads, the rest at the centre. */
function mesh(points: Partial<Record<keyof typeof MESH, Landmark>>): Landmark[] {
  const all = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  for (const [name, point] of Object.entries(points)) all[MESH[name as keyof typeof MESH]] = point!;
  return all;
}
const front = { rightEyeOuter: { x: 0.35, y: 0.4 }, leftEyeOuter: { x: 0.65, y: 0.4 }, noseTip: { x: 0.5, y: 0.55 } };

describe("alignment", () => {
  it("leaves the template where it is", () => {
    const t = similarityTransform(SFACE_TEMPLATE);
    expect(t.a).toBeCloseTo(1, 10);
    expect(t.b).toBeCloseTo(0, 10);
    expect(t.tx).toBeCloseTo(0, 8);
    expect(t.ty).toBeCloseTo(0, 8);
  });
  it("undoes a turn, a scale and a move", () => {
    const angle = 0.3, scale = 2.5;
    const moved = SFACE_TEMPLATE.map(([x, y]) => [scale * (Math.cos(angle) * x - Math.sin(angle) * y) + 40, scale * (Math.sin(angle) * x + Math.cos(angle) * y) - 15] as Point);
    const t = similarityTransform(moved);
    moved.forEach((point, i) => {
      const [x, y] = applySimilarity(t, point);
      expect(x).toBeCloseTo(SFACE_TEMPLATE[i][0], 6);
      expect(y).toBeCloseTo(SFACE_TEMPLATE[i][1], 6);
    });
    expect(canvasMatrix(t)).toEqual([t.a, t.b, -t.b, t.a, t.tx, t.ty]);
  });
  it("refuses points that cannot be aligned", () => {
    expect(() => similarityTransform([[1, 1], [1, 1]], [[0, 0], [1, 1]])).toThrow();
    expect(() => similarityTransform([[1, 1]], [[0, 0]])).toThrow();
  });
  it("reads the five points in pixels, eyes from their corners", () => {
    const points = points5FromMesh(mesh({ rightEyeOuter: { x: 0.3, y: 0.4 }, rightEyeInner: { x: 0.4, y: 0.4 }, leftEyeInner: { x: 0.6, y: 0.4 }, leftEyeOuter: { x: 0.7, y: 0.4 } }), 1000, 500);
    expect(points[0][0]).toBeCloseTo(350, 6);
    expect(points[1][0]).toBeCloseTo(650, 6);
    expect(points[1][1]).toBeCloseTo(200, 6);
    expect(eyeDistance(points)).toBeCloseTo(300, 6);
  });
});

describe("head turn", () => {
  it("is about zero facing the camera", () => {
    expect(Math.abs(yawFromMesh(mesh(front)))).toBeLessThan(1);
  });
  it("is positive turned to the person's own right (nose to the picture's left)", () => {
    expect(yawFromMesh(mesh({ ...front, noseTip: { x: 0.42, y: 0.55 } }))).toBeGreaterThan(20);
    expect(yawFromMesh(mesh({ ...front, noseTip: { x: 0.58, y: 0.55 } }))).toBeLessThan(-20);
  });
});

describe("pixels", () => {
  it("puts R, G and B in their own planes", () => {
    const rgba = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    expect(Array.from(toTensorData(rgba, 2, 1))).toEqual([10, 40, 20, 50, 30, 60]);
  });
  it("scores a flat picture 0 and a sharp pattern high", () => {
    const flat = new Uint8ClampedArray(10 * 10 * 4).fill(128);
    expect(laplacianVariance(flat, 10, 10)).toBe(0);
    const checker = new Uint8ClampedArray(10 * 10 * 4);
    for (let i = 0; i < 100; i += 1) { const on = ((i % 10) + Math.floor(i / 10)) % 2 ? 255 : 0; checker.set([on, on, on, 255], i * 4); }
    expect(laplacianVariance(checker, 10, 10)).toBeGreaterThan(1000);
  });
});
