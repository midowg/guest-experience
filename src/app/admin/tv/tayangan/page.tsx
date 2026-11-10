import { Notice } from "@/components/ui";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { TvAdminFrame, tvAdminCrumbs, tvAdminLabel } from "@/components/admin/tv/TvAdminFrame";
import { TvPlaylist } from "@/components/admin/tv/TvPlaylist";
import { PraWamTv } from "@/components/admin/wam/PraWamTv";
import { shareUrl } from "@/lib/site-url";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { TV_ITEMS_MIGRATION, tvAdmin } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tayangan · Admin TV" };

/**
 * Any admin: the playlist. Before its migration there is no playlist yet: the page says so and
 * shows what there was before (the two calendars' switches and the pictures), which still works.
 */
export default async function TvAdminPlaylistPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const data = await tvAdmin();
  return <TvAdminFrame current="tayangan">
    {data.items
      ? <TvPlaylist initial={data} crumbs={tvAdminCrumbs("tayangan")} title={tvAdminLabel("tayangan")} />
      : <>
        {data.migrated && <Notice tone="warning">Daftar tayangan (susunan bebas, template Timeline, pengumuman, teks, jadwal tayang, dan isi per TV) menunggu migrasi {TV_ITEMS_MIGRATION}. Jalankan di Supabase SQL Editor. Sampai itu, TV tetap menayangkan kalender lalu gambar seperti di bawah.</Notice>}
        <PraWamTv initial={data} crumbs={tvAdminCrumbs("tayangan")} title={tvAdminLabel("tayangan")} origin={shareUrl().origin} view="tayangan" standalone />
      </>}
  </TvAdminFrame>;
}
