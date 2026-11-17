import { NotificationsScreen } from "@/components/main-wam/peserta/notifikasi/NotificationsScreen";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";
import { loadNotifications } from "@/lib/server/main-wam/peserta/saya";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifikasi · WAM", robots: { index: false } };

/** N01 Notifikasi (from Beranda's bell). Owner A (peserta); the gate first; only the person's own notes. */
export default async function NotificationsPage() {
  const context = await requireMainWamPage(mainWamPath.notifications);
  const data = await loadNotifications(context, new Date());
  return <NotificationsScreen {...data} />;
}
