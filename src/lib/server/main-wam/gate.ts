import "server-only";
import { notFound, redirect } from "next/navigation";
import { mainWamGate, moduleAllows, opensMainWamHome, type MainWamAction } from "@/lib/main-wam/access";
import { MAIN_WAM_MODULES, type MainWamModule, type MainWamSettings, type MainWamViewer, type ModuleSwitches } from "@/lib/main-wam/types";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import { mainWamPath, praWamPath } from "@/lib/routes";
import { ServiceError } from "../config";
import { currentMember } from "../pra-wam/session";
import { readMainWamSettings } from "./settings";
import { mainWamViewer, testsMainWam } from "./viewer";

/*
 * The gate of Main WAM (docs/main-wam/KONTRAK.md §3). Every Main WAM page calls requireMainWamPage
 * and every API requireMainWamApi, close to the data (Next.js: a layout's check does not re-run on
 * navigation, so it is never the only one). The layout calls it too, so no frame is drawn for
 * someone it is not for. A module that is off: its pages are not found, its APIs answer 404.
 */

export type MainWamContext = { viewer: MainWamViewer; settings: MainWamSettings };

const notThere = () => new ServiceError(404, "Halaman tidak ditemukan.");

/** For pages: the person and the settings, or the sign-in page (coming back here), or not found. */
export async function requireMainWamPage(here: string): Promise<MainWamContext> {
  const [settings, viewer] = await Promise.all([readMainWamSettings(), mainWamViewer()]);
  const gate = mainWamGate(settings.mode, viewer);
  if (gate.kind === "login") redirect(gate.page === "main" ? mainWamPath.login(here) : praWamPath.login(here));
  if (gate.kind === "tutup" || !viewer) notFound();
  return { viewer, settings };
}

/** For APIs: 401 without a session, 404 when Main WAM is not on for the person. */
export async function requireMainWamApi(): Promise<MainWamContext> {
  if (!praWamSecret()) throw new ServiceError(503, "Login WAM belum disiapkan. Isi WAM_SESSION_SECRET (acak, minimal 32 karakter) pada server.");
  const [settings, viewer] = await Promise.all([readMainWamSettings(), mainWamViewer()]);
  const gate = mainWamGate(settings.mode, viewer);
  if (gate.kind === "login") throw new ServiceError(401, "Sesi berakhir. Masuk kembali sebelum melanjutkan.");
  if (gate.kind === "tutup" || !viewer) throw notThere();
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

/** An action's page (panitia tools, BOD's Ringkasan, a module's action): not found for anyone it is not for. */
export async function requireActionPage(action: MainWamAction, here: string): Promise<MainWamContext> {
  const context = await requireMainWamPage(here);
  if (!moduleAllows(context.viewer, action, context.settings.modules)) notFound();
  return context;
}

// The role check alone, with every module on: tells "not for your role" (403) from "module off" (404).
const ALL_ON = Object.fromEntries(MAIN_WAM_MODULES.map(key => [key, true])) as ModuleSwitches;

/** An action's API: 404 while its module is off, 403 for a role that may not. */
export async function requireActionApi(action: MainWamAction): Promise<MainWamContext> {
  const context = await requireMainWamApi();
  if (!moduleAllows(context.viewer, action, ALL_ON)) throw new ServiceError(403, "Akunmu tidak bisa melakukan ini.");
  if (!moduleAllows(context.viewer, action, context.settings.modules)) throw notThere();
  return context;
}
/**
 * Pra WAM's Beranda (/wam) sends the person on to Main WAM when it is on for them: mode semua for
 * everyone (signed in or not), mode uji for a penguji. `versi=pra` (praWamPath.homePra) stays on
 * Pra WAM. Never throws: on any failure Pra WAM shows as before.
 */
export async function mainWamHomeTarget(search: { versi?: string | string[] }): Promise<string | null> {
  if (search.versi === "pra") return null;
  try {
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
