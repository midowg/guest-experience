import "server-only";
import { cookies } from "next/headers";
import { parseWamTheme, WAM_THEME_COOKIE, type WamTheme } from "@/lib/pra-wam/theme";

/** The theme the person picked (light when nothing is picked yet). */
export async function readWamTheme(): Promise<WamTheme> {
  return parseWamTheme((await cookies()).get(WAM_THEME_COOKIE)?.value);
}
