"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ButtonLink, Notice } from "@/components/ui";
import { appraisalRules, clockLabel, dayLabel, slotTimes, wibDate, wibInstant, wibTime, type Booking, type Room } from "@/lib/pra-wam/appraisal";
import { praWamApi, praWamPath } from "@/lib/routes";
import { errorText, praWamRequest } from "./api";
import styles from "./pra-wam.module.css";

type Props = { date: string; dates: string[]; now: string; rooms: Room[]; bookings: Booking[]; mine: Booking[]; viewerId: string; canCancelAny: boolean };

const span = (booking: Booking) => `${clockLabel(wibTime(booking.startsAt))}–${clockLabel(wibTime(booking.endsAt))}`;

/**
 * Appraisal: who has which room, per day. Everyone sees the booker and the activity of every
 * booking; an empty half hour opens the form for that room and time.
 */
export function AppraisalBoard({ date, dates, now, rooms, bookings, mine, viewerId, canCancelAny }: Props) {
  const router = useRouter();
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = bookings.find(booking => booking.id === openId);
  const bookable = rooms.filter(room => room.bookable);
  const slots = slotTimes().slice(0, -1);
  const isToday = date === wibDate(now);
  const passed = (time: string) => new Date(wibInstant(date, time)) <= new Date(now);
  const inRoom = (room: Room) => bookings.filter(booking => booking.roomId === room.id);
  const mineFlag = (booking: Booking) => booking.bookedBy.id === viewerId;

  async function cancel(booking: Booking) {
    const someoneElse = booking.bookedBy.id !== viewerId ? ` milik ${booking.bookedBy.name}` : "";
    if (!window.confirm(`Batalkan "${booking.title}"${someoneElse} ${dayLabel(wibDate(booking.startsAt))}, ${span(booking)}? Ruang langsung bisa dipesan orang lain.`)) return;
    setBusy(booking.id); setNotice(null);
    try {
      const result = await praWamRequest(praWamApi.bookings(booking.id), { method: "DELETE" });
      setNotice({ tone: "success", text: result.message });
      setOpenId(null);
      router.refresh();
    } catch (error) { setNotice({ tone: "error", text: errorText(error) }); }
    finally { setBusy(null); }
  }

  return <>
    <div className={styles.head}>
      <div>
        <p className={styles.kicker}>Appraisal &amp; 1-on-1 · 28 Okt–20 Nov 2026</p>
        <h1>Booking ruang</h1>
        <p>Jam {clockLabel(appraisalRules.open)}–{clockLabel(appraisalRules.close)}, Senin–Jumat. Yang tersimpan lebih dulu yang mendapat ruang.</p>
      </div>
      <ButtonLink href={praWamPath.book({ tanggal: date })}>Pesan ruang</ButtonLink>
    </div>

    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

    <nav className={styles.dates} aria-label="Pilih tanggal">
      {dates.map(day => <a key={day} className={styles.chip} href={praWamPath.appraisal(day)} aria-current={day === date ? "date" : undefined}>
        {day === wibDate(now) ? "Hari ini" : dayLabel(day)}
      </a>)}
    </nav>

    {isToday && <section className={styles.summary} aria-label="Ruang sekarang">
      {bookable.map(room => {
        const current = inRoom(room).find(booking => new Date(booking.startsAt) <= new Date(now) && new Date(booking.endsAt) > new Date(now));
        const next = inRoom(room).find(booking => new Date(booking.startsAt) > new Date(now));
        const closed = new Date(now) >= new Date(wibInstant(date, appraisalRules.close));
        return <div key={room.id} className={styles.roomCard}>
          <h3>{room.name}</h3>
          {closed ? <span className={`${styles.status} ${styles.closed}`}>Sudah tutup hari ini</span>
            : current ? <span className={`${styles.status} ${styles.busy}`}>Dipakai {current.bookedBy.name} sampai {clockLabel(wibTime(current.endsAt))}</span>
            : <span className={`${styles.status} ${styles.free}`}>Kosong {next ? `sampai ${clockLabel(wibTime(next.startsAt))}` : "sampai tutup"}</span>}
          {next && !closed && <span className={styles.meta}>Berikutnya: {next.title}, {span(next)} ({next.bookedBy.name})</span>}
        </div>;
      })}
    </section>}

    <section className={styles.card} aria-labelledby="jadwal">
      <h2 id="jadwal">Jadwal ruang, {dayLabel(date)}</h2>
      <div className={styles.grid} style={{ "--rooms": bookable.length } as React.CSSProperties} role="table" aria-label={`Jadwal ruang ${dayLabel(date)}`}>
        <div className={styles.gridHead} style={{ gridColumn: 1, gridRow: 1 }} role="columnheader">Jam</div>
        {bookable.map((room, column) => <div key={room.id} className={styles.gridHead} style={{ gridColumn: column + 2, gridRow: 1 }} role="columnheader">{room.name}</div>)}
        {slots.map((time, row) => <div key={time} className={styles.gridTime} style={{ gridRow: row + 2 }}>{time.endsWith(":00") ? clockLabel(time) : ""}</div>)}
        {bookable.flatMap((room, column) => slots.map((time, row) => passed(time)
          ? <div key={`${room.id}-${time}`} className={styles.gridCell} style={{ gridColumn: column + 2, gridRow: row + 2 }} />
          : <a key={`${room.id}-${time}`} className={styles.gridCell} style={{ gridColumn: column + 2, gridRow: row + 2 }} href={praWamPath.book({ tanggal: date, ruang: room.id, mulai: time })} aria-label={`Pesan ${room.name} jam ${clockLabel(time)}`} />))}
        {bookable.flatMap((room, column) => inRoom(room).map(booking => {
          const from = slots.indexOf(wibTime(booking.startsAt)), to = slots.indexOf(wibTime(booking.endsAt));
          return <button key={booking.id} type="button" className={`${styles.block} ${mineFlag(booking) ? styles.blockMine : ""}`} style={{ gridColumn: column + 2, gridRow: `${from + 2} / ${(to < 0 ? slots.length : to) + 2}` }}
            aria-expanded={openId === booking.id} aria-controls="rincian" onClick={() => setOpenId(openId === booking.id ? null : booking.id)}>
            <strong>{booking.title}</strong>{booking.bookedBy.name} · {span(booking)}
          </button>;
        }))}
      </div>

      <div className={styles.list}>
        {bookable.map(room => <div key={room.id} className={styles.listRoom}>
          <h3>{room.name}</h3>
          {inRoom(room).length === 0 && <p className={styles.itemEmpty}>Belum ada booking.</p>}
          {inRoom(room).map(booking => <button key={booking.id} type="button" className={styles.item} aria-expanded={openId === booking.id} aria-controls="rincian" onClick={() => setOpenId(openId === booking.id ? null : booking.id)}>
            <span className={styles.itemTime}>{span(booking)}</span>
            <span><strong>{booking.title}</strong><br /><span className={styles.meta}>{mineFlag(booking) ? "Kamu" : booking.bookedBy.name} · {booking.bookedBy.department}</span></span>
          </button>)}
        </div>)}
      </div>
      {opened && <div id="rincian" className={styles.detail} role="region" aria-label="Rincian booking">
        <h3>{opened.title}</h3>
        <span className={styles.meta}>{rooms.find(item => item.id === opened.roomId)?.name}, {span(opened)} · Dipesan {mineFlag(opened) ? "kamu" : `${opened.bookedBy.name} (${opened.bookedBy.department})`}</span>
        {opened.participants && <span className={styles.meta}>{opened.participants.length ? `Bersama ${opened.participants.map(person => person.name).join(", ")}` : "Tanpa partisipan lain"}</span>}
        {opened.description && <span className={styles.meta}>{opened.description}</span>}
        <div className={styles.actions}>
          {mineFlag(opened) && <ButtonLink variant="secondary" href={praWamPath.book({ ubah: opened.id })}>Ubah</ButtonLink>}
          {(mineFlag(opened) || canCancelAny) && new Date(opened.endsAt) > new Date(now) && <button type="button" className="button button--quiet" disabled={busy === opened.id} onClick={() => cancel(opened)}>{busy === opened.id ? "Membatalkan…" : "Batalkan"}</button>}
          <button type="button" className="button button--quiet" onClick={() => setOpenId(null)}>Tutup</button>
        </div>
      </div>}
    </section>

    <section className={styles.card} aria-labelledby="booking-saya">
      <h2 id="booking-saya">Booking saya</h2>
      {mine.length === 0 ? <p className={styles.meta}>Belum ada booking yang kamu pesan atau ikuti.</p> : <div className={styles.mine}>
        {mine.map(booking => {
          const room = rooms.find(item => item.id === booking.roomId)?.name ?? "Ruang";
          const own = mineFlag(booking);
          return <article key={booking.id} className={styles.mineItem}>
            <h3>{booking.title}</h3>
            <span className={styles.meta}>{dayLabel(wibDate(booking.startsAt))}, {span(booking)} · {room}</span>
            <span className={styles.meta}>{own ? "Kamu pemesannya" : `Dipesan ${booking.bookedBy.name}`}{booking.participants?.length ? ` · Bersama ${booking.participants.map(person => person.name).join(", ")}` : ""}</span>
            {booking.description && <span className={styles.meta}>{booking.description}</span>}
            {own && <div className={styles.actions}>
              <ButtonLink variant="secondary" href={praWamPath.book({ ubah: booking.id })}>Ubah</ButtonLink>
              <button type="button" className="button button--quiet" disabled={busy === booking.id} onClick={() => cancel(booking)}>{busy === booking.id ? "Membatalkan…" : "Batalkan"}</button>
            </div>}
          </article>;
        })}
      </div>}
    </section>
  </>;
}
