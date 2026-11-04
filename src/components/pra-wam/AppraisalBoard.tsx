"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays, CalendarPlus, ChevronRight, Clock, DoorOpen, Map as MapIcon, MapPin, Plus, Text, User, Users, X } from "lucide-react";
import { Notice } from "@/components/ui";
import { appraisalRules, clockLabel, dayLabel, draftHours, wibDate, wibInstant, wibTime, type Booking, type Person, type Room } from "@/lib/pra-wam/appraisal";
import { praWamApi, praWamPath } from "@/lib/routes";
import { errorText, praWamRequest } from "./api";
import { roomStatus, type PlanStatus } from "@/lib/pra-wam/floor-plan";
import { bookingKey, DayCalendar, Legend, WeekCalendar, WeekStrip, type BookPick } from "./BookCalendar";
import { BookingForm, type BookingDraft, type PeopleGroup } from "./BookingForm";
import { useConfirm } from "./ConfirmDialog";
import { FloorPlan } from "./FloorPlan";
import { ScreenHead } from "./ScreenHead";
import { Sheet } from "./Sheet";
import styles from "./pra-wam.module.css";
import css from "./book-calendar.module.css";

/** What the booking form needs besides the schedule; null while booking is closed. */
export type BookFormData = { people: Person[]; groups: PeopleGroup[]; usedTitles: { title: string; count: number }[] };
/** A sheet asked for in the address (?booking=, ?edit=, ?new=1&room=&start=&end=). */
export type BookArrival = { booking?: string; edit?: string; create?: { room?: string; start?: string; end?: string } };

type Props = {
  /** The day shown first, and its week (Monday to Friday) whose bookings are all here. */
  date: string; week: string[];
  /** The days the form offers (bookable from today). */
  dates: string[];
  now: string; rooms: Room[]; bookings: Booking[]; mine: Booking[]; viewerId: string; canCancelAny: boolean; open: boolean;
  form: BookFormData | null; arrive: BookArrival;
  /** A line under the title, e.g. that booking is closed. */
  banner?: ReactNode;
};

type SheetState =
  | { kind: "detail"; booking: Booking }
  | { kind: "form"; key: number; editId?: string; initial: BookingDraft; dayOf: string; dayBookings: Booking[] };

const span = (booking: Booking) => `${clockLabel(wibTime(booking.startsAt))}–${clockLabel(wibTime(booking.endsAt))}`;
const shortDate = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const clock = (total: number) => `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
/** The finder's lengths in the booking HTML. */
const lengths = [{ minutes: 30, label: "30 mnt" }, { minutes: 60, label: "1 jam" }, { minutes: 90, label: "1,5 jam" }, { minutes: 120, label: "2 jam" }];
const inPeriod = (date: string) => date >= appraisalRules.periodStart && date <= appraisalRules.periodEnd;

/**
 * Book: a simplified calendar of who has which room (BookCalendar), with the office floor plan as
 * the second view. Everything opens over the page in a sheet from the left (bottom on a phone):
 * a booking's detail with Ubah, Batalkan and Hapus, and the booking form, new or changing one. The
 * open sheet and the day are mirrored in the address (history.replaceState: no reload, no server
 * round trip), so a reload reopens it; another week is a navigation, since its bookings are loaded
 * on the server.
 */
export function AppraisalBoard({ date, week, dates, now, rooms, bookings, mine, viewerId, canCancelAny, open, form, arrive, banner }: Props) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const bookable = rooms.filter(room => room.bookable);
  const canBook = open && !!form;
  const mineFlag = (booking: Booking) => !booking.isSession && booking.bookedBy.id === viewerId;
  const findBooking = (id?: string) => id ? bookings.find(booking => booking.id === id) ?? mine.find(booking => booking.id === id) : undefined;

  // The day shown; back to the server's day when another week arrives.
  const [selected, setSelected] = useState(date);
  const [weekOf, setWeekOf] = useState(week[0]);
  if (weekOf !== week[0]) { setWeekOf(week[0]); setSelected(date); }
  const [view, setView] = useState<"kalender" | "denah">("kalender");
  const [mode, setMode] = useState<"hari" | "minggu">("hari");

  // "Now" moves on while the page is open: the line and what can still be booked.
  const [clockNow, setClockNow] = useState(() => new Date(now));
  useEffect(() => {
    const timer = setInterval(() => setClockNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const today = wibDate(clockNow.toISOString());

  const [formKey, setFormKey] = useState(0);
  const draftFor = (pick: { date?: string; room?: string; start?: string; end?: string }): SheetState => {
    const day = pick.date && dates.includes(pick.date) ? pick.date : dates.includes(selected) ? selected : dates[0] ?? selected;
    const roomId = pick.room && bookable.some(room => room.id === pick.room) ? pick.room : "";
    return { kind: "form", key: formKey + 1, initial: { date: day, ...draftHours(day, clockNow, pick), roomId, title: "", description: "", participants: [] }, ...dayData(day) };
  };
  const editFor = (booking: Booking): SheetState => {
    const day = wibDate(booking.startsAt);
    return {
      kind: "form", key: formKey + 1, editId: booking.id, ...dayData(day),
      initial: { date: day, start: wibTime(booking.startsAt), end: wibTime(booking.endsAt), roomId: booking.roomId, title: booking.title, description: booking.description, participants: (booking.participants ?? []).map(person => person.id) },
    };
  };
  /** The day's bookings when this week holds them; otherwise the form fetches them. */
  function dayData(day: string) {
    return week.includes(day) ? { dayOf: day, dayBookings: bookings.filter(booking => wibDate(booking.startsAt) === day) } : { dayOf: "", dayBookings: [] };
  }

  // A sheet asked for in the address opens on arrival; one that cannot be found says so.
  const [arrival] = useState(() => {
    const found = findBooking(arrive.booking ?? arrive.edit);
    if (arrive.booking) return found ? { sheet: { kind: "detail", booking: found } as SheetState } : { missing: true };
    if (arrive.edit) return found && mineFlag(found) && canBook ? { sheet: editFor(found) } : { missing: true };
    if (arrive.create && canBook) return { sheet: draftFor({ date, ...arrive.create }) };
    return {};
  });
  const [sheet, setSheet] = useState<SheetState | null>(arrival.sheet ?? null);
  const [shown, setShown] = useState(!!arrival.sheet);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(arrival.missing
    ? { tone: "info", text: "Booking itu tidak ada di jadwal. Mungkin sudah dibatalkan atau dipindah." } : null);
  /** "batal:<id>" or "hapus:<id>": which action is running, on which booking. */
  const [busy, setBusy] = useState<string | null>(null);

  // Good news goes away by itself; a problem stays until closed.
  useEffect(() => {
    if (notice?.tone !== "success") return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  /** Mirrors the day and the open sheet in the address, without a reload. */
  function mirror(query: Parameters<typeof praWamPath.bookSheet>[0]) {
    window.history.replaceState(null, "", praWamPath.bookSheet({ date: selected, ...query }));
  }
  function show(next: SheetState) {
    if (next.kind === "form") setFormKey(next.key);
    setSheet(next); setShown(true);
    if (next.kind === "detail") mirror({ date: wibDate(next.booking.startsAt), booking: next.booking.id });
    else if (next.editId) mirror({ date: next.initial.date, edit: next.editId });
    else mirror({ date: next.initial.date, new: "1", room: next.initial.roomId, start: next.initial.start, end: next.initial.end });
  }
  function close() { setShown(false); mirror({}); }
  function pickDay(day: string) {
    setSelected(day); setMode("hari");
    window.history.replaceState(null, "", praWamPath.bookSheet({ date: day }));
  }
  const openBooking = (booking: Booking) => show({ kind: "detail", booking });
  const book = (pick: { date?: string; room?: string; start?: string; end?: string } = {}) => show(draftFor(pick));

  function saved({ message, date: day }: { message: string; date: string }) {
    setShown(false);
    setNotice({ tone: "success", text: message });
    if (week.includes(day)) {
      setSelected(day);
      window.history.replaceState(null, "", praWamPath.bookSheet({ date: day }));
      router.refresh();
    } else router.push(praWamPath.appraisal(day), { scroll: false });
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
      setNotice({ tone: "success", text: result.message || "Booking dibatalkan." });
      close();
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
      setNotice({ tone: "success", text: result.message || "Booking dihapus." });
      close();
      router.refresh();
    } catch (error) { setNotice({ tone: "error", text: errorText(error) }); }
    finally { setBusy(null); }
  }

  const dayBookings = bookings.filter(booking => wibDate(booking.startsAt) === selected);
  const counts = Object.fromEntries(week.map(day => [day, bookings.filter(booking => wibDate(booking.startsAt) === day && bookable.some(room => room.id === booking.roomId)).length]));
  const prev = weekShiftWithin(week, -1), next = weekShiftWithin(week, 1);
  const canBookDay = canBook && inPeriod(selected) && selected >= today;
  const head = <ScreenHead eyebrow="Ruang meeting" title="Book ruang"
    lead={`Jam ${clockLabel(appraisalRules.open)}–${clockLabel(appraisalRules.close)}, Senin–Jumat, 28 Okt–20 Nov. Yang tersimpan lebih dulu yang mendapat ruang.`}
    actions={canBook && dates.length > 0 ? <button type="button" className="button button--primary" onClick={() => book()} aria-haspopup="dialog"><Plus size={18} aria-hidden /> Book ruang</button> : undefined} />;

  return <>
    {head}
    {banner}
    {confirmDialog}

    <div className={css.toolbar}>
      <div className={css.segmented} role="group" aria-label="Tampilan">
        <button type="button" aria-pressed={view === "kalender"} onClick={() => setView("kalender")}><CalendarDays aria-hidden />Kalender</button>
        <button type="button" aria-pressed={view === "denah"} onClick={() => setView("denah")}><MapIcon aria-hidden />Denah</button>
      </div>
      {view === "kalender" && <div className={`${css.segmented} ${css.deskOnly}`} role="group" aria-label="Rentang kalender">
        <button type="button" aria-pressed={mode === "hari"} onClick={() => setMode("hari")}>Hari</button>
        <button type="button" aria-pressed={mode === "minggu"} onClick={() => setMode("minggu")}>Minggu</button>
      </div>}
      {view === "kalender" && <Legend />}
    </div>

    <WeekStrip week={week} selected={selected} today={today} counts={counts} onPick={pickDay}
      prevHref={prev ? praWamPath.appraisal(prev) : undefined} nextHref={next ? praWamPath.appraisal(next) : undefined} />

    {view === "kalender" ? <>
      <div className={`${css.dayTitle} ${mode === "minggu" ? css.deskHide : ""}`}>
        <h2>{dayLabel(selected)}{selected === today ? " · hari ini" : ""}</h2>
        <p>{!inPeriod(selected) ? "Di luar periode appraisal." : selected < today ? "Sudah lewat, hanya untuk dilihat." : canBookDay ? "Ketuk waktu yang kosong untuk book." : open ? "" : "Book ruang sedang ditutup."}</p>
      </div>
      {mode === "minggu" && <div className={css.deskWeek}>
        <WeekCalendar week={week} rooms={bookable} bookings={bookings} viewerId={viewerId} today={today} selected={selected} onPickDay={pickDay} />
      </div>}
      <DayCalendar date={selected} rooms={bookable} bookings={dayBookings} now={clockNow} viewerId={viewerId} canBook={canBookDay}
        onOpen={openBooking} onBook={(pick: BookPick) => book({ date: selected, room: pick.room.id, start: pick.start, end: pick.end })} phoneOnly={mode === "minggu"} />
    </> : <PlanView key={selected} date={selected} now={clockNow} rooms={rooms} bookings={dayBookings} viewerId={viewerId} canBook={canBookDay}
      onBook={(room, start, end) => book({ date: selected, room: room.id, start, end })} />}

    <p className={styles.sectionLabel}>Booking saya</p>
    {mine.length === 0 ? <div className={styles.emptyRow}>
      <span className={styles.tile} aria-hidden><CalendarPlus /></span>
      <p>Belum ada booking yang kamu pesan atau ikuti.</p>
      {canBook && dates.length > 0 && <button type="button" className="button button--secondary" onClick={() => book()}>Book ruang</button>}
    </div> : <ul className={css.mineList}>
      {mine.map(booking => <li key={bookingKey(booking)}>
        <button type="button" className={`${css.mineRow} ${mineFlag(booking) ? css.mine : css.busy}`} onClick={() => openBooking(booking)} aria-haspopup="dialog">
          <span className={css.when}><b>{shortDate(wibDate(booking.startsAt))}</b>{span(booking)}</span>
          <span className={css.what}>
            <strong>{booking.title}</strong>
            <small>{rooms.find(room => room.id === booking.roomId)?.name ?? "Ruang"} · {mineFlag(booking) ? "Kamu pemesannya" : `Dipesan ${booking.bookedBy.name}`}</small>
          </span>
          <ChevronRight className={css.rowIcon} aria-hidden />
        </button>
      </li>)}
    </ul>}

    {sheet?.kind === "detail" && <BookingSheet booking={sheet.booking} shown={shown} onClose={close} rooms={rooms} now={clockNow}
      mine={mineFlag(sheet.booking)} canEdit={canBook && mineFlag(sheet.booking)} canCancel={!sheet.booking.isSession && (mineFlag(sheet.booking) || canCancelAny)}
      busy={busy} onEdit={() => show(editFor(sheet.booking))} onCancel={() => cancel(sheet.booking)} onRemove={() => remove(sheet.booking)} />}

    {sheet?.kind === "form" && form && <BookingForm key={sheet.key} editId={sheet.editId} initial={sheet.initial}
      dates={dates.includes(sheet.initial.date) ? dates : [sheet.initial.date, ...dates]} now={clockNow.toISOString()} rooms={rooms}
      people={form.people} groups={form.groups} viewer={{ id: viewerId }} usedTitles={form.usedTitles}
      dayBookings={sheet.dayBookings} dayOf={sheet.dayOf} onSaved={saved}
      frame={(body, footer) => <Sheet open={shown} onClose={close} side="left" wide title={sheet.editId ? "Ubah booking" : "Book ruang"}
        subtitle="Yang tersimpan lebih dulu yang mendapat ruang." footer={footer}>{body}</Sheet>} />}

    {notice && <div className={css.toast}>
      <Notice tone={notice.tone}>{notice.text}</Notice>
      <button type="button" className={css.toastClose} onClick={() => setNotice(null)} aria-label="Tutup pesan"><X aria-hidden /></button>
    </div>}
  </>;
}

/** The Monday of the week before or after, when that week still has days in the period. */
function weekShiftWithin(week: string[], step: -1 | 1): string | null {
  const day = new Date(`${week[0]}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + step * 7);
  const monday = day.toISOString().slice(0, 10);
  day.setUTCDate(day.getUTCDate() + 4);
  const friday = day.toISOString().slice(0, 10);
  return friday >= appraisalRules.periodStart && monday <= appraisalRules.periodEnd ? (monday < appraisalRules.periodStart ? appraisalRules.periodStart : monday) : null;
}

/** One booking in the sheet: when, where, who, and what can be done with it. */
function BookingSheet({ booking, shown, onClose, rooms, now, mine, canEdit, canCancel, busy, onEdit, onCancel, onRemove }: {
  booking: Booking; shown: boolean; onClose: () => void; rooms: Room[]; now: Date; mine: boolean; canEdit: boolean; canCancel: boolean;
  busy: string | null; onEdit: () => void; onCancel: () => void; onRemove: () => void;
}) {
  const room = rooms.find(item => item.id === booking.roomId);
  const ended = new Date(booking.endsAt) <= now;
  const working = !!busy && busy.endsWith(booking.id);
  const tone = booking.isSession ? css.session : mine ? css.mine : css.busy;
  const actions = <>
    {canEdit && !ended && <button type="button" className="button button--secondary" onClick={onEdit} disabled={working}>Ubah</button>}
    {canCancel && !ended && <button type="button" className="button button--quiet" onClick={onCancel} disabled={working}>{busy === `batal:${booking.id}` ? "Membatalkan…" : "Batalkan"}</button>}
    {canCancel && <button type="button" className={`button button--quiet ${styles.dangerQuiet}`} onClick={onRemove} disabled={working}>{busy === `hapus:${booking.id}` ? "Menghapus…" : "Hapus"}</button>}
  </>;
  const hasActions = canCancel || (canEdit && !ended);
  return <Sheet open={shown} onClose={onClose} side="left" title={booking.title} subtitle={`${dayLabel(wibDate(booking.startsAt))} · ${span(booking)}`} footer={hasActions ? actions : undefined}>
    <span className={`${css.tag} ${tone}`}>{booking.isSession ? "Sesi Pra WAM" : mine ? "Booking kamu" : "Terpakai"}{ended ? " · selesai" : ""}</span>
    <dl className={css.facts}>
      <div><DoorOpen aria-hidden /><dt>Ruang</dt><dd>{room?.name ?? "Ruang"}{room?.capacity ? <small>Kapasitas {room.capacity} orang</small> : null}</dd></div>
      <div><Clock aria-hidden /><dt>Waktu</dt><dd>{dayLabel(wibDate(booking.startsAt))}<small>{span(booking)}</small></dd></div>
      <div><User aria-hidden /><dt>Pemesan</dt><dd>{booking.isSession ? "Panitia Pra WAM" : mine ? "Kamu" : booking.bookedBy.name}{!booking.isSession && !mine && booking.bookedBy.department ? <small>{booking.bookedBy.department}</small> : null}</dd></div>
      {booking.participants && <div><Users aria-hidden /><dt>Partisipan</dt><dd>{booking.participants.length ? booking.participants.map(person => person.name).join(", ") : "Tanpa partisipan lain"}</dd></div>}
      {booking.description && <div><Text aria-hidden /><dt>Deskripsi</dt><dd>{booking.description}</dd></div>}
    </dl>
    {booking.isSession && <p className={css.sheetNote}><MapPin size={14} aria-hidden /> Ruang ini dipegang sesi Pra WAM dan tidak bisa dibooking pada jam itu. Panitia yang mengaturnya.</p>}
    {!booking.isSession && !booking.participants && <p className={css.sheetNote}>Partisipan dan deskripsi hanya terlihat oleh pemesan, partisipan, dan panitia.</p>}
  </Sheet>;
}

/** Denah: the office floor plan for the day, for a start time and length; a free room opens the form. */
function PlanView({ date, now, rooms, bookings, viewerId, canBook, onBook }: {
  date: string; now: Date; rooms: Room[]; bookings: Booking[]; viewerId: string; canBook: boolean; onBook: (room: Room, start: string, end: string) => void;
}) {
  const today = wibDate(now.toISOString());
  const starts = (canBook ? draftStarts(date, now) : []);
  const [chosen, setChosen] = useState(starts[0] ?? "");
  const start = starts.includes(chosen) ? chosen : starts[0] ?? "";
  const [length, setLength] = useState(60);
  const end = start ? clock(Math.min(minutes(start) + length, minutes(appraisalRules.close))) : "";
  const planSpan = start ? { startsAt: wibInstant(date, start), endsAt: wibInstant(date, end) } : null;
  const statusOf = (room: Room): PlanStatus => !start && room.bookable
    ? { tone: "closed", text: date < today ? "Sudah lewat" : canBook ? "Sudah tutup" : "Tidak bisa dibooking" }
    : roomStatus({ bookable: room.bookable, span: planSpan, now, holds: bookings.filter(booking => booking.roomId === room.id).map(booking => ({ startsAt: booking.startsAt, endsAt: booking.endsAt, mine: !booking.isSession && booking.bookedBy.id === viewerId })) });
  return <section className={`${styles.card} ${css.planCard}`} aria-label={`Denah kantor ${dayLabel(date)}`}>
    {starts.length > 0 ? <div className={css.finder}>
      <div>
        <label className={styles.label} htmlFor="plan-start">Mulai</label>
        <select id="plan-start" className="select" value={start} onChange={event => setChosen(event.target.value)}>
          {starts.map(time => <option key={time} value={time}>{clockLabel(time)}</option>)}
        </select>
      </div>
      <div>
        <span className={styles.label} id="plan-length">Durasi</span>
        <div className={css.lengths} role="group" aria-labelledby="plan-length">
          {lengths.map(item => <button key={item.minutes} type="button" className={`${styles.chip} ${styles.chipSmall}`} aria-pressed={item.minutes === length} onClick={() => setLength(item.minutes)}>{item.label}</button>)}
        </div>
      </div>
    </div> : <p className={styles.meta} style={{ margin: 0 }}>{date < today || (date === today && !canBook) ? "Jam operasional hari ini sudah lewat atau tanggal ini sudah lewat. Pilih hari lain untuk book ruang." : "Denah hanya untuk dilihat."}</p>}
    <FloorPlan rooms={rooms} statusOf={statusOf} onPick={canBook && start ? room => onBook(room, start, end) : undefined} action="Book ruang ini"
      label={`Denah kantor, ${dayLabel(date)}${start ? `, ${clockLabel(start)}–${clockLabel(end)}` : ""}`}
      caption={canBook && start ? "Ketuk ruang yang kosong untuk book." : undefined} />
  </section>;
}

/** Start times on `date` that have not begun. */
const draftStarts = (date: string, now: Date) => {
  const times: string[] = [];
  for (let at = minutes(appraisalRules.open); at < minutes(appraisalRules.close); at += appraisalRules.stepMinutes) {
    const time = clock(at);
    if (new Date(wibInstant(date, time)) > now) times.push(time);
  }
  return times;
};
