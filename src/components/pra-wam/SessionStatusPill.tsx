import { AlertTriangle, CheckCircle2, Clock, PenLine, XCircle } from "lucide-react";
import type { Session } from "@/lib/pra-wam/sessions";
import styles from "./panitia.module.css";

/** Where a session stands, as the readiness pills in Penpot's dashboard: draft, coming, live, done. */
export function SessionStatusPill({ session, now }: { session: Pick<Session, "status" | "startsAt" | "endsAt" | "roomId" | "location">; now: Date }) {
  if (session.status === "batal") return <span className={`${styles.statusPill} ${styles.warn}`}><XCircle aria-hidden />Batal</span>;
  if (session.status === "draf") return <span className={`${styles.statusPill} ${styles.soon}`}><PenLine aria-hidden />Draf</span>;
  if (!session.roomId && !session.location) return <span className={`${styles.statusPill} ${styles.warn}`}><AlertTriangle aria-hidden />Tempat belum ada</span>;
  if (session.endsAt && new Date(session.endsAt) <= now) return <span className={`${styles.statusPill} ${styles.done}`}><CheckCircle2 aria-hidden />Selesai</span>;
  if (session.startsAt && new Date(session.startsAt) <= now) return <span className={`${styles.statusPill} ${styles.live}`}><Clock aria-hidden />Berlangsung</span>;
  return <span className={`${styles.statusPill} ${styles.soon}`}><Clock aria-hidden />Terjadwal</span>;
}
