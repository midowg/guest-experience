import { notFound } from "next/navigation";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { RerollVouchers } from "@/components/admin/super/RerollVouchers";
import { SuperAdminFrame } from "@/components/admin/super/SuperAdminFrame";
import { PageHeader } from "@/components/console";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminVouchers } from "@/lib/server/wellbeing/vouchers";

export const dynamic = "force-dynamic";
export const metadata = { title: "Voucher re-roll · Super admin" };

/** Super admin (18 Nov 2026, uji coba): every re-roll voucher from WLM's Hadiah, to correct by hand. */
export default async function SuperVouchersPage() {
  if ((await requireAdminPage()) !== "super") notFound();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const initial = await adminVouchers();
  return <SuperAdminFrame current="voucher">
    <PageHeader title="Voucher re-roll" subtitle="Voucher re-roll kartu tokoh dari Hadiah WLM. Batalkan, kembalikan poin atau kartu, atau beri voucher tanpa poin." />
    <RerollVouchers initial={initial} />
  </SuperAdminFrame>;
}
