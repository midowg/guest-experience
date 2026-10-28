import { notFound } from "next/navigation";
import { CsrExperience } from "@/components/guest/csr/CsrExperience";
import { donationTotals, publicDonors } from "@/lib/donations";
import { sampleCsr } from "./sample";

export const dynamic = "force-dynamic";

/**
 * Layout check for the CSR donation page with made-up donations. Nothing is sent: the form
 * pretends to send. ?kosong=1 no donations yet · ?tutup=1 donations closed · ?serah=1 handed over · ?tema=segar the older green theme · ?gaya=rapi or hangat another Tema halaman.
 */
export default async function DevCsrPage({ searchParams }: { searchParams: Promise<{ kosong?: string; tutup?: string; serah?: string; tema?: string; gaya?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const { event, donation, records } = sampleCsr(query);
  return <CsrExperience event={event} preview view={{ totals: donationTotals(donation, records), donors: publicDonors(donation, records), ready: true }} />;
}
