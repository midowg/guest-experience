import { redirect } from "next/navigation";
import { praWamPath } from "@/lib/routes";

export const dynamic = "force-dynamic";

/** Meeting HOD lives in Book now (6 Nov 2026); old links and notifications land there. */
export default function HodPage() {
  redirect(praWamPath.bookHod);
}
