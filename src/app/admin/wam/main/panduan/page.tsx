import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { GuidesEditor } from "@/components/admin/wam/main-wam/isi/GuidesEditor";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { wamCrumbs } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminGuides } from "@/lib/server/main-wam/admin/guides";

export const dynamic = "force-dynamic";
export const metadata = { title: "Panduan · Main WAM · Admin WAM" };

/** Admin WAM → Main WAM → Panduan (agen E, docs/main-wam/KONTRAK.md §6): any Admin WAM admin; files in private storage. */
export default async function PanduanAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const board = await adminGuides();
  return <WamAdminFrame current="mw-panduan">
    <GuidesEditor initial={{ guides: board.guides, links: board.links, storage: board.storage }} migrated={board.migrated} crumbs={wamCrumbs("mw-panduan")} title="Main WAM · Panduan" />
  </WamAdminFrame>;
}
