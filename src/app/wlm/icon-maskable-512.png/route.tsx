import { wlmIcon } from "@/lib/server/wlm-preview";

/** WLM's launcher icon, 512 × 512 (maskable: the name inside the safe middle, for Android's shapes) (19 Nov 2026, the manifest). */
export const dynamic = "force-static";

export function GET() {
  return wlmIcon(512, false, true);
}
