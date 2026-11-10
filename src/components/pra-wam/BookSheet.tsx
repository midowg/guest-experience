"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, Plus } from "lucide-react";
import { Notice } from "@/components/ui";
import { dayLabel } from "@/lib/pra-wam/appraisal";
import { praWamApi } from "@/lib/routes";
import type { BookingFormData } from "@/lib/server/pra-wam/booking-form";
import { errorText, praWamRequest } from "./api";
import { BookingForm } from "./BookingForm";
import { Sheet } from "./Sheet";
import css from "./booking-form.module.css";

export type BookAsk = { date?: string; edit?: string };

/**
 * The booking form over the page (9 Nov 2026): from the bottom on a phone, from the right on a
 * desktop, so booking never leaves Timeline or Agenda. `ask` opens it (a day, or a booking to
 * change); the form's data comes from GET /api/wam/book-form. Saved, it says so with "Book lagi";
 * closing refreshes the page under it.
 */
export function BookSheet({ ask, viewerId, onClose }: { ask: BookAsk | null; viewerId: string; onClose: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<BookingFormData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const key = ask ? `${ask.date ?? ""}|${ask.edit ?? ""}|${round}` : "";

  useEffect(() => {
    if (!ask) return;
    let live = true;
    /* eslint-disable react-hooks/set-state-in-effect -- a new request starts empty */
    setData(null); setError(null); setSaved(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    praWamRequest<BookingFormData>(praWamApi.bookForm(ask))
      .then(result => { if (live) setData(result.data); })
      .catch(problem => { if (live) setError(errorText(problem)); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- `key` stands for `ask` and a new round

  function close() {
    if (saved) router.refresh();
    onClose();
  }

  if (!ask) return null;
  const title = ask.edit ? "Ubah booking" : "Book ruang";
  if (saved) return <Sheet open onClose={close} title={ask.edit ? "Booking diubah" : "Booking tersimpan"}
    footer={<>
      <button type="button" className="button button--secondary" onClick={close}>Tutup</button>
      {!ask.edit && <button type="button" className="button button--primary" onClick={() => { router.refresh(); setRound(round + 1); }}><Plus size={18} aria-hidden /> Book lagi</button>}
    </>}>
    <div className={css.done}>
      <CheckCircle2 className={css.doneIcon} aria-hidden />
      <p role="status">{saved}</p>
    </div>
  </Sheet>;
  if (!data) return <Sheet open onClose={close} title={title}>
    {error ? <Notice tone="error">{error}</Notice> : <p role="status">Memuat form booking…</p>}
  </Sheet>;
  return <BookingForm key={key} editId={data.editId} initial={data.initial} dates={data.dates} now={data.now} rooms={data.rooms}
    people={data.people} groups={data.groups} viewer={{ id: viewerId }} usedTitles={data.usedTitles}
    dayBookings={data.dayBookings} dayOf={data.dayOf} activities={data.activities} hod={data.hod} viewerDepartments={data.viewerDepartments}
    onSaved={({ message }) => setSaved(message)}
    frame={(body, footer) => <Sheet open onClose={close} wide title={title}
      subtitle={data.moved ? `${dayLabel(data.moved)} tidak bisa dibooking; dipilih ${dayLabel(data.initial.date)}.` : "Yang tersimpan lebih dulu yang mendapat ruang."}
      footer={footer}>{body}</Sheet>} />;
}
