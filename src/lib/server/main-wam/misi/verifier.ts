import "server-only";
import type { MissionRule } from "@/lib/main-wam/misi/rules";
import type { VerifierResult } from "@/lib/main-wam/misi/verify";

/*
 * The verifier of a mission photo: the one place an AI will plug in later. It is asked only after the
 * rules the server can check alone (place, tags, hours, tries: rules.ts checkRules) have passed, and it
 * says lolos, gagal or ragu. What is built in is "manual": it always doubts, so every proof waits in the
 * review queue for a person, and it calls no outside service. A provider is chosen by name from the
 * environment (MISI_VERIFIER); nothing but "manual" is registered now, and no key lives in the code. To
 * plug in an AI: write a Verifier, call registerVerifier(it) once at start-up, and set MISI_VERIFIER to
 * its name. A provider that throws or times out never approves or rejects: the answer is "ragu".
 */

/** Everything a verifier may read about one proof. Nothing here is a secret of the person. */
export type VerifierInput = {
  misi: { id: string; title: string; description: string };
  aturan: MissionRule[];
  /** The photo: its storage key and a way to get a short-lived address (null when storage cannot say). */
  foto: { key: string; address: () => Promise<string | null> };
  /** Where the phone said it was, and how far from the mission's point (null: the mission has no place). */
  lokasi: { latitude: number; longitude: number; accuracyM: number; distanceM: number | null } | null;
  tag: { id: string; name: string; department: string; bod: boolean }[];
  /** When the photo was taken (ISO). */
  waktu: string;
};

export type Verifier = { name: string; verify: (input: VerifierInput) => Promise<VerifierResult> };

export const manualVerifier: Verifier = {
  name: "manual",
  verify: async () => ({ putusan: "ragu", alasan: ["Menunggu tinjauan panitia."] }),
};

const providers = new Map<string, Verifier>([[manualVerifier.name, manualVerifier]]);

/** The plug-in point: a provider registers itself under its name. */
export function registerVerifier(verifier: Verifier): void {
  providers.set(verifier.name, verifier);
}

/** The provider the configuration names ("manual" when unset or unknown). */
export function selectedProvider(env: Record<string, string | undefined> = process.env): string {
  const name = (env.MISI_VERIFIER ?? "").trim().toLowerCase();
  return name && providers.has(name) ? name : manualVerifier.name;
}

export const verifierFor = (name = selectedProvider()): Verifier => providers.get(name) ?? manualVerifier;

/** Runs the chosen provider; any failure is a doubt, never a verdict. */
export async function runVerifier(input: VerifierInput, name = selectedProvider()): Promise<{ provider: string; result: VerifierResult }> {
  const verifier = verifierFor(name);
  try {
    const result = await verifier.verify(input);
    const putusan = result?.putusan;
    if (putusan !== "lolos" && putusan !== "gagal" && putusan !== "ragu") throw new Error("verdict");
    return { provider: verifier.name, result: { putusan, alasan: Array.isArray(result.alasan) ? result.alasan.map(String).slice(0, 5) : [], ...(typeof result.skor === "number" ? { skor: result.skor } : {}) } };
  } catch {
    return { provider: verifier.name, result: { putusan: "ragu", alasan: ["Pemeriksa otomatis belum bisa memastikan. Menunggu tinjauan panitia."] } };
  }
}
