import { redirect } from "next/navigation";
import { praWamPath } from "@/lib/routes";

export const dynamic = "force-dynamic";

/** The home page opens the person's agenda; a Beranda with news comes with announcements. */
export default function PraWamHome() {
  redirect(praWamPath.agenda);
}
