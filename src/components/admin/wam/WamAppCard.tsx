import { ExternalLink, KeyRound, Settings } from "lucide-react";
import { praWamPath, wamAdminPath } from "@/lib/routes";
import { currentPhase } from "@/lib/server/pra-wam/events";
import { openResetRequestCount } from "@/lib/server/pra-wam/reset-requests";
import { wibDate } from "@/lib/pra-wam/appraisal";
import styles from "./wam-card.module.css";

const short = (date: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/**
 * WAM is not an invitation in the events table, so the event list does not read it; this card
 * puts it at the top of "Semua acara" with its phase and the way in: the app, Admin WAM (accounts,
 * roles, rooms and the rest, for every admin), and how many "Lupa password" requests wait.
 */
export async function WamAppCard() {
  const [phase, waiting] = await Promise.all([
    currentPhase(wibDate(new Date().toISOString())).catch(() => null),
    openResetRequestCount().catch(() => null),
  ]);
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
      <a className="button button--secondary" href={wamAdminPath.home}><Settings size={18} aria-hidden /> Kelola WAM</a>
      {!!waiting && <a className="button button--secondary" href={wamAdminPath.resetRequests}><KeyRound size={18} aria-hidden /> {waiting} permintaan reset password</a>}
    </div>
  </section>;
}
