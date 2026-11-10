import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PageHeader, PageTabs } from "@/components/console";
import { PraWamRooms, type RoomsView } from "@/components/admin/wam/PraWamRooms";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { wamCrumbs, wamSection } from "@/components/admin/wam/sections";
import { wamAdminPath } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { listAccounts } from "@/lib/server/pra-wam/accounts";
import { listRooms } from "@/lib/server/pra-wam/appraisal";
import { leadOptions } from "@/lib/server/pra-wam/leads";
import { appSettings } from "@/lib/server/pra-wam/rooms";

export const dynamic = "force-dynamic";
export const metadata = { title: `${wamSection("ruang").label} · Admin WAM` };

/** The two tabs, on the page's own address: ?tab=denah opens the plan. */
const tabs: { key: RoomsView; label: string; href: string }[] = [
  { key: "daftar", label: "Daftar ruang", href: wamAdminPath.rooms },
  { key: "denah", label: "Denah", href: `${wamAdminPath.rooms}?tab=denah` },
];

/** Any admin: the rooms as cards, the office floor plan, and whether Book shows the plan. */
export default async function WamRoomsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const view: RoomsView = (await searchParams).tab === "denah" ? "denah" : "daftar";
  // The rooms arrive with the accounts' migration (202611040001); before it there is nothing to list.
  const { migrated } = await listAccounts();
  // The departments of Data karyawan, for "Khusus departemen" (10 Nov 2026).
  const [rooms, settings, departments] = await Promise.all([migrated ? listRooms() : [], appSettings(), leadOptions().then(options => options.departments).catch(() => [])]);
  const tab = tabs.find(item => item.key === view)!;
  return <WamAdminFrame current="ruang" wide>
    <PageHeader crumbs={wamCrumbs("ruang", tab.label)} title={wamSection("ruang").label}
      subtitle="Tambah ruang, atur kapasitas, fasilitas, spot di denah, dan departemen yang boleh memakainya." />
    <PageTabs tabs={tabs} current={view} label="Bagian ruang dan denah" />
    <PraWamRooms initialRooms={rooms} initialSettings={settings} roomsReady={migrated} view={view} departments={departments} />
  </WamAdminFrame>;
}
