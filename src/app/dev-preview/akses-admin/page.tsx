import { notFound } from "next/navigation";
import { ConsoleShell, PageHeader } from "@/components/console";
import { AdminGrants } from "@/components/admin/super/AdminGrants";
import { AccessLogTable } from "@/components/admin/super/AccessLogTable";
import { RerollVouchers } from "@/components/admin/super/RerollVouchers";
import admin from "@/components/admin/admin.module.css";
import type { AccessEntry } from "@/lib/server/access-log";

export const dynamic = "force-dynamic";

const A = "0b6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c11", B = "1b6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c11", C = "2b6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c11";
const E1 = "5a6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c01", E2 = "5a6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c02";
const log = (id: number, patch: Partial<AccessEntry>): AccessEntry => ({ id, at: `2026-11-13T0${id}:15:00Z`, kind: "login_success", ip: "180.244.12.9", country: "ID", region: "JK", city: "Jakarta", user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36", device_id: "9c1d2e3f-0000-4000-8000-000000000001", new_device: false, role: "admin", employee_id: A, actor: "Dewi Lestari", ...patch });

/** Layout check for Super admin → Akses admin, Log akses (?bagian=log) and Voucher re-roll (?bagian=voucher) without signing in. Buttons call the real API, which refuses without a super admin session. */
export default async function DevAdminAccessPage({ searchParams }: { searchParams: Promise<{ bagian?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const part = (await searchParams).bagian;
  const logOnly = part === "log";
  // Voucher re-roll (18 Nov 2026): one unused, one used with what it changed, one given by hand and cancelled.
  if (part === "voucher") {
    const claim = (title: string, cost: number) => ({ id: "c0000000-0000-4000-8000-000000000001", title, cost, status: "delivered" as const });
    const empty = { usedAt: null, before: null, after: null, restorable: false, revokedAt: null, revokedBy: null, revokeReason: null, restoredAt: null, restoredBy: null, note: "", givenBy: null };
    const vouchers = [
      { ...empty, id: "a0000000-0000-4000-8000-000000000001", employeeId: A, employeeName: "Dewi", department: "Center of Excellence", legendary: false, status: "open" as const, createdAt: "2026-11-18T03:00:00.000Z", claim: claim("Voucher re-roll tokoh", 5000) },
      { ...empty, id: "a0000000-0000-4000-8000-000000000002", employeeId: B, employeeName: "Raja", department: "Human Resources & General Affair", legendary: true, status: "used" as const, createdAt: "2026-11-17T08:00:00.000Z", claim: claim("Voucher re-roll Legendary", 25000),
        usedAt: "2026-11-17T08:05:00.000Z", before: { figure: "Ki Hajar Dewantara", tier: "Rare" }, after: { figure: "Susi Susanti", tier: "Legendary" }, restorable: true },
      { ...empty, id: "a0000000-0000-4000-8000-000000000003", employeeId: C, employeeName: "Rara", department: "", legendary: false, status: "revoked" as const, createdAt: "2026-11-16T02:00:00.000Z", claim: null, givenBy: "Super admin", note: "Pengganti voucher gagal",
        revokedAt: "2026-11-16T04:00:00.000Z", revokedBy: "Super admin", revokeReason: "Salah orang" },
    ];
    const people = [{ id: A, name: "Dewi Lestari", nickname: "Dewi", department: "Center of Excellence", category: "karyawan", hasCard: true }, { id: B, name: "Raja Damai Sejahtera Waruwu", nickname: "Raja", department: "Human Resources & General Affair", category: "karyawan", hasCard: false }];
    return <ConsoleShell theme="admin" area="Super admin" storageKey="dev-super" className={admin.shell} person={{ name: "Super admin", sub: "Werkudara" }}
      groups={[{ label: "Uji coba", items: [{ key: "voucher", label: "Voucher re-roll", href: "/dev-preview/akses-admin?bagian=voucher" }] }]} current="voucher" pageTitle="Voucher re-roll">
      <PageHeader title="Voucher re-roll" subtitle="Voucher re-roll kartu tokoh dari Hadiah WLM. Batalkan, kembalikan poin atau kartu, atau beri voucher tanpa poin." />
      <RerollVouchers initial={{ migrated: true, vouchers, people, legend: { name: "Legendary", cap: 3, cards: 2, reserved: 0 } }} />
    </ConsoleShell>;
  }
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
          { id: A, name: "Dewi Lestari", nickname: "Dewi", department: "Center of Excellence", category: "karyawan", hasAccount: true, picOf: 1 },
          { id: B, name: "Raja Damai Sejahtera Waruwu", nickname: "Raja", department: "Human Resources & General Affair", category: "karyawan", hasAccount: true, picOf: 0 },
          { id: C, name: "Shaira Kamila", nickname: "Rara", department: "", category: "intern", hasAccount: true, picOf: 0 },
          { id: "3b6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c11", name: "Tri Wiyono", nickname: "Ion", department: "Human Resources & General Affair", category: "dw", hasAccount: true, picOf: 0 },
          { id: "4b6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c11", name: "Orang Tanpa Akun", nickname: "", department: "Accounting", category: "karyawan", hasAccount: false, picOf: 0 },
        ]}
        events={[{ id: E1, title: "Gathering Klien 2026", kind: "acara" }, { id: E2, title: "Kunjungan PT Contoh", kind: "kunjungan" }, { id: "5a6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c03", title: "Friday Sharing", kind: "csr" }]} />
    </>}
  </ConsoleShell>;
}
