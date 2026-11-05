import { CheckCircle2, Clock, Info, XCircle } from "lucide-react";
import { checkInText, type CheckInStatus } from "@/lib/pra-wam/agenda";
import rows from "./peserta.module.css";

const tone: Record<CheckInStatus["kind"], string> = {
  hadir: rows.checkDone, buka: rows.checkOpen, belum: rows.checkWait, tutup: rows.checkClosed, "tidak-tersedia": rows.checkWait,
};
const icon: Record<CheckInStatus["kind"], React.ReactNode> = {
  hadir: <CheckCircle2 aria-hidden />, buka: <CheckCircle2 aria-hidden />, belum: <Clock aria-hidden />, tutup: <XCircle aria-hidden />, "tidak-tersedia": <Info aria-hidden />,
};

/**
 * The person's check-in for a session (Penpot P3 "Status absen", E2, and the states of P5 and
 * P13): present with the time (and how, once "Saya hadir" exists), registered and the QR open,
 * not open yet with its hours, or closed.
 * The words carry the meaning, so colour is never the only signal.
 */
export function CheckInBlock({ status, now, wide, self, id }: { status: CheckInStatus; now: Date; wide?: boolean; self?: boolean; id?: string }) {
  const text = checkInText(status, now, { self });
  return <p id={id} className={`${rows.check} ${tone[status.kind]} ${wide ? rows.checkWide : ""}`}>
    {icon[status.kind]}<span><strong>{text.title}</strong>{wide ? ". " : <br />}{text.body}</span>
  </p>;
}
