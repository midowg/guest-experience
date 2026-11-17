import { wlmIcon } from "@/lib/server/wlm-preview";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** WLM's own tab icon (the five dimensions in a volt ring), instead of Journey's. */
export default function Icon() {
  return wlmIcon(64, true);
}
