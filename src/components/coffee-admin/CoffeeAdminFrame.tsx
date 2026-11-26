import admin from "@/components/admin/admin.module.css";
import { currentAdmin } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";
import { CoffeeAdminApp, type CoffeeAdminInitial } from "./CoffeeAdminApp";
import { CoffeeAdminWaiting } from "./CoffeeAdminNav";
import type { CoffeeAdminSectionKey } from "./sections";

/** Before the migration a 503 says what it waits for; anything else is a real error. */
export const waitingFor = (error: unknown): ServiceError => {
  if (error instanceof ServiceError && error.status === 503) return error;
  throw error;
};

/**
 * Every WG Coffee admin page (/admin/coffee, …/rekap, …/pengaturan). The page checks the
 * session itself (requireAdminPage: the "coffee" grant, or the super admin) and reads its own
 * section's data; this hands it to the one screen that holds all three sections (CoffeeAdminApp).
 * `notice`: what the page waits for (the migration), shown in the frame instead of the screen.
 */
export async function CoffeeAdminFrame({ view, initial, notice, openManual }: {
  view: CoffeeAdminSectionKey; initial?: CoffeeAdminInitial; notice?: string; openManual?: boolean;
}) {
  const actor = await currentAdmin();
  const superAdmin = actor?.role === "super";
  if (notice) return <CoffeeAdminWaiting current={view} notice={notice} superAdmin={superAdmin} personName={actor?.name} className={admin.shell} />;
  return <CoffeeAdminApp view={view} initial={initial} now={new Date().toISOString()} personName={actor?.name} superAdmin={superAdmin} openManual={openManual} />;
}
