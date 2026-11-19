import { wlmIcon } from "@/lib/server/wlm-preview";

/** WLM's launcher icon, 192 × 192 (19 Nov 2026, the manifest). */
export const dynamic = "force-static";

export function GET() {
  return wlmIcon(192, false);
}
