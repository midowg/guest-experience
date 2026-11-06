import { notFound } from "next/navigation";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { SuperAdminFrame } from "@/components/admin/super/SuperAdminFrame";
import { PageHeader } from "@/components/console";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { StaffSettings } from "@/components/admin/super/StaffSettings";
import { listStaff } from "@/lib/server/staff";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tim Werkudara · Super admin" };

/** Super admin: the team who can be picked as PIC of an event. */
export default async function SuperTeamPage() {
  if ((await requireAdminPage()) !== "super") notFound();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const team = await listStaff(false);
  return <SuperAdminFrame current="tim">
    <PageHeader title="Tim Werkudara" subtitle="Orang yang bisa dipilih sebagai PIC acara." />
    <StaffSettings initial={team.staff} migrated={team.migrated} />
  </SuperAdminFrame>;
}
