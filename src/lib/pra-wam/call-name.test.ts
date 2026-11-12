import { describe, expect, it } from "vitest";
import { callName, withoutHonorific } from "./call-name";

describe("callName", () => {
  it("shows the nama panggilan, without Pak or Bu for anyone", () => {
    expect(callName({ fullName: "Contoh Satu Dua", nickname: "Satu" })).toBe("Satu");
    expect(callName({ fullName: "Contoh Satu Dua", nickname: " Satu " })).toBe("Satu");
  });

  it("falls back to the first word of the full name", () => {
    expect(callName({ fullName: "Contoh Satu Dua", nickname: " " })).toBe("Contoh");
    expect(callName({ fullName: "Contoh Satu Dua", nickname: null })).toBe("Contoh");
  });

  it("drops Pak or Bu for initials", () => {
    expect(withoutHonorific("Pak Satu")).toBe("Satu");
    expect(withoutHonorific("Bu Satu")).toBe("Satu");
    expect(withoutHonorific("Pakuan")).toBe("Pakuan");
  });
});
