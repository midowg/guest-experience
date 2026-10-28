import { redirect } from "next/navigation";
import { PLACE_GUIDE_PATH } from "@/lib/routes";

/** /e/slug/panduan, an older visit link: the way to Werkudara now lives on its own at /your-visit. */
export default function LegacyArrivalPage() {
  redirect(PLACE_GUIDE_PATH);
}
