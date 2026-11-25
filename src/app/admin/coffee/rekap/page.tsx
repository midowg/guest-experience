import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { CoffeeAdminFrame, waitingFor } from "@/components/coffee-admin/CoffeeAdminFrame";
import { monthEnd } from "@/components/coffee-admin/format";
import { COFFEE_ADMIN_LABEL, coffeeAdminSection } from "@/components/coffee-admin/sections";
import { wibMonth } from "@/lib/coffee/quota";
import { requireAdminPage } from "@/lib/server/admin-session";
import { recap } from "@/lib/server/coffee/recap";
import { isSupabaseConfigured, ServiceError } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const metadata = { title: `${coffeeAdminSection("rekap").label} · ${COFFEE_ADMIN_LABEL}` };

/** Werkudara Coffee → Rekap: this month, one row per drink; ?bulan=YYYY-MM opens another month. */
export default async function CoffeeAdminRecapPage({ searchParams }: { searchParams: Promise<{ bulan?: string }> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const { bulan } = await searchParams;
  const current = wibMonth(new Date().toISOString());
  const month = bulan && /^\d{4}-(0[1-9]|1[0-2])$/.test(bulan) && bulan <= current ? bulan : current;
  const query = { dari: `${month}-01`, sampai: monthEnd(month) };
  const data = await recap(query).catch(waitingFor);
  if (data instanceof ServiceError) return <CoffeeAdminFrame view="rekap" notice={data.message} />;
  return <CoffeeAdminFrame view="rekap" initial={{ recap: { query, data } }} />;
}
