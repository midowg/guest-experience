import { redirect } from "next/navigation";
import { praWamPath } from "@/lib/routes";

export const dynamic = "force-dynamic";

/** Meeting HOD is booked from Book ruang now (6 Nov 2026); old links land on Book. */
export default function HodPage() {
  redirect(praWamPath.appraisal());
}
