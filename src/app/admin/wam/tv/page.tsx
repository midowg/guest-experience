import { redirect } from "next/navigation";
import { wamSection } from "@/components/admin/wam/sections";
import { tvAdminPath } from "@/lib/routes";
import { requireAdminPage } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
export const metadata = { title: `${wamSection("tv").label} · Admin WAM` };

/**
 * Admin WAM → TV Announcement: the menu item stays, and leads to Admin TV (10 Nov 2026), TV
 * Announcement's own admin. The old tabs lead to the places that took them over.
 */
export default async function WamTvPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  await requireAdminPage();
  const tab = (await searchParams).tab;
  redirect(tab === "tayangan" ? tvAdminPath.playlist : tab === "tampilan" ? tvAdminPath.look : tvAdminPath.home);
}
