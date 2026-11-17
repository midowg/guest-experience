import { previewSize } from "@/lib/server/link-preview";
import { wlmPreview } from "@/lib/server/wlm-preview";

export const alt = "WLM: aplikasi wellbeing Werkudara. Masuk dengan akun WAM.";
export const size = previewSize;
export const contentType = "image/png";

/** The card under a shared /wlm link (also its sign-in and sections): what WLM is and how to get in. */
export default function Image() {
  return wlmPreview();
}
