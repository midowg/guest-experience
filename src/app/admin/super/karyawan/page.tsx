import { redirect } from "next/navigation";
import { employeesAdminPath } from "@/lib/routes";

/** Data karyawan moved out of Super admin into its own admin app (27 Nov 2026); old links land in the right part. */
export default async function OldEmployeesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab;
  redirect(tab === "struktur" ? employeesAdminPath.structure : tab === "impor" ? employeesAdminPath.import : employeesAdminPath.home);
}
