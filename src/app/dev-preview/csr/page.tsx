import { notFound } from "next/navigation";
import { CsrExperience } from "@/components/guest/csr/CsrExperience";
import { donationTotals, publicDonors, startingDonation, type DonationRecord } from "@/lib/donations";
import { createSeedEvent } from "@/lib/seed-event";

export const dynamic = "force-dynamic";

/**
 * Layout check for the CSR donation page with made-up donations. Nothing is sent: the form
 * pretends to send. ?kosong=1 no donations yet · ?tutup=1 donations closed · ?serah=1 handed over · ?tema=segar the older green theme.
 */
export default async function DevCsrPage({ searchParams }: { searchParams: Promise<{ kosong?: string; tutup?: string; serah?: string; tema?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const base = startingDonation();
  const donation = {
    ...base,
    enabled: query.tutup !== "1",
    items: base.items.map(item => item.key === "dana" ? { ...item, target: 25_000_000 } : item.key === "sembako" ? { ...item, target: 100 } : item.key === "buku" ? { ...item, target: 300 } : item),
    accounts: [{ id: "a1", bank: "BCA", number: "123 456 7890", holder: "Yayasan Contoh Peduli" }, { id: "a2", bank: "Bank Syariah Indonesia", number: "7100 2233 44", holder: "Yayasan Contoh Peduli" }],
    recipients: [
      { id: "p1", name: "Panti Asuhan Contoh Kasih Ibu", place: "Sleman, Yogyakarta", description: "60 anak usia sekolah; kebutuhan utama perlengkapan sekolah dan sembako.", photo: { url: "https://picsum.photos/seed/csr-panti/400/400", alt: "Contoh foto panti", srcset: [] } },
      { id: "p2", name: "Sekolah Contoh Harapan", place: "Bantul, Yogyakarta", description: "Perpustakaan kecil untuk 120 murid SD.", photo: { url: "", alt: "", srcset: [] } },
    ],
    goodsNote: "Barang dapat diantar ke Kantor Werkudara, Jl. Contoh No. 1, setiap hari kerja pukul 09.00–16.00, paling lambat 10 Desember 2026.",
    delivered: query.serah === "1" ? { at: "2026-12-12T03:00:00.000Z", photo: { url: "https://picsum.photos/seed/csr-serah/1600/900", alt: "Contoh foto penyerahan bantuan", srcset: [] }, note: "Bantuan diterima langsung oleh pengurus panti. Terima kasih atas kebaikan Anda semua." } : base.delivered,
  };
  const event = {
    ...createSeedEvent(), id: "10f3a511-2331-4000-8000-0000000000c5", slug: "contoh-csr", code: "AB23CD", status: "published" as const, event_kind: "csr" as const,
    title: "Contoh Berbagi Bersama Anak Panti 2026", subtitle: "Bersama 60 anak di Panti Asuhan Contoh", organizer: "Werkudara Peduli",
    introduction: "Bantu kami melengkapi kebutuhan sekolah dan sembako untuk anak-anak panti menjelang tahun ajaran baru.",
    theme: { key: (query.tema === "segar" ? "segar" : "berbagi") as "segar" | "berbagi", corners: "soft" as const },
    hero: { ...createSeedEvent().hero, url: "https://picsum.photos/seed/csr-sampul/1600/1000", alt: "Contoh foto kegiatan", srcset: [] },
    donation,
  };
  const people: [string, DonationRecord["display"], string, DonationRecord["category"], number, string, string][] = [
    ["Sari Dewi", "name", "dana", "fund", 500_000, "Rp", "Semoga bermanfaat untuk adik-adik."],
    ["Budi", "hamba_allah", "sembako", "goods", 10, "paket", ""],
    ["Rina Kusuma", "name", "buku", "goods", 120, "pcs", "Semangat belajar!"],
    ["Rahasia", "hidden", "dana", "fund", 2_000_000, "Rp", ""],
    ["Agus Pratama", "name", "dana", "fund", 1_250_000, "Rp", ""],
    ["Dian", "name", "", "other", 0, "", "Kursi roda untuk panti."],
    ["Hendra", "hamba_allah", "sembako", "goods", 25, "paket", "Barakallah."],
    ["Maya", "name", "dana", "fund", 100_000, "Rp", ""],
  ];
  // A fixed day keeps the example the same on every load.
  const day = (back: number) => new Date(Date.parse("2026-10-26T03:00:00.000Z") - back * 86_400_000).toISOString();
  const records: DonationRecord[] = query.kosong === "1" ? [] : people.map(([name, display, key, category, amount, unit, message], index) => ({
    id: `d${index}`, event_id: event.id, item_key: key, item_label: key ? donation.items.find(item => item.key === key)!.label : "Kursi roda", category, amount, unit,
    donor_name: name, display, donor_phone: "", message, proof_key: "", status: index === 7 ? "pending" : "received", received_amount: null, reject_reason: "",
    verified_at: day(index), notified_at: null, created_at: day(index),
  }));
  return <CsrExperience event={event} preview view={{ totals: donationTotals(donation, records), donors: publicDonors(donation, records), ready: true }} />;
}
