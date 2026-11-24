import { describe, expect, it, vi } from "vitest";
import { manualVerifier, registerVerifier, runVerifier, selectedProvider, verifierFor, type VerifierInput } from "./verifier";

/*
 * The verifier's plug-in point: "manual" is built in and always doubts (every proof waits for a person, no
 * outside service is called); a provider is chosen by name from the configuration; a provider that breaks
 * or answers nonsense is a doubt, never a verdict.
 */

const input: VerifierInput = {
  misi: { id: "m", title: "Foto plank", description: "" }, aturan: [{ type: "foto_langsung" }], foto: { key: "main-wam/misi/x.jpg", address: async () => null },
  lokasi: { latitude: -7.88, longitude: 112.52, accuracyM: 12, distanceM: 20 }, tag: [], waktu: "2027-01-05T10:00:00+07:00",
};

describe("the verifier", () => {
  it("is manual by default: always 'ragu', so the proof goes to the review queue", async () => {
    expect(selectedProvider({})).toBe("manual");
    expect(await manualVerifier.verify(input)).toEqual({ putusan: "ragu", alasan: ["Menunggu tinjauan panitia."] });
    expect(await runVerifier(input, "manual")).toEqual({ provider: "manual", result: { putusan: "ragu", alasan: ["Menunggu tinjauan panitia."] } });
  });

  it("picks a provider by name from the configuration; unknown or empty names stay manual", () => {
    registerVerifier({ name: "uji-ai", verify: async () => ({ putusan: "lolos", alasan: [], skor: 0.93 }) });
    expect(selectedProvider({ MISI_VERIFIER: "uji-ai" })).toBe("uji-ai");
    expect(selectedProvider({ MISI_VERIFIER: " UJI-AI " })).toBe("uji-ai");
    expect(selectedProvider({ MISI_VERIFIER: "tidak-ada" })).toBe("manual");
    expect(selectedProvider({ MISI_VERIFIER: "" })).toBe("manual");
    expect(verifierFor("tidak-ada").name).toBe("manual");
  });

  it("hands the provider the whole input and keeps its verdict, reasons and score", async () => {
    const seen = vi.fn(async (given: VerifierInput) => { void given; return { putusan: "gagal" as const, alasan: ["Bukan plank."], skor: 0.12 }; });
    registerVerifier({ name: "uji-lihat", verify: seen });
    expect(await runVerifier(input, "uji-lihat")).toEqual({ provider: "uji-lihat", result: { putusan: "gagal", alasan: ["Bukan plank."], skor: 0.12 } });
    expect(seen).toHaveBeenCalledWith(input);
  });

  it("doubts when a provider throws or answers nonsense", async () => {
    registerVerifier({ name: "uji-mati", verify: async () => { throw new Error("timeout"); } });
    registerVerifier({ name: "uji-aneh", verify: async () => ({ putusan: "mungkin" }) as never });
    for (const name of ["uji-mati", "uji-aneh"]) {
      const answer = await runVerifier(input, name);
      expect(answer.provider).toBe(name);
      expect(answer.result.putusan).toBe("ragu");
      expect(answer.result.alasan.length).toBeGreaterThan(0);
    }
  });

  it("keeps no key or address of an outside service in the code (nothing but the built-in provider is registered at start)", () => {
    expect(verifierFor("manual")).toBe(manualVerifier);
  });
});
