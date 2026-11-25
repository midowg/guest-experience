import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { CoffeeAdminFrame, waitingFor } from "@/components/coffee-admin/CoffeeAdminFrame";
import { COFFEE_ADMIN_LABEL, coffeeAdminSection } from "@/components/coffee-admin/sections";
import { requireAdminPage } from "@/lib/server/admin-session";
import { queue } from "@/lib/server/coffee/queue";
import { coffeeActor } from "@/lib/server/coffee/session";
import { isSupabaseConfigured, ServiceError } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const metadata = { title: `${coffeeAdminSection("antrean").label} · ${COFFEE_ADMIN_LABEL}` };

/** Werkudara Coffee → Antrean (25 Nov 2026): the orders that wait; ?catat=1 opens Catat manual. */
export default async function CoffeeAdminQueuePage({ searchParams }: { searchParams: Promise<{ catat?: string }> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [{ catat }, data] = await Promise.all([searchParams, queue(await coffeeActor()).catch(waitingFor)]);
  if (data instanceof ServiceError) return <CoffeeAdminFrame view="antrean" notice={data.message} />;
  return <CoffeeAdminFrame view="antrean" initial={{ queue: data }} openManual={catat === "1"} />;
}
