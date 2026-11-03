import { notFound } from "next/navigation";
import { AnnouncementComposer } from "@/components/pra-wam/Notifications";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { Notice } from "@/components/ui";
import { managesSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { sentAnnouncements } from "@/lib/server/pra-wam/announcements";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { listSessions } from "@/lib/server/pra-wam/sessions";
import { listUnits } from "@/lib/server/pra-wam/units";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pengumuman · Pra WAM", robots: { index: false } };

/** Panitia: announcements to everyone, one session, or units, with read counts. */
export default async function AnnouncementsPage() {
  const member = await requireMemberPage(praWamPath.announcements);
  if (!managesSessions(member)) notFound();
  const [{ items, migrated }, { sessions }, { units }] = await Promise.all([sentAnnouncements(member), listSessions(member), listUnits()]);
  return <PraWamShell member={member} current="pengumuman">
    <div className={styles.head}><div><p className={styles.kicker}>Panitia</p><h1>Pengumuman</h1>
      <p>Terkirim langsung ke menu Notifikasi penerima. Kabar sesi (terbit, pindah jadwal, batal) dikirim otomatis.</p></div></div>
    {!migrated ? <Notice tone="warning">Pengumuman menunggu migrasi 202611040006_pra_wam_announcements.sql.</Notice>
      : <AnnouncementComposer sent={items} sessions={sessions.filter(session => session.status === "terbit").map(({ id, title }) => ({ id, title }))} units={units.map(unit => ({ id: unit.id, title: unit.code && unit.code !== unit.name ? unit.code : unit.name }))} />}
  </PraWamShell>;
}
