import { describe, expect, it } from "vitest";
import { clockOffset, pollDelay, revealJitter } from "./clock";

describe("the server's clock on a phone", () => {
  it("takes the answer with the shortest round trip, read halfway", () => {
    expect(clockOffset([
      { sentAt: 1_000, receivedAt: 1_900, serverNow: 6_000 },
      { sentAt: 3_000, receivedAt: 3_100, serverNow: 8_050 },
    ])).toBe(5_000);
    expect(clockOffset([])).toBe(0);
    expect(clockOffset([{ sentAt: 5, receivedAt: 1, serverNow: 9 }])).toBe(0);
  });
});

describe("how often a screen asks", () => {
  it("asks every 1.5 s while a game is on, slower when nothing moves", () => {
    expect(pollDelay("soal")).toBe(1_500);
    expect(pollDelay("lobi")).toBe(1_500);
    expect(pollDelay("siap")).toBe(4_000);
    expect(pollDelay("selesai")).toBe(15_000);
    expect(pollDelay(null)).toBe(15_000);
    expect(pollDelay("soal", { hidden: true })).toBe(10_000);
  });
  it("backs off when the network fails", () => {
    expect(pollDelay("soal", { failures: 1 })).toBe(2_500);
    expect(pollDelay("soal", { failures: 3 })).toBe(10_000);
    expect(pollDelay("soal", { failures: 9 })).toBe(20_000);
  });
  it("spreads the phones over 120–420 ms when the answer opens", () => {
    expect(revealJitter(() => 0)).toBe(120);
    expect(revealJitter(() => 0.999)).toBe(419);
  });
});
