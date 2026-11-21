import { notFound } from "next/navigation";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { SuperAdminFrame } from "@/components/admin/super/SuperAdminFrame";
import { HomeStyleSettings } from "@/components/admin/super/HomeStyleSettings";
import { HomeMenuSettings } from "@/components/admin/super/HomeMenuSettings";
import { MainWamVisibilitySettings } from "@/components/admin/super/MainWamVisibility";
import { Card, PageHeader } from "@/components/console";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { getHomeMenu, getHomeStyle } from "@/lib/server/admin-settings";
import { getMainWamVisibility } from "@/lib/server/main-wam-visibility";
import css from "@/components/admin/super/home-style.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Halaman utama · Super admin" };

/** Super admin: the front page (journey.werkudara.group): its look, the apps in its menu, and whether Main WAM shows in Journey. */
export default async function SuperHomeStylePage() {
  if ((await requireAdminPage()) !== "super") notFound();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [{ style, migrated }, menu, mainWam] = await Promise.all([getHomeStyle(), getHomeMenu(), getMainWamVisibility()]);
  return <SuperAdminFrame current="beranda">
    <PageHeader title="Halaman utama" subtitle="Tampilan journey.werkudara.group dan aplikasi di menunya. Halaman tamu tidak ikut berubah." />
    <div className={css.page}>
      <Card title="Tampilan" id="home-style"><HomeStyleSettings initial={style} migrated={migrated} /></Card>
      <HomeMenuSettings initial={menu.menu} migrated={menu.migrated} />
      <Card title="WAM 2026" id="wam2026"><MainWamVisibilitySettings initial={mainWam} /></Card>
    </div>
  </SuperAdminFrame>;
}
