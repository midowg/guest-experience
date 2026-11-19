import { notFound } from "next/navigation";
import { SuperAdminFrame } from "@/components/admin/super/SuperAdminFrame";
import { HomeStyleSettings } from "@/components/admin/super/HomeStyleSettings";
import { HomeMenuSettings } from "@/components/admin/super/HomeMenuSettings";
import { Card, PageHeader } from "@/components/console";
import { defaultHomeMenu } from "@/lib/home-menu";
import css from "@/components/admin/super/home-style.module.css";

export const dynamic = "force-dynamic";

/** Layout check for Super admin → Halaman utama, with the default menu. Saving is refused without a session. */
export default function DevHomeAdminPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SuperAdminFrame current="beranda">
    <PageHeader title="Halaman utama" subtitle="Tampilan journey.werkudara.group dan aplikasi di menunya. Halaman tamu tidak ikut berubah." />
    <div className={css.page}>
      <Card title="Tampilan" id="home-style"><HomeStyleSettings initial="lampu" migrated /></Card>
      <HomeMenuSettings initial={defaultHomeMenu} migrated />
    </div>
  </SuperAdminFrame>;
}
