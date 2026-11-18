import "server-only";
import { cookies } from "next/headers";
import { demoSample, demoViewerPart } from "@/lib/main-wam/demo-sample";
import { DEMO_ROLE_COOKIE, parseDemoRole } from "@/lib/main-wam/demo";
import type { DemoRole, MainWamViewer, ViewerRoom } from "@/lib/main-wam/types";
import { readMainWamSettings } from "./settings";

/*
 * Mode demo on the server (docs/main-wam/KONTRAK.md §12): the role this device picked, whether the demo is
 * on, and the sample every reader falls back to. A reader asks `demoOn()` only after its own table came
 * back empty, so a real event pays nothing for it. Nothing here runs unless Admin switched the demo on.
 */

/** The role this device picked ("Lihat sebagai"); null without a request (tests) or a choice. */
export async function readDemoRole(): Promise<DemoRole | null> {
  try { return parseDemoRole((await cookies()).get(DEMO_ROLE_COOKIE)?.value); } catch { return null; }
}

/** Is Mode demo on (Admin WAM → Main WAM → Pengaturan)? Once per request where `cache()` works. */
export async function demoOn(): Promise<boolean> {
  try { return (await readMainWamSettings()).moduleConfig.demo; } catch { return false; }
}

/** Mode demo is on and the real rundown is empty: the sample rundown, and what hangs on it (kehadiran, kelompok kegiatan, perjalanan), stands in. */
export async function demoRundown(): Promise<boolean> {
  try { const settings = await readMainWamSettings(); return settings.moduleConfig.demo && settings.sampleRundown; } catch { return false; }
}

/** The real answer, or the sample when it is empty and Mode demo is on (`now` moves the sample to today). */
export async function orSample<T>(real: T, empty: (value: T) => boolean, sample: () => T): Promise<T> {
  if (!empty(real) || !(await demoOn())) return real;
  return demoSample(sample());
}

/** A sample group and room for a viewer who has none (Kelompok & kamar), the viewer's own name on their line. */
export function demoPlaceFor(viewer: Pick<MainWamViewer, "name" | "demo" | "roles">): { group: MainWamViewer["group"]; room: ViewerRoom | null } {
  const part = demoViewerPart(viewer.demo?.role ?? "peserta");
  return { group: part.group, room: part.room ? { ...part.room, people: part.room.people.map(person => (person.me ? { ...person, name: viewer.name } : person)) } : null };
}
