import { notFound } from "next/navigation";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { SuperAdminFrame } from "@/components/admin/super/SuperAdminFrame";
import { AdminGrants } from "@/components/admin/super/AdminGrants";
import { PageHeader } from "@/components/console";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { grantPeople, listGrants } from "@/lib/server/admin-actor";
import { listAdminEvents } from "@/lib/server/events";
import { listStaff } from "@/lib/server/staff";

export const dynamic = "force-dynamic";
export const metadata = { title: "Akses admin · Super admin" };

/** Super admin (13 Nov 2026): who signs in to the admin with their own WAM account, and what each opens. */
export default async function SuperAdminsPage() {
  if ((await requireAdminPage()) !== "super") notFound();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [{ grants, migrated }, people, events, team] = await Promise.all([listGrants(), grantPeople(), listAdminEvents(), listStaff(false)]);
  const picOf = new Map<string, number>();
  for (const member of team.staff) if (member.employee_id) picOf.set(member.employee_id, (picOf.get(member.employee_id) ?? 0) + 1);
  return <SuperAdminFrame current="admin">
    <PageHeader title="Akses admin" subtitle="Siapa yang bisa masuk ke admin, dan apa yang bisa ia buka." />
    <p className="muted" style={{ marginTop: 0 }}>Admin masuk dengan email atau nama panggilan dan password WAM masing-masing, jadi log mencatat nama orangnya. Password admin bersama tidak dipakai lagi; password super admin tetap. Perubahan berlaku di halaman berikutnya yang dibuka admin itu.</p>
    <AdminGrants initial={grants} migrated={migrated}
      people={people.map(person => ({ ...person, picOf: picOf.get(person.id) ?? 0 }))}
      events={events.map(event => ({ id: event.id, title: event.title, kind: event.event_kind ?? "" }))} />
  </SuperAdminFrame>;
}
