import { notFound } from "next/navigation";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { SuperAdminFrame } from "@/components/admin/super/SuperAdminFrame";
import { HomeStyleSettings } from "@/components/admin/super/HomeStyleSettings";
import { PageHeader } from "@/components/console";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { getHomeStyle } from "@/lib/server/admin-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Halaman utama · Super admin" };

/** Super admin: the look of the front page (journey.werkudara.group). */
export default async function SuperHomeStylePage() {
  if ((await requireAdminPage()) !== "super") notFound();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const { style, migrated } = await getHomeStyle();
  return <SuperAdminFrame current="beranda">
    <PageHeader title="Halaman utama" subtitle="Tampilan journey.werkudara.group: pintu ke aplikasi tim. Halaman tamu tidak ikut berubah." />
    <HomeStyleSettings initial={style} migrated={migrated} />
  </SuperAdminFrame>;
}
