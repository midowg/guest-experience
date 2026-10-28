import { notFound } from "next/navigation";
import { AdminShell, EventNavigation } from "@/components/admin/shared/AdminShell";
import { DonationSplit } from "@/components/admin/donations/DonationSplit";
import styles from "@/components/admin/admin.module.css";
import { sampleCsr } from "../csr/sample";

export const dynamic = "force-dynamic";

/** Layout check for Donasi → Pembagian with the made-up donations of /dev-preview/csr. Taps do not save here. */
export default async function DevDonationSplitPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const { event, donation, records } = sampleCsr({});
  return <AdminShell>
    <p className="eyebrow">Friday Sharing</p>
    <h1 className={styles.title}>{event.title}</h1>
    <EventNavigation event={{ ...event, donation }} current="donations-split" />
    <DonationSplit event={{ id: event.id, timezone: event.timezone, donation }} initial={records} ready />
  </AdminShell>;
}
