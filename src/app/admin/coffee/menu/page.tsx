import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { CoffeeAdminFrame, waitingFor } from "@/components/coffee-admin/CoffeeAdminFrame";
import { COFFEE_ADMIN_LABEL, coffeeAdminSection } from "@/components/coffee-admin/sections";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminMenu } from "@/lib/server/coffee/menu";
import { readSettings } from "@/lib/server/coffee/settings";
import { isSupabaseConfigured, ServiceError } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const metadata = { title: `${coffeeAdminSection("menu").label} · ${COFFEE_ADMIN_LABEL}` };

/**
 * WG Coffee → Menu (F6): the drinks, to add, change, order, hide and delete. Before migration 1
 * runs the page says so like the others; before migration 202612020001 it shows the code's menu,
 * read only, with what it waits for.
 */
export default async function CoffeeAdminMenuPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  // readSettings(true): the same "menunggu migrasi" as every other Coffee page while the first migration has not run.
  const data = await Promise.all([adminMenu(), readSettings(true)]).catch(waitingFor);
  if (data instanceof ServiceError) return <CoffeeAdminFrame view="menu" notice={data.message} />;
  return <CoffeeAdminFrame view="menu" initial={{ menu: data[0] }} />;
}
