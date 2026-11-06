import { notFound } from "next/navigation";
import { Blocks, EyeOff, KeyRound, LayoutTemplate, ShieldAlert, UserCog, Users } from "lucide-react";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { SuperAdminFrame } from "@/components/admin/super/SuperAdminFrame";
import { Card, PageHeader, StatCard, StatRow } from "@/components/console";
import { EMPLOYEES_ADMIN, superAdminPath, wamAdminPath } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { listAccessLog } from "@/lib/server/access-log";
import { listAdminEvents } from "@/lib/server/events";
import { hiddenEventIds } from "@/lib/server/event-visibility";
import { requireAdminPage } from "@/lib/server/admin-session";
import { getDisabledModules, getEnabledTemplates } from "@/lib/server/admin-settings";
import { listEmployees } from "@/lib/server/employees";
import { listAccounts } from "@/lib/server/pra-wam/accounts";
import { listStaff } from "@/lib/server/staff";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard super admin" };

/**
 * Super admin only (6 Nov 2026): the numbers that matter, each opening its page in the side menu:
 * people and WAM accounts, the team, hidden events, templates and modules, and failed sign-ins.
 */
export default async function SuperAdminPage() {
  if ((await requireAdminPage()) !== "super") notFound();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [people, accounts, team, events, hidden, templates, modules, failed] = await Promise.all([
    listEmployees().catch(() => ({ employees: [] })), listAccounts().catch(() => ({ rows: [] })), listStaff(false).catch(() => ({ staff: [] })),
    listAdminEvents().catch(() => []), hiddenEventIds().catch(() => ({ ids: new Set<string>() })),
    getEnabledTemplates().catch(() => ({ templates: [] })), getDisabledModules().catch(() => ({ modules: [] })),
    listAccessLog("gagal").then(result => result.entries).catch(() => []),
  ]);
  const active = people.employees.filter(person => person.active);
  const withAccount = accounts.rows.filter(row => row.active && row.hasAccount).length;
  const since = new Date(new Date().getTime() - 7 * 86_400_000);
  const recentFails = failed.filter(entry => new Date(entry.at) >= since).length;
  return <SuperAdminFrame current="dashboard">
    <PageHeader title="Dashboard super admin" subtitle="Ringkasan yang perlu dilihat. Buka bagiannya dari menu samping." />
    <StatRow label="Ringkasan">
      <StatCard label="Karyawan aktif" value={active.length} note={`${withAccount} punya akun WAM`} icon={<Users size={18} />} href={EMPLOYEES_ADMIN} />
      <StatCard label="Tim Werkudara" value={team.staff.length} note="bisa jadi PIC acara" icon={<UserCog size={18} />} href={superAdminPath.team} />
      <StatCard label="Acara tersembunyi" value={hidden.ids.size} note={`dari ${events.length} acara`} icon={<EyeOff size={18} />} href={superAdminPath.templates} />
      <StatCard label="Percobaan masuk gagal" value={recentFails} note="7 hari terakhir" icon={<ShieldAlert size={18} />} tone={recentFails ? "warn" : undefined} href={`${superAdminPath.access}?jenis=gagal`} />
    </StatRow>
    <Card title="Pengaturan admin">
      <StatRow label="Pengaturan admin">
        <StatCard label="Templat di Buat acara" value={templates.templates.length} icon={<LayoutTemplate size={18} />} href={superAdminPath.templates} />
        <StatCard label="Modul dimatikan" value={modules.modules.length} icon={<Blocks size={18} />} href={superAdminPath.modules} />
        <StatCard label="Admin WAM" value="Buka" note="Panitia, akun, ruang" icon={<KeyRound size={18} />} href={wamAdminPath.home} />
      </StatRow>
    </Card>
  </SuperAdminFrame>;
}
