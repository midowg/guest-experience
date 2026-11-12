"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarDays, MapPin, UserRound, Users } from "lucide-react";
import { ButtonLink, Notice } from "@/components/ui";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { BOOKING_SESSION_LOCKED, sessionStatusLabels, sessionWhen, sessionWhere, type Session } from "@/lib/pra-wam/sessions";
import { praWamApi, praWamPath } from "@/lib/routes";
import { errorText, praWamRequest } from "./api";
import { useConfirm } from "./ConfirmDialog";
import { ScreenHead } from "./ScreenHead";
import styles from "./pra-wam.module.css";

type Props = { session: Session & { booking: NonNullable<Session["booking"]> } };

/**
 * Ubah sesi for a session made from a room booking (migration 202611050004). Its time, room and
 * people follow the booking, so they are read here, not edited: the booking is where they
 * change. Panitia may still cancel it, which cancels the booking too.
 */
export function BookingSessionPanel({ session }: Props) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { booking } = session;
  const date = session.startsAt ? wibDate(session.startsAt) : undefined;

  async function cancel() {
    if (!(await confirm({
      title: "Batalkan sesi?",
      body: session.roomId
        ? `"${session.title}" hilang dari agenda peserta, booking ruang ${booking.bookedBy.name} ikut dibatalkan, dan ruangnya kembali tersedia.`
        : `"${session.title}" hilang dari agenda peserta dan booking ${booking.bookedBy.name} di luar kantor ikut dibatalkan.`,
      confirmLabel: "Batalkan sesi",
      danger: true,
    }))) return;
    setBusy(true); setError(null);
    try { await praWamRequest(praWamApi.sessionStatus(session.id), { method: "POST", json: { status: "batal" } }); router.refresh(); router.push(praWamPath.sessions); }
    catch (problem) { setError(errorText(problem)); setBusy(false); }
  }

  return <div className={styles.form}>
    {confirmDialog}
    <ScreenHead eyebrow={`Jadwal sesi · ${sessionStatusLabels[session.status]} · Dari booking`} title={session.title} lead={sessionWhen(session)}
      actions={<ButtonLink variant="secondary" href={praWamPath.sessions}>Semua sesi</ButtonLink>} />
    {error && <Notice tone="error">{error}</Notice>}
    <Notice tone="info">{BOOKING_SESSION_LOCKED} Pemesannya mengubah jam, ruang, dan peserta di Book; sesi ini ikut berubah.</Notice>
    <section className={styles.card} aria-label="Rincian">
      <dl className={styles.infoList}>
        <div className={styles.row}><span className={styles.tile}><CalendarDays aria-hidden /></span><div><dt>Waktu</dt><dd>{sessionWhen(session)}</dd></div></div>
        <div className={styles.row}><span className={styles.tile}><MapPin aria-hidden /></span><div><dt>Ruang</dt><dd>{sessionWhere(session)}</dd></div></div>
        <div className={styles.row}><span className={styles.tile}><UserRound aria-hidden /></span><div>
          <dt>Dipesan oleh</dt>
          <dd>{booking.bookedBy.name}{booking.bookedBy.department ? ` · ${booking.bookedBy.department}` : ""}</dd>
        </div></div>
        {session.participants && <div className={styles.row}><span className={styles.tile}><Users aria-hidden /></span><div>
          <dt>Peserta ({session.participants.length})</dt>
          <dd>{session.participants.map(person => person.name).join(", ") || "Belum ada"}</dd>
        </div></div>}
      </dl>
    </section>
    <div className={styles.actions}>
      <ButtonLink variant="secondary" href={praWamPath.appraisal(date, booking.id)}>Buka booking</ButtonLink>
      {session.status === "terbit" && <ButtonLink variant="secondary" href={praWamPath.sessionAttendance(session.id)}>Absen (ubah)</ButtonLink>}
      {session.status === "terbit" && <button type="button" className={`button button--secondary ${styles.dangerQuiet}`} disabled={busy} onClick={cancel}>{busy ? "Membatalkan…" : "Batalkan sesi"}</button>}
    </div>
  </div>;
}
