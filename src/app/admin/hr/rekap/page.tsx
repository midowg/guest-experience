import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { HrAdminFrame } from "@/components/hr-admin/HrAdminFrame";
import { MonthRecap } from "@/components/hr-admin/MonthRecap";
import { hrAdminSection } from "@/components/hr-admin/sections";
import { Notice } from "@/components/ui";
import { isMonth } from "@/lib/hr/leave";
import { isSupabaseConfigured, ServiceError } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminMonth, jakartaToday } from "@/lib/server/hr/leave";

export const dynamic = "force-dynamic";
export const metadata = { title: `${hrAdminSection("rekap").label} · Admin HR` };

/** Admin HR → Rekap bulanan: everyone × every day of a month, coloured; ?bulan=YYYY-MM opens another month. */
export default async function HrAdminMonth({ searchParams }: { searchParams: Promise<{ bulan?: string }> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const today = jakartaToday();
  const { bulan } = await searchParams;
  const month = isMonth(bulan) && bulan <= today.slice(0, 7) ? bulan : today.slice(0, 7);
  const data = await adminMonth(month, today).catch((error: unknown) => {
    if (error instanceof ServiceError && error.status === 503) return error;
    throw error;
  });
  return <HrAdminFrame current="rekap">
    {data instanceof ServiceError ? <Notice tone="warning">{data.message}</Notice> : <MonthRecap initial={data} />}
  </HrAdminFrame>;
}
