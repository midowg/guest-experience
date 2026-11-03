import { CalendarClock } from "lucide-react";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { currentPhase } from "@/lib/server/pra-wam/events";
import styles from "./pra-wam.module.css";

const short = (date: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/**
 * The app is WAM; this says which part of it is on now. During the Pra WAM weeks: "Minggu Pra WAM"
 * with its dates and the days left to WAM. During WAM itself: the WAM days.
 */
export async function PhaseBanner() {
  const phase = await currentPhase(wibDate(new Date().toISOString())).catch(() => null);
  if (!phase) return null;
  return <p className={styles.phase} role="note">
    <CalendarClock aria-hidden />
    <span><strong>{phase.kind === "pra_wam" ? "Minggu Pra WAM" : `${phase.name} sedang berlangsung`}</strong>
      {" · "}{short(phase.startDate)}–{short(phase.endDate)}{phase.daysToWam ? ` · WAM 2027 dimulai ${phase.daysToWam} hari lagi` : ""}</span>
  </p>;
}
