import { describe, expect, it } from "vitest";
import { homeGreeting } from "./greeting";

/* The head's day line with the role (T-K03, K01: "Hari ke-2 dari 4 · Panitia"). */

const event = { startDate: "2027-01-04", endDate: "2027-01-07" };
const at = (text: string) => new Date(`${text}+07:00`);

describe("homeGreeting with a role", () => {
  it("panitia read their role after the day (and after Berangkat/Pulang)", () => {
    expect(homeGreeting(at("2027-01-05T07:40:00"), "Dimas", event, "panitia").day).toBe("Hari ke-2 dari 4 · Panitia");
    expect(homeGreeting(at("2027-01-04T05:05:00"), "Dimas", event, "panitia").day).toBe("Hari ke-1 dari 4 · Berangkat · Panitia");
    expect(homeGreeting(at("2027-01-07T09:00:00"), "Dimas", event, "panitia").day).toBe("Hari ke-4 dari 4 · Pulang · Panitia");
  });

  it("BOD, admin and peserta: no marker", () => {
    for (const role of ["bod", "admin", "peserta", undefined] as const) {
      expect(homeGreeting(at("2027-01-05T07:40:00"), "Rani", event, role).day).toBe("Hari ke-2 dari 4");
    }
  });

  it("outside the event days there is no day line, for panitia too", () => {
    expect(homeGreeting(at("2026-12-01T07:40:00"), "Dimas", event, "panitia")).toEqual({ kicker: "Selamat pagi · Sel, 1 Des", name: "Dimas" });
  });
});
