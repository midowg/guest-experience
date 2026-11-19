import { wlmIcon } from "@/lib/server/wlm-preview";

/** WLM's launcher icon, 512 × 512 (19 Nov 2026, the manifest). */
export const dynamic = "force-static";

export function GET() {
  return wlmIcon(512, false);
}
