import { describe, expect, it } from "vitest";
import { distanceLabel, distanceMeters, impossibleJump, locationVerdict, mapsLink, MAX_ACCURACY_M, nearestOffice, parseLatLng } from "./geo";

// Made-up office points (not real addresses).
const kantorA = { id: "a", name: "Kantor Contoh A", lat: -7.8, lng: 110.4, radiusM: 100 };
const kantorB = { id: "b", name: "Kantor Contoh B", lat: -8.65, lng: 115.2, radiusM: 150 };

describe("distance", () => {
  it("is zero at the same point and symmetric", () => {
    expect(distanceMeters(kantorA, kantorA)).toBe(0);
    expect(distanceMeters(kantorA, kantorB)).toBeCloseTo(distanceMeters(kantorB, kantorA), 6);
  });
  it("is about 111 m per 0.001° of latitude", () => {
    expect(distanceMeters({ lat: -7.8, lng: 110.4 }, { lat: -7.801, lng: 110.4 })).toBeCloseTo(111.2, 0);
  });
  it("finds the closest office", () => {
    expect(nearestOffice({ lat: -7.801, lng: 110.4 }, [kantorB, kantorA])?.office.id).toBe("a");
    expect(nearestOffice({ lat: -7.8, lng: 110.4 }, [])).toBeNull();
  });
});

describe("inside or outside", () => {
  it("is inside within the radius with a sure reading", () => {
    const verdict = locationVerdict({ lat: -7.8005, lng: 110.4, accuracyM: 20 }, [kantorA, kantorB]);
    expect(verdict.kind).toBe("di_dalam");
    if (verdict.kind === "di_dalam") expect(Math.round(verdict.distanceM)).toBe(56);
  });
  it("is outside beyond the radius", () => {
    const verdict = locationVerdict({ lat: -7.802, lng: 110.4, accuracyM: 10 }, [kantorA]);
    expect(verdict).toMatchObject({ kind: "di_luar", why: "jauh" });
  });
  it("does not trust a reading less sure than the limit", () => {
    expect(locationVerdict({ lat: -7.8, lng: 110.4, accuracyM: MAX_ACCURACY_M + 1 }, [kantorA])).toMatchObject({ kind: "di_luar", why: "tidak_akurat" });
    expect(locationVerdict({ lat: -7.8, lng: 110.4, accuracyM: Number.NaN }, [kantorA])).toMatchObject({ kind: "di_luar", why: "tidak_akurat" });
  });
  it("is outside when there is no office point yet", () => {
    expect(locationVerdict({ lat: 0, lng: 0, accuracyM: 5 }, [])).toEqual({ kind: "di_luar", nearest: null, why: "tanpa_kantor" });
  });
});

describe("labels and input", () => {
  it("writes metres and kilometres the Indonesian way", () => {
    expect(distanceLabel(35.4)).toBe("35 m");
    expect(distanceLabel(2340)).toBe("2,3 km");
    expect(distanceLabel(123_456)).toBe("123 km");
  });
  it("reads a pasted pair or a Google Maps link", () => {
    expect(parseLatLng("-7.7828, 110.3671")).toEqual({ lat: -7.7828, lng: 110.3671 });
    expect(parseLatLng("-7.7828,110.3671")).toEqual({ lat: -7.7828, lng: 110.3671 });
    expect(parseLatLng("https://www.google.com/maps/place/X/@-7.7828,110.3671,17z")).toEqual({ lat: -7.7828, lng: 110.3671 });
    expect(parseLatLng("https://maps.google.com/?q=-8.65,115.2")).toEqual({ lat: -8.65, lng: 115.2 });
    expect(parseLatLng("Kantor")).toBeNull();
    expect(parseLatLng("95, 10")).toBeNull();
  });
  it("links to the point", () => {
    expect(mapsLink(kantorA)).toBe("https://www.google.com/maps/search/?api=1&query=-7.8,110.4");
  });
});

describe("impossible jumps", () => {
  it("flags hundreds of kilometres in minutes, not a short walk", () => {
    expect(impossibleJump({ ...kantorA, at: "2026-11-20T01:00:00Z" }, { ...kantorB, at: "2026-11-20T01:30:00Z" })).toBe(true);
    expect(impossibleJump({ ...kantorA, at: "2026-11-20T01:00:00Z" }, { ...kantorB, at: "2026-11-20T09:00:00Z" })).toBe(false);
    expect(impossibleJump({ ...kantorA, at: "2026-11-20T01:00:00Z" }, { lat: -7.801, lng: 110.4, at: "2026-11-20T01:00:00Z" })).toBe(false);
  });
});
