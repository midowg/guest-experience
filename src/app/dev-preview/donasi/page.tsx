import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/shared/AdminShell";
import { DonationBoard } from "@/components/admin/donations/DonationBoard";
import { startingDonation, type DonationRecord } from "@/lib/donations";

export const dynamic = "force-dynamic";

/** Layout check for the admin donation desk with made-up donations. Every button fails without a session; ?serah=1 handed over. */
export default async function DevDonationsPage({ searchParams }: { searchParams: Promise<{ serah?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const handedOver = (await searchParams).serah === "1";
  const donation = { ...startingDonation(), items: startingDonation().items.map(item => item.key === "dana" ? { ...item, target: 25_000_000 } : item), delivered: { ...startingDonation().delivered, at: handedOver ? "2026-10-26T03:00:00.000Z" : null } };
  const day = (back: number) => new Date(Date.parse("2026-10-26T03:00:00.000Z") - back * 3_600_000).toISOString();
  const row = (n: number, overrides: Partial<DonationRecord>): DonationRecord => ({
    id: `8d000000-0000-4000-8000-00000000000${n}`, event_id: "10f3a511-2331-4000-8000-0000000000c5", item_key: "dana", item_label: "Dana", category: "fund", amount: 100_000, unit: "Rp",
    donor_name: "Contoh Donatur", display: "name", donor_phone: "", message: "", proof_key: "", status: "pending", received_amount: null, reject_reason: "", verified_at: null, notified_at: null, recipient_id: "", created_at: day(n), ...overrides,
  });
  const rows = [
    row(1, { donor_name: "Contoh Sari Dewi", amount: 500_000, donor_phone: "081234567890", message: "Semoga bermanfaat.", proof_key: "x/1.jpg" }),
    row(2, { donor_name: "Contoh Budi", display: "hamba_allah", item_key: "sembako", item_label: "Sembako", category: "goods", amount: 10, unit: "paket", donor_phone: "081298765432" }),
    row(3, { donor_name: "Contoh Rina", status: "received", amount: 1_000_000, received_amount: 1_000_000, verified_at: day(3), donor_phone: "081311112222", notified_at: handedOver ? day(1) : null }),
    row(4, { donor_name: "Contoh Agus", status: "received", item_key: "buku", item_label: "Buku tulis", category: "goods", amount: 120, unit: "pcs", verified_at: day(4), donor_phone: "081355556666" }),
    row(5, { donor_name: "Contoh Rahasia", display: "hidden", status: "rejected", reject_reason: "Transfer tidak ditemukan", verified_at: day(5) }),
  ];
  return <AdminShell><h1>Donasi masuk (contoh)</h1><DonationBoard event={{ id: "10f3a511-2331-4000-8000-0000000000c5", title: "Contoh Berbagi Bersama Anak Panti 2026", timezone: "Asia/Jakarta", donation }} link="https://invitation.werkudara.group/AB23CD" initial={rows} migrated /></AdminShell>;
}
