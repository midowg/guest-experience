"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, DoorOpen, Handshake, Pencil, User, Users, X } from "lucide-react";
import { errorText, praWamRequest } from "@/components/pra-wam/api";
import type { OfficeBooking } from "@/lib/booking/rules";
import { bookingWhere, clockLabel, dayLabel, wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import { bookingApi, bookingPath, praWamPath } from "@/lib/routes";
import css from "./booking.module.css";

/**
 * Bookings as a list, by day: Booking saya (`manage` false: the person's own, to change or cancel)
 * and Kelola (`manage` true: everyone's, with the booker's full name, to cancel). A booking made
 * in WAM is also a WAM session, so it is changed and cancelled there; here it only links to it.
 */
export function BookingList({ bookings, rooms, manage = false, empty }: { bookings: OfficeBooking[]; rooms: { id: string; name: string }[]; manage?: boolean; empty: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const days = [...new Set(bookings.map(item => wibDate(item.startsAt)))];

  async function cancel(id: string) {
    setBusy(true); setResult(null);
    try {
      const { message } = await praWamRequest(bookingApi.bookings(id), { method: "DELETE" });
      setResult({ ok: true, text: message }); setAsking(null); router.refresh();
    } catch (error) { setResult({ ok: false, text: errorText(error) }); } finally { setBusy(false); }
  }

  return <>
    {result && <p className={result.ok ? css.noteOk : css.noteBad} role={result.ok ? "status" : "alert"}>{result.ok ? <CheckCircle2 size={18} aria-hidden /> : <AlertTriangle size={18} aria-hidden />}{result.text}</p>}
    {!bookings.length && <p className={css.note}>{empty}</p>}
    {days.map(day => <section key={day} aria-label={dayLabel(day)}>
      <h2 className={css.dayTitle}>{dayLabel(day)}</h2>
      <ul className={css.list}>{bookings.filter(item => wibDate(item.startsAt) === day).map(item => {
        const date = wibDate(item.startsAt);
        const office = item.source === "kantor" && !item.isSession;
        const others = item.participants?.length ?? 0;
        return <li key={item.id} className={css.item}>
          <div className={item.mine && !manage ? css.itemTimeMine : css.itemTime} aria-label={`${clockLabel(wibTime(item.startsAt))} sampai ${clockLabel(wibTime(item.endsAt))}`}>
            {clockLabel(wibTime(item.startsAt))}<small>s.d. {clockLabel(wibTime(item.endsAt))}</small>
          </div>
          <div className={css.itemMain}>
            <h3>{item.title}</h3>
            <div className={css.itemMeta}>
              <span><DoorOpen size={16} aria-hidden />{bookingWhere(item, rooms)}</span>
              {(manage || !item.mine) && <span><User size={16} aria-hidden />{manage ? item.bookedBy.fullName ?? item.bookedBy.name : item.bookedBy.name}{manage && item.bookedBy.department ? ` · ${item.bookedBy.department}` : ""}</span>}
              {item.participants && <span><Users size={16} aria-hidden />{others + 1} orang</span>}
            </div>
            <div className={css.itemTags}>
              {item.audience === "eksternal" && <span className={css.chipWarn}><Handshake size={14} aria-hidden />Eksternal{item.externalNote ? ` · ${item.externalNote}` : ""}</span>}
              {item.isSession ? <span className={css.chipInfo}>Sesi WAM</span> : !office && <span className={css.chipInfo}>Dibuat di WAM</span>}
              {!manage && (item.mine ? <span className={css.chipMine}>Booking saya</span> : <span className={css.chip}>Diundang</span>)}
            </div>
          </div>
          <div className={css.itemActs}>
            {asking === item.id ? <>
              <span className={css.hint}>Batalkan booking ini?</span>
              <button type="button" className={css.btnDanger} disabled={busy} onClick={() => void cancel(item.id)}>{busy ? "Membatalkan…" : "Ya, batalkan"}</button>
              <button type="button" className={css.btnQuiet} disabled={busy} onClick={() => setAsking(null)}>Tidak</button>
            </> : office ? <>
              {item.mine && <Link href={bookingPath.rooms({ date, edit: item.id })} className={css.btnQuiet}><Pencil size={16} aria-hidden />Ubah</Link>}
              {(item.mine || manage) && <button type="button" className={css.btnDanger} onClick={() => { setAsking(item.id); setResult(null); }}><X size={16} aria-hidden />Batal</button>}
            </> : !item.isSession && item.mine && <Link href={praWamPath.appraisal(date, item.id)} className={css.btnQuiet}>Buka di WAM</Link>}
          </div>
        </li>;
      })}</ul>
    </section>)}
  </>;
}
