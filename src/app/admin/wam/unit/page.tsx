import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PraWamUnits } from "@/components/admin/wam/PraWamUnits";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { wamSection } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { listPeople } from "@/lib/server/pra-wam/appraisal";
import { listUnits } from "@/lib/server/pra-wam/units";

export const dynamic = "force-dynamic";
export const metadata = { title: `${wamSection("unit").label} · Admin WAM` };

/**
 * Any admin: the WAM units from the "Unit dan jabatan" sheet. It reads the Data karyawan workbook
 * but writes only units and memberships; only names travel to the browser, never NIP.
 */
export default async function WamUnitsPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [units, people] = await Promise.all([listUnits(), listPeople()]);
  return <WamAdminFrame current="unit">
    <PraWamUnits initialUnits={units.units} initialMemberships={units.memberships} migrated={units.migrated} people={people.map(person => ({ id: person.id, name: person.name }))} />
  </WamAdminFrame>;
}
