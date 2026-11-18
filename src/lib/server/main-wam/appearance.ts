import "server-only";
import { cookies } from "next/headers";
import { MAIN_WAM_MODE_COOKIE, parseMainWamMode, type MainWamMode } from "@/lib/main-wam/appearance";

/** The mode this device picked (Sistem when nothing is picked yet). Reading cookies makes the page dynamic, as the gate already does. */
export async function readMainWamMode(): Promise<MainWamMode> {
  return parseMainWamMode((await cookies()).get(MAIN_WAM_MODE_COOKIE)?.value);
}
