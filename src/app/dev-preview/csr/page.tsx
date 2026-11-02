import { notFound } from "next/navigation";
import { CsrExperience } from "@/components/guest/csr/CsrExperience";
import { donationTotals, publicDonors } from "@/lib/donations";
import { sampleCsr } from "./sample";
import type { CsrGuide } from "@/lib/csr-guide";

export const dynamic = "force-dynamic";

/**
 * Layout check for the CSR donation page with made-up donations. Nothing is sent: the form
 * pretends to send. ?kosong=1 no donations yet · ?tutup=1 donations closed · ?serah=1 handed over · ?tema=segar the older green theme · ?gaya=rapi or hangat another Tema halaman.
 */
export default async function DevCsrPage({ searchParams }: { searchParams: Promise<{ kosong?: string; tutup?: string; serah?: string; tema?: string; gaya?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const { event, donation, records } = sampleCsr(query);
  const guide: CsrGuide = {
    venueName: "Werkudara Group (contoh)", address: "Jl. Contoh No. 1\nCondongcatur, Sleman, Yogyakarta", arrivalNotes: "", locationUrl: "",
    mapImage: { url: "https://picsum.photos/seed/rute-peta/900/600", alt: "Contoh peta rute", srcset: [] },
    steps: [
      { title: "Lewat Jl. Pondok Raya", description: "Rute paling mudah dan lebar.", image: { url: "", alt: "", srcset: [] } },
      { title: "Belok di Jl. Bhinneka", description: "", image: { url: "https://picsum.photos/seed/rute-belok/800/500", alt: "Contoh foto belokan", srcset: [] } },
      { title: "Parkir di depan kantor", description: "", image: { url: "", alt: "", srcset: [] } },
    ],
    points: [{ icon: "parking", title: "Parkir", description: "Di depan kantor." }],
    gallery: [],
  };
  return <CsrExperience event={event} preview guide={guide} view={{ totals: donationTotals(donation, records), donors: publicDonors(donation, records), ready: true }} />;
}
