import { wlmIcon } from "@/lib/server/wlm-preview";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The icon when WLM is added to an iPhone's home screen (iOS rounds the corners itself). */
export default function AppleIcon() {
  return wlmIcon(180, false);
}
