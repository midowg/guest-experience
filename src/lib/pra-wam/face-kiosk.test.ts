import { describe, expect, it } from "vitest";
import { pickFace, type KioskScore } from "./face-kiosk";

const person = (employeeId: string, score: number, extra: Partial<KioskScore> = {}): KioskScore => ({ employeeId, score, present: false, consented: true, ...extra });

describe("mode tablet: who the face is", () => {
  it("names one clear match", () => {
    expect(pickFace([person("a", 0.62), person("b", 0.21)])).toEqual({ kind: "cocok", employeeId: "a", score: 0.62 });
  });
  it("knows nobody under perlu cek, or with no faces at all", () => {
    expect(pickFace([person("a", 0.25), person("b", 0.1)])).toEqual({ kind: "tidak-dikenali" });
    expect(pickFace([])).toEqual({ kind: "tidak-dikenali" });
  });
  it("asks panitia when two are close, or the best is only perlu cek", () => {
    expect(pickFace([person("a", 0.45), person("b", 0.41), person("c", 0.1)])).toEqual({ kind: "konfirmasi", candidates: [{ employeeId: "a", score: 0.45 }, { employeeId: "b", score: 0.41 }] });
    expect(pickFace([person("a", 0.33)])).toEqual({ kind: "konfirmasi", candidates: [{ employeeId: "a", score: 0.33 }] });
  });
  it("says who is already in, or has not agreed to face check-in, without asking", () => {
    expect(pickFace([person("a", 0.6, { present: true })])).toMatchObject({ kind: "sudah", employeeId: "a" });
    expect(pickFace([person("a", 0.6, { consented: false })])).toMatchObject({ kind: "belum-setuju", employeeId: "a" });
  });
  it("offers only who may still be recorded in a close call", () => {
    expect(pickFace([person("a", 0.45, { present: true }), person("b", 0.42)])).toEqual({ kind: "konfirmasi", candidates: [{ employeeId: "b", score: 0.42 }] });
    expect(pickFace([person("a", 0.33, { present: true })])).toMatchObject({ kind: "sudah", employeeId: "a" });
  });
});
