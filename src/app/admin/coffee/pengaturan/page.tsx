import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { CoffeeAdminFrame, waitingFor } from "@/components/coffee-admin/CoffeeAdminFrame";
import { COFFEE_ADMIN_LABEL, coffeeAdminSection } from "@/components/coffee-admin/sections";
import { requireAdminPage } from "@/lib/server/admin-session";
import { holders } from "@/lib/server/coffee/people";
import { gaPinSet } from "@/lib/server/coffee/pin";
import { drinkSettings, readSettings } from "@/lib/server/coffee/settings";
import { isSupabaseConfigured, ServiceError } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const metadata = { title: `${coffeeAdminSection("pengaturan").label} · ${COFFEE_ADMIN_LABEL}` };

/** WG Coffee → Pengaturan: the monthly quotas, which options a drink is asked with, the PIN GA (only whether one is set), who holds the access, and the rooms. */
export default async function CoffeeAdminSettingsPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const data = await Promise.all([readSettings(true), holders(), gaPinSet(), drinkSettings()]).catch(waitingFor);
  if (data instanceof ServiceError) return <CoffeeAdminFrame view="pengaturan" notice={data.message} />;
  return <CoffeeAdminFrame view="pengaturan" initial={{ settings: { settings: data[0], holders: data[1], gaPin: data[2], ...data[3] } }} />;
}
