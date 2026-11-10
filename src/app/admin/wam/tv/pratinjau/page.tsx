import { redirect } from "next/navigation";
import { tvAdminPath } from "@/lib/routes";
import { requireAdminPage } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

/** The board's preview moved to Admin TV with the rest of TV Announcement (10 Nov 2026). */
export default async function WamTvPreviewPage() {
  await requireAdminPage();
  redirect(tvAdminPath.preview);
}
