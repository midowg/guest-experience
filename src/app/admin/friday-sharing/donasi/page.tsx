import DonationsPage from "../../acara/[ref]/donasi/page";
import { fridaySharingParams } from "../current";

export const dynamic = "force-dynamic";

/** /admin/friday-sharing/donasi: the Friday Sharing's incoming donations. */
export default async function FridaySharingDonationsPage() {
  return DonationsPage({ params: fridaySharingParams() });
}
