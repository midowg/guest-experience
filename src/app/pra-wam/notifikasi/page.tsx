import { NotificationList } from "@/components/pra-wam/Notifications";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { Notice } from "@/components/ui";
import { praWamPath } from "@/lib/routes";
import { myNotifications } from "@/lib/server/pra-wam/announcements";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifikasi · Pra WAM", robots: { index: false } };

export default async function NotificationsPage() {
  const member = await requireMemberPage(praWamPath.notifications);
  const { items, migrated } = await myNotifications(member);
  return <PraWamShell member={member} current="notifikasi">
    <div className={styles.head}><div><p className={styles.kicker}>Kabar terbaru</p><h1>Notifikasi</h1></div></div>
    {!migrated ? <Notice tone="warning">Notifikasi menunggu migrasi 202611040006_pra_wam_announcements.sql.</Notice>
      : <section className={styles.card}><NotificationList items={items} /></section>}
  </PraWamShell>;
}
