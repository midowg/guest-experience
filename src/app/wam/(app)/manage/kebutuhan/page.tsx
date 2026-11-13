import { redirect } from "next/navigation";
import { praWamPath } from "@/lib/routes";

export const dynamic = "force-dynamic";

/**
 * Kebutuhan peserta was taken out of Kelola acara (13 Nov 2026, the owner's choice): everything of the
 * questionnaire is in Admin WAM → Kuesioner. An old link or bookmark lands on Ringkasan.
 */
export default function MovedToAdmin() {
  redirect(praWamPath.dashboard);
}
