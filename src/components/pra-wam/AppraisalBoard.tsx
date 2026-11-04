"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CalendarClock, CalendarPlus, DoorOpen, MapPin, Users } from "lucide-react";
import { ButtonLink, Notice } from "@/components/ui";
import { appraisalRules, clockLabel, dayLabel, slotTimes, wibDate, wibInstant, wibTime, type Booking, type Room } from "@/lib/pra-wam/appraisal";
import { praWamApi, praWamPath } from "@/lib/routes";
import { errorText, praWamRequest } from "./api";
import { roomStatus, type PlanStatus } from "@/lib/pra-wam/floor-plan";
import { useConfirm } from "./ConfirmDialog";
import { FloorPlan } from "./FloorPlan";
import styles from "./pra-wam.module.css";
import own from "./appraisal.module.css";

type Props = {
  date: string; dates: string[]; now: string; rooms: Room[]; bookings: Booking[]; mine: Booking[]; viewerId: string; canCancelAny: boolean; open: boolean;
  /** A booking to open on arrival (?booking= from an agenda item). */
  openFirst?: string;
};

const span = (booking: Booking) => `${clockLabel(wibTime(booking.startsAt))}–${clockLabel(wibTime(booking.endsAt))}`;
const chipDay = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const chipDate = (date: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const clock = (total: number) => `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
/** The finder's lengths in the booking HTML. */
const lengths = [{ minutes: 30, label: "30 mnt" }, { minutes: 60, label: "1 jam" }, { minutes: 90, label: "1,5 jam" }, { minutes: 120, label: "2 jam" }];

/**
 * Book: who has which room, per day, in the look of Penpot's peserta screens (day chips as on
 * Agenda, cards with icon tiles), with the office floor plan of "Werkudara Room Booking" on top.
 * The plan shows every room for the chosen start and length; a free room opens the form for that
 * room and those hours. Below it, the room-by-time schedule: an empty half hour opens the form too.
 * With `openFirst` that booking's detail is open on arrival and scrolled into view.
 */
export function AppraisalBoard({ date, dates, now, rooms, bookings, mine, viewerId, canCancelAny, open, openFirst }: Props) {
  const router = useRouter();
  const arrived = openFirst && bookings.some(booking => booking.id === openFirst) ? openFirst : null;
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(
    openFirst && !arrived ? { tone: "info", text: "Booking itu tidak ada di jadwal tanggal ini. Mungkin sudah dibatalkan atau dipindah." } : null);
  /** "batal:<id>" or "hapus:<id>": which action is running, on which booking. */
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const [openId, setOpenId] = useState<string | null>(arrived);
  const detail = useRef<HTMLDivElement>(null);
  // Arriving on one booking: bring its detail into view (it sits below the plan and schedule).
  useEffect(() => { if (arrived) detail.current?.scrollIntoView({ block: "center" }); }, [arrived]);
  const [opening, setOpening] = useState<string | null>(null);
  const opened = bookings.find(booking => booking.id === openId);
  const bookable = rooms.filter(room => room.bookable);
  const slots = slotTimes().slice(0, -1);
  const today = wibDate(now);
  const isToday = date === today;
  const passed = (time: string) => !open || new Date(wibInstant(date, time)) <= new Date(now);
  const inRoom = (room: Room) => bookings.filter(booking => booking.roomId === room.id);
  const mineFlag = (booking: Booking) => !booking.isSession && booking.bookedBy.id === viewerId;
  const toggle = (id: string) => setOpenId(openId === id ? null : id);
  const working = (booking: Booking) => !!busy && busy.endsWith(booking.id);

  // The plan's hours: the next half hour that has not started, for an hour, as the HTML's finder.
  const starts = slots.filter(time => new Date(wibInstant(date, time)) > new Date(now));
  const [start, setStart] = useState(starts[0] ?? "");
  const [length, setLength] = useState(60);
  const end = start ? clock(Math.min(minutes(start) + length, minutes(appraisalRules.close))) : "";
  const planSpan = start ? { startsAt: wibInstant(date, start), endsAt: wibInstant(date, end) } : null;
  const statusOf = (room: Room): PlanStatus => !start && room.bookable
    ? { tone: "closed", text: date < today ? "Sudah lewat" : "Sudah tutup" }
    : roomStatus({ bookable: room.bookable, span: planSpan, now: new Date(now), holds: inRoom(room).map(booking => ({ startsAt: booking.startsAt, endsAt: booking.endsAt, mine: mineFlag(booking) })) });
  function pickRoom(room: Room) {
    setOpening(room.name);
    router.push(praWamPath.book({ date, room: room.id, start, end }));
  }

  async function cancel(booking: Booking) {
    const someoneElse = booking.bookedBy.id !== viewerId ? ` milik ${booking.bookedBy.name}` : "";
    if (!(await confirm({
      title: "Batalkan booking?",
      body: `"${booking.title}"${someoneElse}, ${dayLabel(wibDate(booking.startsAt))}, ${span(booking)}. Ruang langsung bisa dipesan orang lain.`,
      confirmLabel: "Batalkan booking",
    }))) return;
    setBusy(`batal:${booking.id}`); setNotice(null);
    try {
      const result = await praWamRequest(praWamApi.bookings(booking.id), { method: "DELETE" });
      setNotice({ tone: "success", text: result.message });
      setOpenId(null);
      router.refresh();
    } catch (error) { setNotice({ tone: "error", text: errorText(error) }); }
    finally { setBusy(null); }
  }

  /** For a test or a mistake: gone for good, not kept as cancelled. */
  async function remove(booking: Booking) {
    if (!(await confirm({
      title: "Hapus permanen?",
      body: `"${booking.title}", ${dayLabel(wibDate(booking.startsAt))}, ${span(booking)}. Data booking hilang dan tidak bisa dikembalikan. Pakai untuk booking uji atau salah input.`,
      confirmLabel: "Hapus permanen",
      danger: true,
    }))) return;
    setBusy(`hapus:${booking.id}`); setNotice(null);
    try {
      const result = await praWamRequest(praWamApi.bookings(booking.id, { permanent: "1" }), { method: "DELETE" });
      setNotice({ tone: "success", text: result.message });
      setOpenId(null);
      router.refresh();
    } catch (error) { setNotice({ tone: "error", text: errorText(error) }); }
    finally { setBusy(null); }
  }

  return <>
    {confirmDialog}
    {notice && <div className={own.gap} role="status"><Notice tone={notice.tone}>{notice.text}</Notice></div>}

    <nav className={styles.dates} aria-label="Pilih tanggal">
      {dates.map(day => <a key={day} className={`${styles.chip} ${styles.chipStack}`} href={praWamPath.appraisal(day)} aria-current={day === date ? "date" : undefined}>
        {chipDay(day)}<small>{chipDate(day)}{day === today ? " · hari ini" : ""}</small>
      </a>)}
    </nav>

    <p className={styles.sectionLabel}>Denah kantor · {dayLabel(date)}</p>
    <section className={`${styles.card} ${own.planCard}`} aria-label={`Denah kantor ${dayLabel(date)}`}>
      {starts.length > 0 ? <div className={own.finder}>
        <div>
          <label className={styles.label} htmlFor="plan-start">Mulai</label>
          <select id="plan-start" className="select" value={start} onChange={event => setStart(event.target.value)}>
            {starts.map(time => <option key={time} value={time}>{clockLabel(time)}</option>)}
          </select>
        </div>
        <div>
          <span className={styles.label} id="plan-length">Durasi</span>
          <div className={styles.dates} role="group" aria-labelledby="plan-length">
            {lengths.map(item => <button key={item.minutes} type="button" className={`${styles.chip} ${styles.chipSmall}`} aria-pressed={item.minutes === length} onClick={() => setLength(item.minutes)}>{item.label}</button>)}
          </div>
        </div>
      </div> : <p className={styles.meta} style={{ margin: 0 }}>{isToday ? "Jam operasional hari ini sudah lewat. Pilih tanggal lain untuk book ruang." : "Tanggal ini sudah lewat."}</p>}
      <FloorPlan rooms={rooms} statusOf={statusOf} onPick={open && start ? pickRoom : undefined} action="Book ruang ini"
        label={`Denah kantor, ${dayLabel(date)}${start ? `, ${clockLabel(start)}–${clockLabel(end)}` : ""}`}
        caption={opening ? <span role="status">Membuka form untuk {opening}…</span> : open && start ? "Ketuk ruang yang kosong untuk book." : undefined} />
    </section>

    <p className={styles.sectionLabel}>Jadwal ruang · {dayLabel(date)}</p>
    <section className={styles.card} aria-label={`Jadwal ruang ${dayLabel(date)}`}>
      <div className={own.legend} aria-hidden>
        <span><i className={own.swatch} />Booking</span>
        <span><i className={`${own.swatch} ${own.swatchMine}`} />Booking kamu</span>
        <span><i className={`${own.swatch} ${own.swatchSession}`} />Sesi Pra WAM</span>
      </div>
      <div className={styles.grid} style={{ "--rooms": bookable.length } as React.CSSProperties} role="table" aria-label={`Jadwal ruang ${dayLabel(date)}`}>
        <div className={styles.gridHead} style={{ gridColumn: 1, gridRow: 1 }} role="columnheader">Jam</div>
        {bookable.map((room, column) => <div key={room.id} className={styles.gridHead} style={{ gridColumn: column + 2, gridRow: 1 }} role="columnheader">{room.name}</div>)}
        {slots.map((time, row) => <div key={time} className={styles.gridTime} style={{ gridRow: row + 2 }}>{time.endsWith(":00") ? clockLabel(time) : ""}</div>)}
        {bookable.flatMap((room, column) => slots.map((time, row) => passed(time)
          ? <div key={`${room.id}-${time}`} className={styles.gridCell} style={{ gridColumn: column + 2, gridRow: row + 2 }} />
          : <a key={`${room.id}-${time}`} className={styles.gridCell} style={{ gridColumn: column + 2, gridRow: row + 2 }} href={praWamPath.book({ date: date, room: room.id, start: time })} aria-label={`Book ${room.name} jam ${clockLabel(time)}`} />))}
        {bookable.flatMap((room, column) => inRoom(room).map(booking => {
          const from = slots.indexOf(wibTime(booking.startsAt)), to = slots.indexOf(wibTime(booking.endsAt));
          return <button key={booking.id} type="button" className={`${styles.block} ${mineFlag(booking) ? styles.blockMine : ""} ${booking.isSession ? styles.blockSession : ""}`} style={{ gridColumn: column + 2, gridRow: `${from + 2} / ${(to < 0 ? slots.length : to) + 2}` }}
            aria-expanded={openId === booking.id} aria-controls="rincian" onClick={() => toggle(booking.id)}>
            <strong>{booking.title}</strong>{booking.bookedBy.name} · {span(booking)}
          </button>;
        }))}
      </div>

      <div className={styles.list}>
        {bookable.map(room => <div key={room.id} className={styles.listRoom}>
          <h3 className={own.roomTitle}><DoorOpen size={16} aria-hidden />{room.name}</h3>
          {inRoom(room).length === 0 && <p className={styles.itemEmpty}>Belum ada booking. {open && <a href={praWamPath.book({ date: date, room: room.id })}>Book</a>}</p>}
          {inRoom(room).map(booking => <button key={booking.id} type="button" className={styles.item} aria-expanded={openId === booking.id} aria-controls="rincian" onClick={() => toggle(booking.id)}>
            <span className={styles.itemTime}>{span(booking)}</span>
            <span><strong>{booking.title}</strong><br /><span className={styles.meta}>{booking.isSession ? "Sesi Pra WAM" : mineFlag(booking) ? "Kamu" : booking.bookedBy.name}{booking.bookedBy.department ? ` · ${booking.bookedBy.department}` : ""}</span></span>
          </button>)}
        </div>)}
      </div>

      {opened && <div ref={detail} id="rincian" className={`${styles.detail} ${own.detail}`} role="region" aria-label="Rincian booking">
        <h3>{opened.title}</h3>
        <span className={styles.place}><MapPin aria-hidden />{rooms.find(item => item.id === opened.roomId)?.name} · {span(opened)}</span>
        <span className={styles.meta}>{opened.isSession ? "Sesi Pra WAM, diatur panitia" : `Dipesan ${mineFlag(opened) ? "kamu" : `${opened.bookedBy.name} (${opened.bookedBy.department})`}`}</span>
        {opened.participants && <span className={styles.place}><Users aria-hidden />{opened.participants.length ? `Bersama ${opened.participants.map(person => person.name).join(", ")}` : "Tanpa partisipan lain"}</span>}
        {opened.description && <span className={styles.meta}>{opened.description}</span>}
        <div className={styles.actions}>
          {open && mineFlag(opened) && <ButtonLink variant="secondary" href={praWamPath.book({ edit: opened.id })}>Ubah</ButtonLink>}
          {!opened.isSession && (mineFlag(opened) || canCancelAny) && new Date(opened.endsAt) > new Date(now) && <button type="button" className="button button--quiet" disabled={working(opened)} onClick={() => cancel(opened)}>{busy === `batal:${opened.id}` ? "Membatalkan…" : "Batalkan"}</button>}
          {!opened.isSession && (mineFlag(opened) || canCancelAny) && <button type="button" className={`button button--quiet ${styles.dangerQuiet}`} disabled={working(opened)} onClick={() => remove(opened)}>{busy === `hapus:${opened.id}` ? "Menghapus…" : "Hapus"}</button>}
          <button type="button" className="button button--quiet" onClick={() => setOpenId(null)}>Tutup</button>
        </div>
      </div>}
    </section>

    <p className={styles.sectionLabel}>Booking saya</p>
    {mine.length === 0 ? <div className={styles.emptyRow}>
      <span className={styles.tile} aria-hidden><CalendarPlus /></span>
      <p>Belum ada booking yang kamu pesan atau ikuti.</p>
      {open && <ButtonLink variant="secondary" href={praWamPath.book({ date })}>Book ruang</ButtonLink>}
    </div> : <div className={styles.mine}>
      {mine.map(booking => {
        const room = rooms.find(item => item.id === booking.roomId)?.name ?? "Ruang";
        const mineBooking = mineFlag(booking);
        return <article key={booking.id} className={`${styles.mineItem} ${styles.row}`}>
          <span className={`${styles.tile} ${mineBooking ? styles.tileBrass : ""}`}><CalendarClock aria-hidden /></span>
          <div className={own.stack}>
            <h3>{booking.title}</h3>
            <span className={styles.meta}>{dayLabel(wibDate(booking.startsAt))} · {span(booking)} · {room}</span>
            <span className={styles.meta}>{mineBooking ? "Kamu pemesannya" : `Dipesan ${booking.bookedBy.name}`}{booking.participants?.length ? ` · Bersama ${booking.participants.map(person => person.name).join(", ")}` : ""}</span>
            {booking.description && <span className={styles.meta}>{booking.description}</span>}
            {mineBooking && <div className={styles.actions}>
              {open && <ButtonLink variant="secondary" href={praWamPath.book({ edit: booking.id })}>Ubah</ButtonLink>}
              <button type="button" className="button button--quiet" disabled={working(booking)} onClick={() => cancel(booking)}>{busy === `batal:${booking.id}` ? "Membatalkan…" : "Batalkan"}</button>
              <button type="button" className={`button button--quiet ${styles.dangerQuiet}`} disabled={working(booking)} onClick={() => remove(booking)}>{busy === `hapus:${booking.id}` ? "Menghapus…" : "Hapus"}</button>
            </div>}
          </div>
        </article>;
      })}
    </div>}
  </>;
}
