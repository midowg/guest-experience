import { redirect } from "next/navigation";
import { leadershipResetPath } from "@/lib/routes";

/** The old CMS links (with a key) lead to /refleksi/kelola, which opens without one. */
export default function LeadershipResetOldCmsLink() {
  redirect(leadershipResetPath.cmsHome);
}
