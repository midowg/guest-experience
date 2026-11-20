import { ExternalLink, EyeOff, UsersRound } from "lucide-react";
import { Notice } from "@/components/ui";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { Card, ConsoleButtonLink, ListRow, PageHeader, RowList, StatCard, StatRow } from "@/components/console";
import { WamAcaraFrame } from "@/components/admin/wam-acara/WamAcaraFrame";
import { wamAcaraCrumbs, wamAcaraSection, wamAcaraSections } from "@/components/admin/wam-acara/sections";
import { WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";
import { activeModules, activeModulesLabel } from "@/lib/main-wam/modules";
import { defaultSettings } from "@/lib/main-wam/settings";
import { mainWamModeLabels } from "@/lib/main-wam/types";
import { dateRange } from "@/lib/pra-wam/about";
import { mainWamAdminPath, mainWamPath } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { getMainWamVisibility } from "@/lib/server/main-wam-visibility";
import { listTesters, mainWamSettingsState } from "@/lib/server/main-wam/settings";
import { listWamStaff } from "@/lib/server/main-wam/staff";

export const dynamic = "force-dynamic";
export const metadata = { title: WAM_EVENT_ADMIN_LABEL };

/**
 * Admin WAM 2027 → Ringkasan (20 Nov 2026, KONTRAK §15): where Main WAM stands (mode, modules, penguji,
 * Panitia WAM, shown in Journey or not) and a way into every part. Each part that cannot be read yet
 * (a migration) says so.
 */
export default async function WamAcaraHomePage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [settings, testers, staff, visibility] = await Promise.all([
    mainWamSettingsState().catch(() => defaultSettings()),
    listTesters().catch(() => ({ testers: [], migrated: false })),
    listWamStaff().catch(() => ({ staff: [], migrated: false, event: null })),
    getMainWamVisibility(),
  ]);
  const on = activeModules(settings.modules);
  const event = settings.event;
  const subtitle = [event.name, event.startDate && event.endDate ? dateRange(event.startDate, event.endDate) : ""].filter(Boolean).join(" · ");

  return <WamAcaraFrame current="ringkasan">
    <PageHeader crumbs={wamAcaraCrumbs("ringkasan")} title={wamAcaraSection("ringkasan").label} subtitle={subtitle || "Aplikasi selama acara WAM."}
      actions={<ConsoleButtonLink href={mainWamPath.home} target="_blank" rel="noopener" icon={<ExternalLink size={18} aria-hidden />}>Buka Main WAM<span className="sr-only"> (tab baru)</span></ConsoleButtonLink>} />
    {!staff.migrated && <Notice tone="warning">Panitia WAM menunggu migrasi <code>202611200603_admin_wam_acara.sql</code>. Sampai itu Main WAM belum punya panitia, dan hanya super admin yang bisa membuka {WAM_EVENT_ADMIN_LABEL}.</Notice>}
    {!visibility.shown && <Notice tone="info">Main WAM masih tersembunyi dari Journey: /wam selalu membuka Pra WAM, dan notifikasi Main WAM hanya sampai ke penguji dan Panitia WAM. Super admin yang menampilkannya (Super admin → Halaman utama). Admin ini tidak terpengaruh.</Notice>}

    <StatRow label="Angka penting">
      <StatCard label="Mode acara" value={mainWamModeLabels[settings.mode]} note={settings.mode === "semua" ? "Terbuka untuk semua orang" : settings.mode === "uji" ? "Hanya penguji" : "Main WAM belum dibuka"} href={mainWamAdminPath.settings} />
      <StatCard label="Modul aktif" value={on.length} note={activeModulesLabel(settings.modules)} href={mainWamAdminPath.settings} />
      <StatCard label="Panitia WAM" value={staff.staff.length} icon={<UsersRound size={18} />} note={staff.migrated ? "Panitia acara WAM, terpisah dari Pra WAM" : "Menunggu migrasi"} href={mainWamAdminPath.committee} />
      <StatCard label="Penguji" value={testers.testers.length} note="Di luar Panitia WAM" href={mainWamAdminPath.settings} />
      <StatCard label="Di Journey" value={visibility.shown ? "Tampil" : "Tersembunyi"} icon={visibility.shown ? undefined : <EyeOff size={18} />} note="Diatur super admin" />
    </StatRow>

    <Card title="Semua bagian" id="semua-bagian">
      <RowList label={`Bagian ${WAM_EVENT_ADMIN_LABEL}`}>{wamAcaraSections.filter(section => section.key !== "ringkasan").map(section => {
        const Icon = section.icon;
        return <ListRow key={section.key} icon={<Icon size={18} />} tone="neutral" title={section.owner ? `${wamAcaraSection(section.owner).label} · ${section.label}` : section.label} sub={section.summary} href={section.href} />;
      })}</RowList>
    </Card>
  </WamAcaraFrame>;
}
