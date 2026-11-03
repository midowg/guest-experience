import { redirect } from "next/navigation";
import { praWamPath } from "@/lib/routes";

export const dynamic = "force-dynamic";

/** Tahap 0: Appraisal is the first part that is ready, so the home page opens it. */
export default function PraWamHome() {
  redirect(praWamPath.appraisal());
}
