"use client";

import { useState } from "react";
import { CalendarDays, MapPin, Pencil, UserRound, Users } from "lucide-react";
import { ButtonLink, Notice } from "@/components/ui";
import { bookingRights, type AgendaBooking } from "@/lib/pra-wam/agenda";
import { clockLabel, dayLabel, wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import { praWamApi, praWamPath } from "@/lib/routes";
import { errorText, praWamRequest } from "./api";
import { useConfirm } from "./ConfirmDialog";
import styles from "./pra-wam.module.css";
import rows from "./peserta.module.css";
import own from "./agenda-sheet.module.css";

/** What a booking's detail needs from its agenda item. */
export type BookingItem = { key: string; title: string; startsAt: string; endsAt: string; booking: AgendaBooking };

const span = (item: Pick<BookingItem, "startsAt" | "endsAt">) => `${clockLabel(wibTime(item.startsAt))}–${clockLabel(wibTime(item.endsAt))}`;

/**
 * A booking on the agenda, in the sheet over Agenda and Beranda (AgendaSheet): when, which room,
 * who booked it, who else takes part, and what it is for. The same facts as Book's detail.
 */
export function BookingDetailBody({ item }: { item: BookingItem }) {
  const { booking } = item;
  return <div className={rows.detail}>
    <div className={styles.pills}>
      <span className={`${styles.pill} ${styles.pillBrass}`}>Book ruang</span>
      {booking.mine && <span className={`${styles.pill} ${styles.pillLine}`}>Booking kamu</span>}
    </div>
    <section className={styles.card} aria-label="Rincian">
      <dl className={styles.infoList}>
        <div className={styles.row}><span className={styles.tile}><CalendarDays aria-hidden /></span><div><dt>Waktu</dt><dd>{dayLabel(wibDate(item.startsAt))} · {span(item)}</dd></div></div>
        <div className={styles.row}><span className={styles.tile}><MapPin aria-hidden /></span><div><dt>Ruang</dt><dd>{booking.room}</dd></div></div>
        <div className={styles.row}><span className={styles.tile}><UserRound aria-hidden /></span><div>
          <dt>Dipesan oleh</dt>
          <dd>{booking.mine ? "Kamu" : `${booking.bookedBy.name}${booking.bookedBy.department ? ` · ${booking.bookedBy.department}` : ""}`}</dd>
        </div></div>
        {booking.participants && <div className={styles.row}><span className={styles.tile}><Users aria-hidden /></span><div>
          <dt>Peserta</dt>
          <dd>{booking.participants.length ? booking.participants.map(person => person.name).join(", ") : "Tanpa partisipan lain"}</dd>
        </div></div>}
      </dl>
      {booking.description && <p className={rows.description}>{booking.description}</p>}
    </section>
  </div>;
}

type ActionProps = {
  item: BookingItem;
  viewer: { cancelsAny: boolean; bookingOpen: boolean };
  /** After a cancel or delete: the sheet closes and the page says so. */
  onDone: (message: string) => void;
};

/**
 * The booking's buttons in the sheet's foot, with the rules of Book (AppraisalBoard): Ubah for the
 * booker while booking is open (Book's edit form), Batalkan before it ends and Hapus (for good) for
 * the booker or panitia/admin. Both ask first. Null when the person can do none of these.
 */
export function BookingDetailActions({ item, viewer, onDone }: ActionProps) {
  const [confirm, confirmDialog] = useConfirm();
  const [busy, setBusy] = useState<"batal" | "hapus" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Read when the sheet renders; a booking that ends while it is open is caught by the server.
  const [now] = useState(() => new Date());
  const rights = bookingRights({ mine: item.booking.mine, endsAt: item.endsAt }, viewer, now);
  if (!rights.edit && !rights.cancel && !rights.remove) return null;

  async function cancel() {
    const someoneElse = item.booking.mine ? "" : ` milik ${item.booking.bookedBy.name}`;
    if (!(await confirm({
      title: "Batalkan booking?",
      body: `"${item.title}"${someoneElse}, ${dayLabel(wibDate(item.startsAt))}, ${span(item)}. Ruang langsung bisa dipesan orang lain.`,
      confirmLabel: "Batalkan booking",
    }))) return;
    setBusy("batal"); setError(null);
    try {
      const result = await praWamRequest(praWamApi.bookings(item.key), { method: "DELETE" });
      onDone(result.message);
    } catch (problem) { setError(errorText(problem)); }
    finally { setBusy(null); }
  }

  /** For a test or a mistake: gone for good, not kept as cancelled. */
  async function remove() {
    if (!(await confirm({
      title: "Hapus permanen?",
      body: `"${item.title}", ${dayLabel(wibDate(item.startsAt))}, ${span(item)}. Data booking hilang dan tidak bisa dikembalikan. Pakai untuk booking uji atau salah input.`,
      confirmLabel: "Hapus permanen",
      danger: true,
    }))) return;
    setBusy("hapus"); setError(null);
    try {
      const result = await praWamRequest(praWamApi.bookings(item.key, { permanent: "1" }), { method: "DELETE" });
      onDone(result.message);
    } catch (problem) { setError(errorText(problem)); }
    finally { setBusy(null); }
  }

  return <div className={own.foot}>
    {confirmDialog}
    {error && <Notice tone="error" role="alert">{error}</Notice>}
    <div className={own.buttons}>
      {rights.edit && <ButtonLink variant="secondary" href={praWamPath.bookSheet({ date: wibDate(item.startsAt), edit: item.key })}><Pencil size={18} aria-hidden /> Ubah</ButtonLink>}
      {rights.cancel && <button type="button" className="button button--secondary" disabled={!!busy} onClick={cancel}>{busy === "batal" ? "Membatalkan…" : "Batalkan"}</button>}
      {rights.remove && <button type="button" className={`button button--quiet ${styles.dangerQuiet}`} disabled={!!busy} onClick={remove}>{busy === "hapus" ? "Menghapus…" : "Hapus"}</button>}
    </div>
  </div>;
}
