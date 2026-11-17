import type { PageTab } from "@/components/console";
import { mainWamAdminPath } from "@/lib/routes";

/*
 * The tabs of Admin WAM → Main WAM's content pages (fondasi), so agen E and D draw the same row:
 *   <PageTabs tabs={mainWamContentTabs} current="kamar" label="Isi acara" />
 * Every page also sits in the menu under its owner (sections.ts: mw-isi, mw-modul).
 */
export const mainWamContentTabs: readonly PageTab[] = [
  { key: "rundown", label: "Rundown", href: mainWamAdminPath.rundown },
  { key: "kelompok", label: "Kelompok", href: mainWamAdminPath.groups },
  { key: "kamar", label: "Kamar", href: mainWamAdminPath.rooms },
  { key: "perjalanan", label: "Perjalanan", href: mainWamAdminPath.travel },
  { key: "panduan", label: "Panduan", href: mainWamAdminPath.guides },
];
export const mainWamModuleTabs: readonly PageTab[] = [
  { key: "awarding", label: "Awarding", href: mainWamAdminPath.awards },
  { key: "silent-meeting", label: "Silent Meeting", href: mainWamAdminPath.silent },
];
