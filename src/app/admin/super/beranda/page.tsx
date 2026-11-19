import { notFound } from "next/navigation";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { SuperAdminFrame } from "@/components/admin/super/SuperAdminFrame";
import { HomeStyleSettings } from "@/components/admin/super/HomeStyleSettings";
import { HomeMenuSettings } from "@/components/admin/super/HomeMenuSettings";
import { Card, PageHeader } from "@/components/console";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { getHomeMenu, getHomeStyle } from "@/lib/server/admin-settings";
import css from "@/components/admin/super/home-style.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Halaman utama · Super admin" };

/** Super admin: the front page (journey.werkudara.group): its look, and the apps in its menu. */
export default async function SuperHomeStylePage() {
  if ((await requireAdminPage()) !== "super") notFound();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [{ style, migrated }, menu] = await Promise.all([getHomeStyle(), getHomeMenu()]);
  return <SuperAdminFrame current="beranda">
    <PageHeader title="Halaman utama" subtitle="Tampilan journey.werkudara.group dan aplikasi di menunya. Halaman tamu tidak ikut berubah." />
    <div className={css.page}>
      <Card title="Tampilan" id="home-style"><HomeStyleSettings initial={style} migrated={migrated} /></Card>
      <HomeMenuSettings initial={menu.menu} migrated={menu.migrated} />
    </div>
  </SuperAdminFrame>;
}
