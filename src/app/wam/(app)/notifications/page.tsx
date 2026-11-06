import { NotificationList } from "@/components/pra-wam/Notifications";
import { Notice } from "@/components/ui";
import { praWamPath } from "@/lib/routes";
import { myNotifications } from "@/lib/server/pra-wam/announcements";
import { hodInvitesBySession } from "@/lib/server/pra-wam/hod";
import { requireMemberPage } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifikasi · WAM", robots: { index: false } };

export default async function NotificationsPage() {
  const member = await requireMemberPage(praWamPath.notifications);
  const { items, migrated } = await myNotifications(member);
  return <>
    {!migrated ? <Notice tone="warning">Notifikasi menunggu migrasi 202611040006_pra_wam_announcements.sql.</Notice>
      : <NotificationList items={items} now={new Date().toISOString()} hodAnswers={await hodInvitesBySession(member.id).catch(() => ({}))} />}
  </>;
}
