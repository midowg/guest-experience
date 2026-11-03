import { ExternalLink, Settings } from "lucide-react";
import { PRA_WAM_ADMIN, praWamPath } from "@/lib/routes";
import { currentPhase } from "@/lib/server/pra-wam/events";
import { wibDate } from "@/lib/pra-wam/appraisal";
import styles from "./wam-card.module.css";

const short = (date: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/**
 * WAM is not an invitation in the events table, so the event list does not read it; this card
 * puts it at the top of "Semua acara" with its phase and the way in (the app, and for the super
 * admin its settings and accounts).
 */
export async function WamAppCard({ superAdmin }: { superAdmin: boolean }) {
  const phase = await currentPhase(wibDate(new Date().toISOString())).catch(() => null);
  return <section className={styles.card} aria-labelledby="wam-app">
    <div>
      <p className={styles.eyebrow}>Aplikasi internal Werkudara</p>
      <h2 id="wam-app">WAM 2027</h2>
      <p className={styles.meta}>
        {phase ? <>{phase.kind === "pra_wam" ? "Minggu Pra WAM" : `${phase.name} berlangsung`} · {short(phase.startDate)}–{short(phase.endDate)}{phase.daysToWam ? ` · WAM dimulai ${phase.daysToWam} hari lagi` : ""}</> : "Werkudara Annual Meeting, 4–7 Jan 2027"}
      </p>
      <p className={styles.meta}>Login per karyawan, agenda, appraisal, absen QR, dokumen, dan pengumuman. Panitia mengelola sesi dari dalam aplikasi.</p>
    </div>
    <div className={styles.actions}>
      <a className="button button--primary" href={praWamPath.home} target="_blank" rel="noopener"><ExternalLink size={18} aria-hidden /> Buka aplikasi</a>
      {superAdmin && <a className="button button--secondary" href={PRA_WAM_ADMIN}><Settings size={18} aria-hidden /> Akun, peran &amp; pengaturan</a>}
    </div>
  </section>;
}
