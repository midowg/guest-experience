import DonationSplitPage from "../../../acara/[ref]/donasi/pembagian/page";
import { fridaySharingParams } from "../../current";

export const dynamic = "force-dynamic";

/** /admin/friday-sharing/donasi/pembagian: share received donations out to the recipients. */
export default async function FridaySharingSplitPage() {
  return DonationSplitPage({ params: fridaySharingParams() });
}
