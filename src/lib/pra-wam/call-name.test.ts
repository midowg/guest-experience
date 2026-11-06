import { describe, expect, it } from "vitest";
import { callName, withoutHonorific } from "./call-name";

describe("callName", () => {
  it("shows the nama panggilan, with Pak or Bu only for a senior whose Jenis kelamin is known", () => {
    expect(callName({ fullName: "Contoh Satu Dua", nickname: "Satu", gender: "L" }, false)).toBe("Satu");
    expect(callName({ fullName: "Contoh Satu Dua", nickname: "Satu", gender: "L" }, true)).toBe("Pak Satu");
    expect(callName({ fullName: "Contoh Satu Dua", nickname: "Satu", gender: "P" }, true)).toBe("Bu Satu");
    expect(callName({ fullName: "Contoh Satu Dua", nickname: "Satu", gender: "" }, true)).toBe("Satu");
  });

  it("falls back to the first word of the full name", () => {
    expect(callName({ fullName: "Contoh Satu Dua", nickname: " " }, false)).toBe("Contoh");
    expect(callName({ fullName: "Contoh Satu Dua", nickname: null, gender: "P" }, true)).toBe("Bu Contoh");
  });

  it("drops Pak or Bu for initials", () => {
    expect(withoutHonorific("Pak Satu")).toBe("Satu");
    expect(withoutHonorific("Bu Satu")).toBe("Satu");
    expect(withoutHonorific("Pakuan")).toBe("Pakuan");
  });
});
