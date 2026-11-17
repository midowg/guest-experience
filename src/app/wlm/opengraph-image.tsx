import { wlmPreview, wlmPreviewSize } from "@/lib/server/wlm-preview";

export const alt = "WLM: aplikasi wellbeing Werkudara. Masuk dengan akun WAM.";
/** Square, so the small preview in WhatsApp (a square crop) shows all of it. */
export const size = wlmPreviewSize;
export const contentType = "image/png";

/** The card under a shared /wlm link (also its sign-in and sections): what WLM is and how to get in. */
export default function Image() {
  return wlmPreview();
}
