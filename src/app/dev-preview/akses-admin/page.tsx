import { notFound } from "next/navigation";
import { ConsoleShell, PageHeader } from "@/components/console";
import { AdminGrants } from "@/components/admin/super/AdminGrants";
import { AccessLogTable } from "@/components/admin/super/AccessLogTable";
import admin from "@/components/admin/admin.module.css";
import type { AccessEntry } from "@/lib/server/access-log";

export const dynamic = "force-dynamic";

const A = "0b6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c11", B = "1b6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c11", C = "2b6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c11";
const E1 = "5a6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c01", E2 = "5a6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c02";
const log = (id: number, patch: Partial<AccessEntry>): AccessEntry => ({ id, at: `2026-11-13T0${id}:15:00Z`, kind: "login_success", ip: "180.244.12.9", country: "ID", region: "JK", city: "Jakarta", user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36", device_id: "9c1d2e3f-0000-4000-8000-000000000001", new_device: false, role: "admin", employee_id: A, actor: "Dewi Lestari", ...patch });

/** Layout check for Super admin → Akses admin and Log akses without signing in (?bagian=log). Buttons call the real API, which refuses without a super admin session. */
export default async function DevAdminAccessPage({ searchParams }: { searchParams: Promise<{ bagian?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const logOnly = (await searchParams).bagian === "log";
  return <ConsoleShell theme="admin" area="Super admin" storageKey="dev-super" className={admin.shell} person={{ name: "Super admin", sub: "Werkudara" }}
    groups={[{ label: "Keamanan", items: [{ key: "admin", label: "Akses admin", href: "/dev-preview/akses-admin" }, { key: "akses", label: "Log akses", href: "/dev-preview/akses-admin?bagian=log" }] }]}
    current={logOnly ? "akses" : "admin"} pageTitle={logOnly ? "Log akses" : "Akses admin"}>
    {logOnly ? <>
      <PageHeader title="Log akses admin" subtitle="Siapa masuk dan keluar admin, kapan, dan dari mana. 200 catatan terakhir." />
      <AccessLogTable entries={[
        log(9, {}),
        log(8, { kind: "login_failure", role: null, employee_id: null, actor: "dewi.l", new_device: true, device_id: "7a1d2e3f-0000-4000-8000-000000000002" }),
        log(7, { role: "super", employee_id: null, actor: "Super admin", user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1" }),
        log(6, { kind: "logout", actor: "Raja Damai Sejahtera Waruwu", employee_id: B, city: null, region: null, country: null }),
        log(5, { actor: null, employee_id: null, role: "admin" }),
      ]} />
    </> : <>
      <PageHeader title="Akses admin" subtitle="Siapa yang bisa masuk ke admin, dan apa yang bisa ia buka." />
      <AdminGrants migrated
        initial={[
          { employeeId: A, apps: ["acara", "wam", "tv"], allEvents: true, eventIds: [] },
          { employeeId: B, apps: ["acara"], allEvents: false, eventIds: [E1] },
          { employeeId: C, apps: ["wam"], allEvents: false, eventIds: [] },
        ]}
        people={[
          { id: A, name: "Dewi Lestari", department: "Center of Excellence", category: "karyawan", hasAccount: true, picOf: 1 },
          { id: B, name: "Raja Damai Sejahtera Waruwu", department: "Human Resources & General Affair", category: "karyawan", hasAccount: true, picOf: 0 },
          { id: C, name: "Shaira Kamila", department: "", category: "intern", hasAccount: true, picOf: 0 },
          { id: "3b6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c11", name: "Tri Wiyono", department: "Human Resources & General Affair", category: "dw", hasAccount: true, picOf: 0 },
          { id: "4b6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c11", name: "Orang Tanpa Akun", department: "Accounting", category: "karyawan", hasAccount: false, picOf: 0 },
        ]}
        events={[{ id: E1, title: "Gathering Klien 2026", kind: "acara" }, { id: E2, title: "Kunjungan PT Contoh", kind: "kunjungan" }, { id: "5a6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c03", title: "Friday Sharing", kind: "csr" }]} />
    </>}
  </ConsoleShell>;
}
