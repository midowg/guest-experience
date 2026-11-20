import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { GuidesEditor } from "@/components/admin/wam-acara/isi/GuidesEditor";
import { WamAcaraFrame } from "@/components/admin/wam-acara/WamAcaraFrame";
import { WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";
import { wamAcaraCrumbs } from "@/components/admin/wam-acara/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminGuides } from "@/lib/server/main-wam/admin/guides";

export const dynamic = "force-dynamic";
export const metadata = { title: `Panduan · ${WAM_EVENT_ADMIN_LABEL}` };

/** Admin WAM 2027 → Panduan (agen E, docs/main-wam/KONTRAK.md §6): any Admin WAM 2027 admin; files in private storage. */
export default async function PanduanAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const board = await adminGuides();
  return <WamAcaraFrame current="panduan">
    <GuidesEditor initial={{ guides: board.guides, links: board.links, storage: board.storage }} migrated={board.migrated} crumbs={wamAcaraCrumbs("panduan")} title="Panduan" />
  </WamAcaraFrame>;
}
