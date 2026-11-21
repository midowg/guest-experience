import { notFound } from "next/navigation";
import { CalendarDays, House, Images, UserRound } from "lucide-react";
import { DevFrame } from "@/components/main-wam/dev/DevFrame";
import { ScreenContent } from "@/components/main-wam/shell";
import { EmptyState } from "@/components/main-wam/ui";
import { mainWamPath } from "@/lib/routes";

export const dynamic = "force-dynamic";

const TABS = {
  beranda: { path: mainWamPath.home, title: "Beranda", icon: <House /> },
  agenda: { path: mainWamPath.agenda(), title: "Agenda", icon: <CalendarDays /> },
  momen: { path: mainWamPath.moments(), title: "Momen", icon: <Images /> },
  saya: { path: mainWamPath.me, title: "Saya", icon: <UserRound /> },
} as const;

/**
 * Fondasi's check of the four tab placeholders in the real frame (DevFrame), no sign-in, 404 in
 * production: ?layar=beranda|agenda|momen|saya&peran=peserta|panitia|bod|admin&waktu=pagi|….
 */
export default async function DevMainWamFoundation({ searchParams }: { searchParams: Promise<{ layar?: string; peran?: string; waktu?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { layar, peran, waktu } = await searchParams;
  const tab = TABS[(layar && layar in TABS ? layar : "beranda") as keyof typeof TABS];
  return <DevFrame path={tab.path} peran={peran} waktu={waktu}>
    <ScreenContent>
      <EmptyState icon={tab.icon} title={tab.title}>Sedang disiapkan.</EmptyState>
    </ScreenContent>
  </DevFrame>;
}
