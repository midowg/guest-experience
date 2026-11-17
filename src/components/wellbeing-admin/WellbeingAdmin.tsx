"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ClipboardCheck, Crown, FileSpreadsheet, House, Settings2, Users } from "lucide-react";
import { ConsoleLogoutButton, ConsoleShell, ConsoleTheme, type ConsoleNavGroup } from "@/components/console";
import admin from "@/components/admin/admin.module.css";
import { prefetch, useResource } from "@/components/app-shell/resource";
import { ToastProvider } from "@/components/app-shell/Toast";
import { ADMIN_HOME, ADMIN_LOGIN, ADMIN_LOGOUT_API, WELLBEING_ADMIN, WELLBEING_ADMIN_SECTIONS, type WellbeingAdminSection } from "@/lib/routes";
import { wb } from "./api";
import { ExportPanel, LaporanView, type ExportPreset } from "./LaporanView";
import { PeopleView } from "./PeopleView";
import { PersonPanel, PointsPanel } from "./PeoplePanels";
import { ReviewView } from "./ReviewView";
import { SettingsView } from "./SettingsView";
import { TodayView } from "./TodayView";
import css from "./wellbeing-admin.module.css";

/*
 * Admin Wellbeing (16 Nov 2026): one client app under /admin/wellbeing. The frame (menu, header)
 * stays; moving between Hari ini, Periksa, Karyawan and Pengaturan only swaps the content, from data
 * kept in memory and refreshed in the background (resource.ts). Forms and details open in panels.
 * Every address still opens directly (the page is a catch-all), and Back/Forward work.
 */

const labels: Record<WellbeingAdminSection, string> = { "hari-ini": "Hari ini", periksa: "Periksa", karyawan: "Karyawan", laporan: "Laporan", pengaturan: "Pengaturan" };
export const sectionOf = (pathname: string, base = WELLBEING_ADMIN): WellbeingAdminSection | null => {
  if (pathname === base || pathname === `${base}/`) return "hari-ini";
  if (!pathname.startsWith(`${base}/`)) return null;
  const part = pathname.slice(base.length + 1).split("/")[0];
  return (WELLBEING_ADMIN_SECTIONS as readonly string[]).includes(part) ? part as WellbeingAdminSection : null;
};
const pathIn = (base: string) => (section: WellbeingAdminSection = "hari-ini") => section === "hari-ini" ? base : `${base}/${section}`;
/** What each menu fetches, so a pointer on it starts loading before the click. */
const warm: Record<WellbeingAdminSection, () => void> = {
  "hari-ini": () => prefetch(wb.overview.key, wb.overview.fetch),
  periksa: () => { const r = wb.activities({ filter: "unchecked", kind: "all", q: "" }); prefetch(r.key, r.fetch); },
  karyawan: () => { const r = wb.people("month"); prefetch(r.key, r.fetch); },
  laporan: () => { prefetch(wb.overview.key, wb.overview.fetch); const r = wb.people("month"); prefetch(r.key, r.fetch); },
  pengaturan: () => { prefetch(wb.catalog.key, wb.catalog.fetch); prefetch(wb.settings.key, wb.settings.fetch); },
};

type Actions = {
  openPoints: (employeeIds?: string[]) => void; openPerson: (id: string) => void; go: (section: WellbeingAdminSection) => void;
  /** Laporan → Unduh Excel, from anywhere (preset: what to export, or the activities ticked in Periksa). */
  openExport: (preset?: ExportPreset) => void;
  /** The address of a menu (the real admin, or the dev preview). */
  pathOf: (section?: WellbeingAdminSection) => string;
};
const ActionsContext = createContext<Actions>({ openPoints: () => {}, openPerson: () => {}, go: () => {}, openExport: () => {}, pathOf: pathIn(WELLBEING_ADMIN) });
export const useWbActions = () => useContext(ActionsContext);

export function WellbeingAdmin({ person, basePath = WELLBEING_ADMIN }: { person: { name: string; sub?: string }; basePath?: string }) {
  const pathname = usePathname();
  const section = sectionOf(pathname, basePath) ?? "hari-ini";
  const pathOf = useMemo(() => pathIn(basePath), [basePath]);
  const [exporting, setExporting] = useState<{ open: boolean; preset: ExportPreset; round: number }>({ open: false, preset: {}, round: 0 });
  const overview = useResource(wb.overview.key, wb.overview.fetch);
  const [points, setPoints] = useState<{ open: boolean; ids: string[]; round: number }>({ open: false, ids: [], round: 0 });
  const [personId, setPersonId] = useState<string | null>(null);

  const go = useCallback((target: WellbeingAdminSection) => {
    const href = pathOf(target);
    if (window.location.pathname !== href) window.history.pushState(null, "", href);
    document.getElementById("main")?.scrollTo?.({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [pathOf]);

  // Links inside the app (menu, cards, search) move without a page load.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      const target = url.origin === window.location.origin ? sectionOf(url.pathname, basePath) : null;
      if (!target) return;
      event.preventDefault();
      go(target);
    }
    function onPointer(event: PointerEvent) {
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      const target = anchor ? sectionOf(new URL(anchor.href, window.location.href).pathname, basePath) : null;
      if (target) warm[target]();
    }
    document.addEventListener("click", onClick);
    document.addEventListener("pointerover", onPointer);
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("pointerover", onPointer); };
  }, [go, basePath]);

  useEffect(() => { document.title = `${labels[section]} · Admin Wellbeing`; }, [section]);

  const unchecked = overview.data?.unchecked ?? 0;
  const nav: ConsoleNavGroup[] = useMemo(() => [
    { label: "Wellbeing", items: [
      { key: "hari-ini", label: "Hari ini", href: pathOf("hari-ini"), icon: <House size={20} /> },
      { key: "periksa", label: "Periksa", href: pathOf("periksa"), icon: <ClipboardCheck size={20} />, ...(unchecked ? { badge: String(unchecked), badgeLabel: "belum diperiksa" } : {}) },
      { key: "karyawan", label: "Karyawan", href: pathOf("karyawan"), icon: <Users size={20} /> },
      { key: "laporan", label: "Laporan", href: pathOf("laporan"), icon: <FileSpreadsheet size={20} /> },
      { key: "pengaturan", label: "Pengaturan", href: pathOf("pengaturan"), icon: <Settings2 size={20} /> },
    ] },
  ], [unchecked, pathOf]);

  const actions = useMemo<Actions>(() => ({
    openPoints: (ids = []) => setPoints(current => ({ open: true, ids, round: current.round + 1 })), openPerson: id => setPersonId(id), go, pathOf,
    openExport: (preset = {}) => setExporting(current => ({ open: true, preset, round: current.round + 1 })),
  }), [go, pathOf]);
  let view: ReactNode;
  if (section === "periksa") view = <ReviewView />;
  else if (section === "karyawan") view = <PeopleView />;
  else if (section === "laporan") view = <LaporanView />;
  else if (section === "pengaturan") view = <SettingsView />;
  else view = <TodayView />;

  return <ToastProvider>
    <ActionsContext.Provider value={actions}>
      <ConsoleShell theme="admin" area="Admin Wellbeing" storageKey="wellbeing-admin" className={admin.shell}
        person={{ name: person.name, sub: person.sub }} groups={nav} current={section} pageTitle={labels[section]}
        footerLinks={[{ key: "events", label: "Semua aplikasi Journey", href: ADMIN_HOME, icon: <Crown size={20} /> }]}
        footer={<ConsoleLogoutButton endpoint={ADMIN_LOGOUT_API} redirectTo={ADMIN_LOGIN} />}>
        <div key={section} className={css.view}>{view}</div>
      </ConsoleShell>
      {/* The panels sit outside the shell's DOM, so they get the same console colours here. */}
      <ConsoleTheme theme="admin" className={css.panelHost}>
        <PointsPanel round={points.round} open={points.open} initialIds={points.ids} onClose={() => setPoints(current => ({ ...current, open: false }))} />
        <PersonPanel id={personId} onClose={() => setPersonId(null)} />
        <ExportPanel key={exporting.round} open={exporting.open} preset={exporting.preset} onClose={() => setExporting(current => ({ ...current, open: false }))} />
      </ConsoleTheme>
    </ActionsContext.Provider>
  </ToastProvider>;
}
