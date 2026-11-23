import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { DEMO_WRITE_MESSAGE, isSimulated } from "@/lib/main-wam/demo";
import { mainWamGate, moduleAllows, opensMainWamHome, type MainWamAction } from "@/lib/main-wam/access";
import type { MainWamModule, MainWamSettings, MainWamViewer } from "@/lib/main-wam/types";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import { mainWamPath, praWamPath } from "@/lib/routes";
import { ServiceError } from "../config";
import { getMainWamVisibility } from "../main-wam-visibility";
import { currentMember } from "../pra-wam/session";
import { demoPlaceFor } from "./demo";
import { readMainWamSettings } from "./settings";
import { mainWamViewer, testsMainWam, viewerRoom } from "./viewer";

/*
 * The gate of Main WAM (docs/main-wam/KONTRAK.md §3). Every Main WAM page calls requireMainWamPage
 * and every API requireMainWamApi, close to the data (Next.js: a layout's check does not re-run on
 * navigation, so it is never the only one). The layout calls it too, so no frame is drawn for
 * someone it is not for. A module that is off: its pages are not found, its APIs answer 404.
 */

export type MainWamContext = { viewer: MainWamViewer; settings: MainWamSettings };

const notThere = () => new ServiceError(404, "Halaman tidak ditemukan.");

/** Saya and the screens under it (Kelompok & kamar, Perjalanan) show the room; nothing else reads it (audit S5). */
const showsRoom = (here: string) => here === mainWamPath.me || here.startsWith(`${mainWamPath.me}/`) || here.startsWith(`${mainWamPath.me}?`);

/**
 * For pages: the person and the settings, or the sign-in page (coming back here), or not found.
 * The viewer's room is filled on Saya and below only (null elsewhere).
 */
export async function requireMainWamPage(here: string): Promise<MainWamContext> {
  const read = readMainWamSettings();
  const [settings, viewer] = await Promise.all([read, mainWamViewer(read)]);
  const gate = mainWamGate(settings.mode, viewer);
  if (gate.kind === "login") redirect(gate.page === "main" ? mainWamPath.login(here) : praWamPath.login(here));
  if (gate.kind === "tutup" || !viewer) notFound();
  if (!showsRoom(here)) return { viewer, settings };
  const room = await viewerRoom(viewer.id);
  // Mode demo: a sample room while HR's pairing is not there.
  return { viewer: { ...viewer, room: room ?? (viewer.demo ? demoPlaceFor(viewer).room : null) }, settings };
}

/**
 * Mode demo: someone drawn as a role their account is not (the "Lihat sebagai" switch) only reads, and so does
 * everyone while the sample rundown stands in. A write
 * (every write carries the site's Origin: checkOrigin refuses one without; a same-origin read does not) is
 * answered with a friendly refusal before anything is saved. Without the demo (`viewer.demo` unset) it does nothing.
 */
async function refuseDemoWrite(viewer: MainWamViewer, settings: MainWamSettings): Promise<void> {
  // Also while the sample rundown stands in (demo and nothing real yet): every id on screen is a sample's, so nothing can be saved.
  if (!isSimulated(viewer) && !settings.sampleRundown) return;
  let origin: string | null = null;
  try { origin = (await headers()).get("origin"); } catch { /* no request */ }
  if (origin) throw new ServiceError(403, DEMO_WRITE_MESSAGE);
}

/**
 * Whether this request may see anything of Main WAM (its theme, KV, frame, loading screens; audit
 * M6): in mode semua everyone (the sign-in page too), otherwise a signed-in penguji only. Never
 * throws: false on any failure, so Main WAM stays hidden.
 */
export async function mainWamShown(): Promise<boolean> {
  try {
    const read = readMainWamSettings();
    const [settings, viewer] = await Promise.all([read, mainWamViewer(read)]);
    const gate = mainWamGate(settings.mode, viewer);
    return gate.kind === "masuk" || (gate.kind === "login" && gate.page === "main");
  } catch { return false; }
}

/** For APIs: 401 without a session, 404 when Main WAM is not on for the person. */
export async function requireMainWamApi(): Promise<MainWamContext> {
  if (!praWamSecret()) throw new ServiceError(503, "Login WAM belum disiapkan. Isi WAM_SESSION_SECRET (acak, minimal 32 karakter) pada server.");
  const read = readMainWamSettings();
  const [settings, viewer] = await Promise.all([read, mainWamViewer(read)]);
  const gate = mainWamGate(settings.mode, viewer);
  if (gate.kind === "login") throw new ServiceError(401, "Sesi berakhir. Masuk kembali sebelum melanjutkan.");
  if (gate.kind === "tutup" || !viewer) throw notThere();
  await refuseDemoWrite(viewer, settings);
  return { viewer, settings };
}

/** A module's page: not found while the module is off. */
export async function requireModulePage(module: MainWamModule, here: string): Promise<MainWamContext> {
  const context = await requireMainWamPage(here);
  if (!context.settings.modules[module]) notFound();
  return context;
}

/** A module's API: 404 while the module is off (no trace of it). */
export async function requireModuleApi(module: MainWamModule): Promise<MainWamContext> {
  const context = await requireMainWamApi();
  if (!context.settings.modules[module]) throw notThere();
  return context;
}

/** An action's page (panitia tools, a module's action): not found for anyone it is not for. */
export async function requireActionPage(action: MainWamAction, here: string): Promise<MainWamContext> {
  const context = await requireMainWamPage(here);
  if (!moduleAllows(context.viewer, action, context.settings.modules)) notFound();
  return context;
}

/**
 * An action's API: 404 for anyone it is not for, a role that may not as well as a module that is off
 * (KONTRAK §9 #4: one answer for "not for you", so nobody learns that a BOD or panitia endpoint exists).
 */
export async function requireActionApi(action: MainWamAction): Promise<MainWamContext> {
  const context = await requireMainWamApi();
  if (!moduleAllows(context.viewer, action, context.settings.modules)) throw notThere();
  return context;
}
/**
 * Pra WAM's Beranda (/wam) sends the person on to Main WAM when it is on for them: mode semua for
 * everyone (signed in or not), mode uji for a penguji. `versi=pra` (praWamPath.homePra) stays on
 * Pra WAM. Never while Main WAM is hidden from Journey (until the super admin shows it,
 * src/lib/main-wam-visibility.ts): then /wam is Pra WAM whatever the mode, and Main WAM opens only by its
 * own address. Never throws: on any failure Pra WAM shows as before.
 */
export async function mainWamHomeTarget(search: { versi?: string | string[] }): Promise<string | null> {
  if (search.versi === "pra") return null;
  try {
    if (!(await getMainWamVisibility()).shown) return null;
    const settings = await readMainWamSettings();
    if (settings.mode === "pra") return null;
    if (settings.mode === "semua") return mainWamPath.home;
    const member = await currentMember();
    return opensMainWamHome(settings.mode, member ? { tester: await testsMainWam(member) } : null) ? mainWamPath.home : null;
  } catch { return null; }
}

/** For /wam: go to Main WAM when it is on for this person (see mainWamHomeTarget). */
export async function redirectToMainWam(search: { versi?: string | string[] }): Promise<void> {
  const target = await mainWamHomeTarget(search);
  if (target) redirect(target);
}
