import { notFound } from "next/navigation";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { WellbeingAdmin } from "@/components/wellbeing-admin/WellbeingAdmin";
import { currentAdmin } from "@/lib/server/admin-actor";
import { requireAdminPage } from "@/lib/server/admin-session";
import { isSupabaseConfigured } from "@/lib/server/config";
import { WELLBEING_ADMIN_SECTIONS } from "@/lib/routes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin Wellbeing", robots: { index: false, follow: false } };

/**
 * Admin Wellbeing (16 Nov 2026): one page for every address under /admin/wlm. The server only
 * checks the admin (and its Wellbeing grant, from the path); the client app moves between its menus
 * and loads data through /api/admin/wellbeing without another page load.
 */
export default async function WellbeingAdminPage({ params }: { params: Promise<{ section?: string[] }> }) {
  await requireAdminPage();
  const { section = [] } = await params;
  if (section.length > 1 || (section[0] && !(WELLBEING_ADMIN_SECTIONS as readonly string[]).includes(section[0]))) notFound();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const actor = await currentAdmin();
  const person = actor?.kind === "super" ? { name: "Super admin", sub: "Wellbeing" } : { name: actor?.name || "Admin", sub: "Wellbeing" };
  return <WellbeingAdmin person={person} />;
}
