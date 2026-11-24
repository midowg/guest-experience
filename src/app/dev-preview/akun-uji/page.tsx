import { notFound } from "next/navigation";
import { ConsoleShell } from "@/components/console";
import { PraWamTestAccounts } from "@/components/admin/wam/PraWamTestAccounts";
import admin from "@/components/admin/admin.module.css";

export const dynamic = "force-dynamic";

/* Layout check for Admin Pra WAM → Akun uji with made-up people, without signing in (?kosong=1: none yet). */
const person = (n: number, name: string, department: string) => ({ id: `00000000-0000-4000-8000-0000000003${String(n).padStart(2, "0")}`, name, department });
const people = [person(1, "Rani Contoh", "Departemen Contoh"), person(2, "Bima Contoh", "BOD"), person(3, "Dewi Contoh", "Finance"), person(4, "Fajar Contoh", "Sales & Marketing")];

export default async function DevTestAccountsPage({ searchParams }: { searchParams: Promise<{ kosong?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const empty = !!(await searchParams).kosong;
  return <ConsoleShell theme="admin" area="Admin Pra WAM" storageKey="dev-uji" className={admin.shell} person={{ name: "Panitia Contoh", sub: "Werkudara" }}
    groups={[{ label: "Pengaturan", items: [{ key: "uji", label: "Akun uji", href: "/dev-preview/akun-uji" }] }]} current="uji" pageTitle="Akun uji">
    <PraWamTestAccounts initial={{ migrated: true, people, accounts: empty ? { ids: [], carbonTestOnly: false } : { ids: [people[0].id], carbonTestOnly: true } }} crumbs={[{ label: "Admin Pra WAM" }, { label: "Pengaturan" }]} title="Akun uji" />
  </ConsoleShell>;
}
