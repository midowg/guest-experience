import { notFound } from "next/navigation";
import { AdminShell, EventNavigation } from "@/components/admin/shared/AdminShell";
import { DonationSplit } from "@/components/admin/donations/DonationSplit";
import { sampleCsr } from "../csr/sample";

export const dynamic = "force-dynamic";

/** Layout check for Donasi → Pembagian with the made-up donations of /dev-preview/csr. Taps do not save here. */
export default async function DevDonationSplitPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const { event, donation, records } = sampleCsr({});
  return <AdminShell>
    <EventNavigation event={{ ...event, donation }} current="donations-split" />
    <DonationSplit event={{ id: event.id, timezone: event.timezone, donation }} initial={records} ready />
  </AdminShell>;
}
