import "server-only";
import { cookies } from "next/headers";
import { MAIN_WAM_MODE_COOKIE, MAIN_WAM_MOTION_COOKIE, parseMainWamMode, parseReduceMotion, type MainWamMode } from "@/lib/main-wam/appearance";

/** The mode this device picked (Sistem when nothing is picked yet). Reading cookies makes the page dynamic, as the gate already does. */
export async function readMainWamMode(): Promise<MainWamMode> {
  return parseMainWamMode((await cookies()).get(MAIN_WAM_MODE_COOKIE)?.value);
}

/** Whether this device asked for a calmer app (Pengaturan → Kurangi gerak). */
export async function readReduceMotion(): Promise<boolean> {
  return parseReduceMotion((await cookies()).get(MAIN_WAM_MOTION_COOKIE)?.value);
}
