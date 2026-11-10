import { redirect } from "next/navigation";
import { TvBoard } from "@/components/tv/TvBoard";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { praWamTvApi, wamAdminPath } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { tvFeed } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pratinjau TV · Admin WAM" };

/**
 * Any admin: the board exactly as a TV plays it, in this window, with the admin's own session
 * instead of a TV key. Resize the window (or turn it tall) to see how each TV fits it.
 */
export default async function WamTvPreviewPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  // Before the migration there is nothing to play: back to the section, which says what it waits for.
  const feed = await tvFeed(praWamTvApi.slideImage).catch(() => null);
  if (!feed) redirect(wamAdminPath.tv);
  return <TvBoard initial={feed} feedUrl={praWamTvApi.feed} />;
}
