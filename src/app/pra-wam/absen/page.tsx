import { CheckInScanner } from "@/components/pra-wam/CheckInScanner";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { praWamPath } from "@/lib/routes";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pindai QR absen · Pra WAM", robots: { index: false } };

/** For phones whose camera app does not open links: scan the session QR here. */
export default async function ScanPage() {
  const member = await requireMemberPage(praWamPath.scan);
  return <PraWamShell member={member} current="agenda">
    <div className={styles.head}><div><p className={styles.kicker}>Absen</p><h1>Pindai QR absen</h1>
      <p>Arahkan kamera ke QR yang terpasang di ruang sesi. Kamera ponsel biasa juga bisa: pindai lalu buka tautannya.</p></div></div>
    <section className={`${styles.card} ${styles.narrow}`}><CheckInScanner /></section>
  </PraWamShell>;
}
