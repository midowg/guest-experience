import type { ConsoleTone, RoleItem } from "@/components/console";
import { roleLabels, type PraWamRole } from "@/lib/pra-wam/roles";
import type { AccountRow } from "@/lib/server/pra-wam/accounts";

/*
 * What Akun dan peran shows of an account: its status pill, its roles as pills, the filter chips
 * and the counts of the page header. Pure, so the cards, the table and the tests read the same rule.
 */

export type AccountStatus = { key: "aktif" | "belum-login" | "reset" | "tanpa-akun" | "nonaktif"; label: string; tone: ConsoleTone };

/** Inactive first, then an open reset request, then no account yet, then signed in or not. */
export function accountStatus(row: AccountRow, resetRequested: ReadonlySet<string>): AccountStatus {
  if (!row.active) return { key: "nonaktif", label: "Nonaktif", tone: "neutral" };
  if (resetRequested.has(row.employeeId)) return { key: "reset", label: "Reset diminta", tone: "warn" };
  if (!row.hasAccount) return { key: "tanpa-akun", label: "Belum ada akun", tone: "neutral" };
  return row.lastLoginAt ? { key: "aktif", label: "Aktif", tone: "ok" } : { key: "belum-login", label: "Belum login", tone: "blue" };
}

/** The tone of each role, the same on every card, row and on the Peran tab. */
export const roleTones = { peserta: "neutral", panitia: "blue", admin: "purple", hod: "teal", bod: "brass", ga: "ok" } as const satisfies Record<PraWamRole | "peserta" | "hod", ConsoleTone>;

/** The roles on top of peserta (BOD, Panitia, Admin WAM, then HOD and Lead); "Peserta" alone when there are none. */
export function roleItems(row: Pick<AccountRow, "roles" | "leads" | "lead" | "hasAccount"> & Partial<Pick<AccountRow, "category">>): RoleItem[] {
  const order: PraWamRole[] = ["bod", "panitia", "admin", "ga"];
  // Status kerja first (13 Nov 2026), so interns and daily workers are seen at a glance.
  const status: RoleItem[] = row.category === "intern" ? [{ label: "Intern", tone: "brass" }] : row.category === "dw" ? [{ label: "DW", tone: "neutral" }] : [];
  const items: RoleItem[] = [...status, ...order.filter(role => row.roles.includes(role)).map(role => ({ label: roleLabels[role], tone: roleTones[role] }))];
  if (row.leads.length) items.push({ label: "HOD", tone: roleTones.hod });
  if (row.lead) items.push({ label: "Lead", tone: roleTones.hod });
  if (items.length === status.length && row.hasAccount) items.push({ label: "Peserta", tone: roleTones.peserta });
  return items;
}

export type AccountFilter = "semua" | "panitia" | "hod" | "bod" | "admin" | "belum-login" | "intern" | "dw";
export const accountFilters: readonly { value: AccountFilter; label: string }[] = [
  { value: "semua", label: "Semua" },
  { value: "panitia", label: "Panitia" },
  { value: "hod", label: "HOD" },
  { value: "bod", label: "BOD" },
  { value: "admin", label: "Admin WAM" },
  { value: "belum-login", label: "Belum login" },
  { value: "intern", label: "Intern" },
  { value: "dw", label: "DW" },
];

export function matchesFilter(row: AccountRow, filter: AccountFilter): boolean {
  switch (filter) {
    case "semua": return true;
    case "hod": return row.leads.length > 0;
    case "belum-login": return row.active && row.hasAccount && !row.lastLoginAt;
    case "intern": case "dw": return row.category === filter;
    default: return row.roles.includes(filter);
  }
}

/** Name, unit (department) or email contains every word typed, ignoring case. */
export function matchesSearch(row: AccountRow, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = `${row.name} ${row.department} ${row.email}`.toLowerCase();
  return words.every(word => text.includes(word));
}

/** A to Z by name, so a person is easy to find by scrolling. */
export const byName = (a: AccountRow, b: AccountRow) => a.name.localeCompare(b.name, "id", { sensitivity: "base" });

/** The header's counts, over active people: who has an account, who has signed in, who never did. */
export function accountSummary(rows: readonly AccountRow[]) {
  const active = rows.filter(row => row.active);
  const withAccount = active.filter(row => row.hasAccount);
  const signedIn = withAccount.filter(row => row.lastLoginAt).length;
  const missing = active.filter(row => !row.hasAccount);
  return {
    active: active.length, withAccount: withAccount.length, signedIn, neverSignedIn: withAccount.length - signedIn,
    missing: missing.length, missingEmail: missing.filter(row => !row.email).length,
    /** How many "Buat akun" would make now: everyone without an account (13 Nov 2026: without an email too, by nama panggilan). */
    creatable: missing.length,
  };
}

/** "N orang punya akun. X sudah masuk, Y belum pernah." */
export const summaryLine = (summary: { withAccount: number; signedIn: number; neverSignedIn: number }) =>
  `${summary.withAccount} orang punya akun. ${summary.signedIn} sudah masuk, ${summary.neverSignedIn} belum pernah.`;

const dateTime = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
/** "5 Nov, 09.12" in WIB. */
export const shortDateTime = (iso: string) => dateTime.format(new Date(iso));

/** The line under a card or in the table: when they last signed in, or why they never did. */
export function lastLoginLabel(row: AccountRow): string {
  if (!row.hasAccount) return "Belum ada akun";
  if (!row.lastLoginAt) return "Belum pernah masuk";
  return shortDateTime(row.lastLoginAt);
}

/** The account's sign-in state in words, for the detail. */
export function accountState(row: AccountRow): string {
  if (!row.hasAccount) return "Belum ada akun";
  if (!row.lastLoginAt) return "Akun siap, belum pernah masuk";
  return row.mustChangePassword ? "Sudah masuk, masih memakai password awal" : "Sudah masuk";
}

export type RoleGuideItem = { key: keyof typeof roleTones; label: string; does: string; combines: string[] | null };

/** What each role does and which go together (null: none); the rule itself lives in lib/pra-wam/roles. */
export const roleGuide: readonly RoleGuideItem[] = [
  { key: "peserta", label: "Peserta", does: "Book ruang, agenda dan dokumen sesi sendiri, absen QR. Dasar setiap akun.", combines: ["Panitia", "Admin WAM", "HOD", "BOD"] },
  { key: "panitia", label: "Panitia", does: "Kelola acara: sesi, permintaan jadwal, pengumuman; membatalkan booking siapa pun.", combines: ["Admin WAM", "HOD"] },
  { key: "admin", label: "Admin WAM", does: "Seperti Panitia, ditambah pengaturan aplikasi.", combines: ["Panitia", "HOD"] },
  { key: "ga", label: "Admin Booking", does: "Bagian administrasi: mengelola Booking Kantor (melihat dan membatalkan semua booking ruangan). Tidak mengubah apa pun di WAM.", combines: ["Panitia", "Admin WAM", "HOD"] },
  { key: "hod", label: "HOD", does: "Kepala departemen (bisa lebih dari satu), diatur super admin di Data karyawan. HOD bisa booking ruang sebagai HOD. Lead memimpin tim di bawah HOD, juga diatur di sana.", combines: ["Panitia", "Admin WAM"] },
  { key: "bod", label: "BOD", does: "Menu BOD: Ringkasan, Peserta, Survei; melihat semua sesi tanpa mengubah. Tetap bisa ikut sesi dan book ruang.", combines: null },
];

/** How many active people hold each role; peserta is everyone with an account. */
export function roleCounts(rows: readonly AccountRow[]): Record<RoleGuideItem["key"], number> {
  const active = rows.filter(row => row.active);
  return {
    peserta: active.filter(row => row.hasAccount).length,
    panitia: active.filter(row => row.roles.includes("panitia")).length,
    admin: active.filter(row => row.roles.includes("admin")).length,
    ga: active.filter(row => row.roles.includes("ga")).length,
    hod: active.filter(row => row.leads.length > 0).length,
    bod: active.filter(row => row.roles.includes("bod")).length,
  };
}
