import { redirect } from "next/navigation";
import { PLACE_GUIDE_PATH } from "@/lib/routes";

/** /AB23CD/panduan, an older visit link: the way to Werkudara now lives on its own at /your-visit. */
export default function OldArrivalPage() {
  redirect(PLACE_GUIDE_PATH);
}
