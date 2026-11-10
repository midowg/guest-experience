import { redirect } from "next/navigation";
import { TvBoard } from "@/components/tv/TvBoard";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { praWamTvApi, tvAdminPath } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { tvFeed } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pratinjau · Admin TV" };

/**
 * Any admin: the board exactly as a TV plays it, in this window, with the admin's own session
 * instead of a TV's address. It plays what every TV plays (rows kept for one TV are left out, as
 * at the one address for all). Resize the window, or turn it tall, to see how each TV fits it.
 */
export default async function TvAdminPreviewPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  // Before the migration there is nothing to play: back to Admin TV, which says what it waits for.
  const feed = await tvFeed(praWamTvApi.slideImage).catch(() => null);
  if (!feed) redirect(tvAdminPath.home);
  return <TvBoard initial={feed} feedUrl={praWamTvApi.feed} />;
}
