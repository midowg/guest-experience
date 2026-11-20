import { ExternalLink, UsersRound } from "lucide-react";
import { Notice } from "@/components/ui";
import { Card, ConsoleButtonLink, ListRow, PageHeader, RowList, StatCard, StatRow } from "@/components/console";
import { WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";
import { activeModules, activeModulesLabel } from "@/lib/main-wam/modules";
import { mainWamModeLabels, type MainWamSettings } from "@/lib/main-wam/types";
import { dateRange } from "@/lib/pra-wam/about";
import { mainWamAdminPath, mainWamPath } from "@/lib/routes";
import { wamAcaraCrumbs, wamAcaraSection, wamAcaraSections } from "./sections";

export type WamAcaraHomeView = {
  settings: Pick<MainWamSettings, "mode" | "modules" | "event">;
  testers: number;
  staff: { count: number; migrated: boolean };
  /** Main WAM shown in the app by the super admin (KONTRAK §14). */
  shown: boolean;
};

/**
 * Admin WAM 2027 → Ringkasan (20 Nov 2026, KONTRAK §15): where Main WAM stands (mode, modules, Panitia WAM,
 * penguji; a note while it is hidden in the app) and a way into every part. The page reads; this draws (and the
 * dev-preview draws it with sample numbers).
 */
export function WamAcaraHome({ settings, testers, staff, shown }: WamAcaraHomeView) {
  const on = activeModules(settings.modules);
  const event = settings.event;
  const subtitle = [event.name, event.startDate && event.endDate ? dateRange(event.startDate, event.endDate) : ""].filter(Boolean).join(" · ");
  return <>
    <PageHeader crumbs={wamAcaraCrumbs("ringkasan")} title={wamAcaraSection("ringkasan").label} subtitle={subtitle || "Aplikasi selama acara WAM."}
      actions={<ConsoleButtonLink href={mainWamPath.home} target="_blank" rel="noopener" icon={<ExternalLink size={18} aria-hidden />}>Buka Main WAM<span className="sr-only"> (tab baru)</span></ConsoleButtonLink>} />
    {!staff.migrated && <Notice tone="warning">Panitia WAM menunggu migrasi <code>202611200603</code> (admin_wam_acara). Sampai itu Main WAM belum punya panitia, dan hanya super admin yang bisa membuka {WAM_EVENT_ADMIN_LABEL}.</Notice>}
    {!shown && <Notice tone="info">Main WAM masih tersembunyi di aplikasi: /wam selalu membuka Pra WAM, dan notifikasi Main WAM hanya sampai ke penguji dan Panitia WAM. Super admin yang menampilkannya (Super admin → Halaman utama). Admin ini tidak terpengaruh.</Notice>}

    <StatRow label="Angka penting">
      <StatCard label="Mode acara" value={mainWamModeLabels[settings.mode]} note={settings.mode === "semua" ? "Terbuka untuk semua orang" : settings.mode === "uji" ? "Hanya penguji" : "Main WAM belum dibuka"} href={mainWamAdminPath.settings} />
      <StatCard label="Modul aktif" value={on.length} note={activeModulesLabel(settings.modules)} href={mainWamAdminPath.settings} />
      <StatCard label="Panitia WAM" value={staff.count} icon={<UsersRound size={18} />} note={staff.migrated ? "Terpisah dari panitia Pra WAM" : "Menunggu migrasi"} href={mainWamAdminPath.committee} />
      <StatCard label="Penguji" value={testers} note="Di luar Panitia WAM" href={mainWamAdminPath.settings} />
    </StatRow>

    <Card title="Semua bagian" id="semua-bagian">
      <RowList label={`Bagian ${WAM_EVENT_ADMIN_LABEL}`}>{wamAcaraSections.filter(section => section.key !== "ringkasan").map(section => {
        const Icon = section.icon;
        return <ListRow key={section.key} icon={<Icon size={18} />} tone="neutral" title={section.owner ? `${wamAcaraSection(section.owner).label} · ${section.label}` : section.label} sub={section.summary} href={section.href} />;
      })}</RowList>
    </Card>
  </>;
}
