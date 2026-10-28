import { notFound } from "next/navigation";
import { DonationSplit } from "@/components/admin/donations/DonationSplit";
import { sampleCsr } from "../csr/sample";

export const dynamic = "force-dynamic";

/** Layout check for Donasi → Pembagian with the made-up donations of /dev-preview/csr. Taps do not save here. */
export default async function DevDonationSplitPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const { event, donation, records } = sampleCsr({});
  return <main className="container" style={{ padding: "24px 16px" }}><DonationSplit event={{ id: event.id, timezone: event.timezone, donation }} initial={records} ready /></main>;
}
