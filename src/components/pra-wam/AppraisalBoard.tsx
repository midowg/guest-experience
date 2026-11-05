"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Clock, DoorOpen, Map as MapIcon, MapPin, Plus, Text, User, Users, X } from "lucide-react";
import { Notice } from "@/components/ui";
import { appraisalRules, bookingWhere, clockLabel, dayLabel, draftHours, isOutside, isWorkday, loadedWeek, OUTSIDE_ROOM, weekShift, wibDate, wibTime, workWeek, type Booking, type Person, type Room } from "@/lib/pra-wam/appraisal";
import { praWamApi, praWamPath } from "@/lib/routes";
import { errorText, praWamRequest } from "./api";
import { placeRooms } from "@/lib/pra-wam/floor-plan";
import { daySummaries, roomDay, type DayStatus, type DaySummary } from "@/lib/pra-wam/room-day";
import { bookingKey, DayCalendar, Legend, WeekCalendar, type BookPick } from "./BookCalendar";
import { BookingForm, type BookingDraft, type PeopleGroup } from "./BookingForm";
import { useConfirm } from "./ConfirmDialog";
import { FloorPlan } from "./FloorPlan";
import { MonthCalendar } from "./MonthCalendar";
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
  /** Whether the floor plan is offered next to the calendar (the super admin's setting); default true. */
  floorPlan?: boolean;
  /** Per weekday of the booking window: holds and whether it is full (windowSummary); the loaded week is recounted here. */
  summary?: Record<string, DaySummary>;
};

type SheetState =
  | { kind: "detail"; booking: Booking }
  | { kind: "form"; key: number; editId?: string; initial: BookingDraft; dayOf: string; dayBookings: Booking[] };

const span = (booking: Booking) => `${clockLabel(wibTime(booking.startsAt))}–${clockLabel(wibTime(booking.endsAt))}`;
const shortDate = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const inPeriod = (date: string) => date >= appraisalRules.periodStart && date <= appraisalRules.periodEnd;

/**
 * Book: a simplified calendar of who has which room (BookCalendar), with the office floor plan as
 * the second view. Everything opens over the page in a sheet from the left (bottom on a phone):
 * a booking's detail with Ubah and Batalkan, and the booking form, new or changing one. The open
 * sheet and the day are mirrored in the address (history.replaceState: no reload, no server round
 * trip), so a reload reopens it; a day in another week (picked on the date strip) is a navigation,
 * since its bookings are loaded on the server.
 */
export function AppraisalBoard({ date, week, dates, now, rooms, bookings, mine, viewerId, canCancelAny, open, form, arrive, banner, floorPlan = true, summary = {} }: Props) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const bookable = rooms.filter(room => room.bookable);
  // Monday to Sunday are loaded: a weekend has no rooms but may hold "Di luar kantor".
  const loaded = loadedWeek(week[0]);
  const canBook = open && !!form;
  const mineFlag = (booking: Booking) => !booking.isSession && booking.bookedBy.id === viewerId;
  const findBooking = (id?: string) => id ? bookings.find(booking => booking.id === id) ?? mine.find(booking => booking.id === id) : undefined;

  // The day shown; back to the server's day when another week arrives.
  const [selected, setSelected] = useState(date);
  const [weekOf, setWeekOf] = useState(week[0]);
  if (weekOf !== week[0]) { setWeekOf(week[0]); setSelected(date); }
  const [chosenView, setView] = useState<"kalender" | "denah">("kalender");
  // With the floor plan switched off by the super admin, only the calendar.
  const view = floorPlan ? chosenView : "kalender";
  // From 1024px the week grid first (DS "Jadwal, tampilan minggu"); a phone always shows the day.
  const [mode, setMode] = useState<"hari" | "minggu">("minggu");
  const [weekRoom, setWeekRoom] = useState(() => bookable[0]?.id ?? "");

  // "Now" moves on while the page is open: the line and what can still be booked.
  const [clockNow, setClockNow] = useState(() => new Date(now));
  useEffect(() => {
    const timer = setInterval(() => setClockNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const today = wibDate(clockNow.toISOString());

  const [formKey, setFormKey] = useState(0);
  const draftFor = (pick: { date?: string; room?: string; start?: string; end?: string }): SheetState => {
    const ahead = (value: string) => inPeriod(value) && value >= today;
    const day = pick.date && (dates.includes(pick.date) || (pick.room === OUTSIDE_ROOM && ahead(pick.date))) ? pick.date : dates.includes(selected) ? selected : dates[0] ?? selected;
    const roomId = pick.room === OUTSIDE_ROOM || (pick.room && bookable.some(room => room.id === pick.room)) ? pick.room! : "";
    return { kind: "form", key: formKey + 1, initial: { date: day, ...draftHours(day, clockNow, pick), roomId, title: "", description: "", participants: [] }, ...dayData(day) };
  };
  const editFor = (booking: Booking): SheetState => {
    const day = wibDate(booking.startsAt);
    return {
      kind: "form", key: formKey + 1, editId: booking.id, ...dayData(day),
      initial: { date: day, start: wibTime(booking.startsAt), end: wibTime(booking.endsAt), roomId: booking.roomId, place: booking.place ?? "", title: booking.title, description: booking.description, participants: (booking.participants ?? []).map(person => person.id) },
    };
  };
  /** The day's bookings when this week holds them; otherwise the form fetches them. */
  function dayData(day: string) {
    return loaded.includes(day) ? { dayOf: day, dayBookings: bookings.filter(booking => wibDate(booking.startsAt) === day) } : { dayOf: "", dayBookings: [] };
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
  /** "batal:<id>": the cancel running, on which booking. */
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
  /** A day picked: in this week it shows at once, another week loads. `toDay`: switch the desktop to the day view. */
  function pickDay(day: string, toDay = true) {
    if (!loaded.includes(day)) { router.push(praWamPath.appraisal(day), { scroll: false }); return; }
    setSelected(day);
    if (toDay) setMode("hari");
    window.history.replaceState(null, "", praWamPath.bookSheet({ date: day }));
  }
  /** The week grid's arrows: the first day of the week before or after that is in the period. */
  function goWeek(direction: -1 | 1) {
    const target = workWeek(weekShift(selected, direction)).find(inPeriod);
    if (target) router.push(praWamPath.appraisal(target), { scroll: false });
  }

  const openBooking = (booking: Booking) => show({ kind: "detail", booking });
  const book = (pick: { date?: string; room?: string; start?: string; end?: string } = {}) => show(draftFor(pick));

  function saved({ message, date: day }: { message: string; date: string }) {
    setShown(false);
    setNotice({ tone: "success", text: message });
    if (loaded.includes(day)) {
      setSelected(day);
      window.history.replaceState(null, "", praWamPath.bookSheet({ date: day }));
      router.refresh();
    } else router.push(praWamPath.appraisal(day), { scroll: false });
  }

  /** Cancelling frees the room at once and takes the booking off the schedule and "Booking saya". */
  async function cancel(booking: Booking) {
    const someoneElse = booking.bookedBy.id !== viewerId ? ` milik ${booking.bookedBy.name}` : "";
    const room = bookingWhere(booking, rooms);
    if (!(await confirm({
      title: "Batalkan booking?",
      body: `"${booking.title}"${someoneElse}, ${dayLabel(wibDate(booking.startsAt))}, ${span(booking)}, ${room}.${isOutside(booking) ? "" : " Ruang langsung bisa dipesan orang lain."}`,
      confirmLabel: "Batalkan booking",
      danger: true,
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

  const dayBookings = bookings.filter(booking => wibDate(booking.startsAt) === selected);
  // The loaded week is recounted from its bookings with the moving clock; the rest is the server's.
  const days = { ...summary, ...daySummaries(week, rooms, bookings.map(booking => ({ roomId: booking.roomId, startsAt: booking.startsAt, endsAt: booking.endsAt, session: booking.isSession })), clockNow) };
  const canBookDay = canBook && inPeriod(selected) && selected >= today && isWorkday(selected);
  // A Saturday or Sunday: no rooms. "Di luar kantor" is chosen inside the booking form only (5 Nov 2026).
  const weekendDay = !isWorkday(selected);
  const weekendPanel = <section className={`${styles.card} ${css.weekend}`} aria-label={`Akhir pekan, ${dayLabel(selected)}`}>
    <DayHead date={selected} today={today} />
    <p className={css.weekendText}>Ruang kantor tutup di akhir pekan.</p>
  </section>;
  // One short word when the day cannot be booked; nothing on an ordinary day.
  const dayNote = !inPeriod(selected) ? "Di luar periode" : selected < today ? "Sudah lewat" : !open ? "Book ditutup" : null;
  // The month calendar (DS "Kalender · tanggal terpilih") picks the day for both views.
  const calendar = <MonthCalendar from={appraisalRules.periodStart} to={appraisalRules.periodEnd} selected={selected} today={today} summary={days}
    mine={mine.map(booking => wibDate(booking.startsAt))} onPick={day => pickDay(day, false)} label="Pilih hari" />;
  const head = <ScreenHead title="Book ruang"
    actions={canBook && dates.length > 0 ? <button type="button" className="button button--primary" onClick={() => book()} aria-haspopup="dialog"><Plus size={18} aria-hidden /> Book ruang</button> : undefined} />;

  return <>
    {head}
    {banner}
    {confirmDialog}

    <div className={css.toolbar}>
      {floorPlan && <div className={css.segmented} role="group" aria-label="Tampilan">
        <button type="button" aria-pressed={view === "kalender"} onClick={() => setView("kalender")}><CalendarDays aria-hidden />Kalender</button>
        <button type="button" aria-pressed={view === "denah"} onClick={() => setView("denah")}><MapIcon aria-hidden />Denah</button>
      </div>}
      {view === "kalender" && <div className={`${css.segmented} ${css.deskOnly}`} role="group" aria-label="Rentang kalender">
        <button type="button" aria-pressed={mode === "hari"} onClick={() => setMode("hari")}>Hari</button>
        <button type="button" aria-pressed={mode === "minggu"} onClick={() => setMode("minggu")}>Minggu</button>
      </div>}
    </div>

    {view === "kalender" ? <div className={css.layout}>
      <div className={css.side}>
        {calendar}
        <Legend />
      </div>
      {weekendDay ? <div className={css.main}>{weekendPanel}</div> : <div className={css.main}>
        <DayHead date={selected} today={today} note={dayNote} className={mode === "minggu" ? css.deskHide : undefined} />
        {mode === "minggu" && <div className={css.deskWeek}>
          <WeekCalendar week={week} rooms={bookable} bookings={bookings} viewerId={viewerId} now={clockNow} today={today} selected={selected} canBook={canBook}
            roomId={weekRoom} onRoom={setWeekRoom} onPickDay={pickDay} onWeek={goWeek} onOpen={openBooking}
            onBook={pick => book({ date: pick.date, room: pick.room.id, start: pick.start, end: pick.end })} />
        </div>}
        <DayCalendar date={selected} rooms={bookable} bookings={dayBookings} now={clockNow} viewerId={viewerId} canBook={canBookDay}
          onOpen={openBooking} onBook={(pick: BookPick) => book({ date: selected, room: pick.room.id, start: pick.start, end: pick.end })} phoneOnly={mode === "minggu"} />
      </div>}
    </div> : <PlanView key={selected} date={selected} today={today} now={clockNow} rooms={rooms} bookings={dayBookings} canBook={canBookDay} weekend={weekendDay}
      note={weekendDay ? "Akhir pekan" : dayNote} onDay={day => pickDay(day, false)} onBookRoom={room => book({ date: selected, room: room.id })} />}

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
            <small>{bookingWhere(booking, rooms)} · {mineFlag(booking) ? "Kamu pemesannya" : `Dipesan ${booking.bookedBy.name}`}</small>
          </span>
          <ChevronRight className={css.rowIcon} aria-hidden />
        </button>
      </li>)}
    </ul>}

    {sheet?.kind === "detail" && <BookingSheet booking={sheet.booking} shown={shown} onClose={close} rooms={rooms} now={clockNow}
      mine={mineFlag(sheet.booking)} canEdit={canBook && mineFlag(sheet.booking)} canCancel={!sheet.booking.isSession && (mineFlag(sheet.booking) || canCancelAny)}
      busy={busy} onEdit={() => show(editFor(sheet.booking))} onCancel={() => cancel(sheet.booking)} />}

    {sheet?.kind === "form" && form && <BookingForm key={sheet.key} editId={sheet.editId} initial={sheet.initial}
      dates={dates.includes(sheet.initial.date) ? dates : [sheet.initial.date, ...dates]} now={clockNow.toISOString()} rooms={rooms}
      people={form.people} groups={form.groups} viewer={{ id: viewerId }} usedTitles={form.usedTitles}
      dayBookings={sheet.dayBookings} dayOf={sheet.dayOf} onSaved={saved} showPlan={floorPlan} summary={days}
      frame={(body, footer) => <Sheet open={shown} onClose={close} side="left" wide title={sheet.editId ? "Ubah booking" : "Book ruang"}
        subtitle="Yang tersimpan lebih dulu yang mendapat ruang." footer={footer}>{body}</Sheet>} />}

    {notice && <div className={css.toast}>
      <Notice tone={notice.tone}>{notice.text}</Notice>
      <button type="button" className={css.toastClose} onClick={() => setNotice(null)} aria-label="Tutup pesan"><X aria-hidden /></button>
    </div>}
  </>;
}

/** One booking in the sheet: when, where, who, and what can be done with it. */
function BookingSheet({ booking, shown, onClose, rooms, now, mine, canEdit, canCancel, busy, onEdit, onCancel }: {
  booking: Booking; shown: boolean; onClose: () => void; rooms: Room[]; now: Date; mine: boolean; canEdit: boolean; canCancel: boolean;
  busy: string | null; onEdit: () => void; onCancel: () => void;
}) {
  const room = rooms.find(item => item.id === booking.roomId);
  const ended = new Date(booking.endsAt) <= now;
  const working = !!busy && busy.endsWith(booking.id);
  const tone = booking.isSession ? css.session : mine ? css.mine : css.busy;
  const actions = <>
    {canEdit && !ended && <button type="button" className="button button--secondary" onClick={onEdit} disabled={working}>Ubah</button>}
    {canCancel && !ended && <button type="button" className={`button button--secondary ${styles.dangerQuiet}`} onClick={onCancel} disabled={working}>{working ? "Membatalkan…" : "Batalkan"}</button>}
  </>;
  const hasActions = !ended && (canCancel || canEdit);
  return <Sheet open={shown} onClose={onClose} side="left" title={booking.title} subtitle={`${dayLabel(wibDate(booking.startsAt))} · ${span(booking)}`} footer={hasActions ? actions : undefined}>
    <span className={`${css.tag} ${tone}`}>{booking.isSession ? "Sesi Pra WAM" : mine ? "Booking kamu" : "Terpakai"}{ended ? " · selesai" : ""}</span>
    <dl className={css.facts}>
      {isOutside(booking)
        ? <div><MapPin aria-hidden /><dt>Tempat</dt><dd>{booking.place || "Tempat belum diisi"}<small>Di luar kantor</small></dd></div>
        : <div><DoorOpen aria-hidden /><dt>Ruang</dt><dd>{room?.name ?? "Ruang"}{room?.capacity ? <small>Kapasitas {room.capacity} orang</small> : null}</dd></div>}
      <div><Clock aria-hidden /><dt>Waktu</dt><dd>{dayLabel(wibDate(booking.startsAt))}<small>{span(booking)}</small></dd></div>
      <div><User aria-hidden /><dt>Pemesan</dt><dd>{booking.isSession ? "Panitia Pra WAM" : mine ? "Kamu" : booking.bookedBy.name}{!booking.isSession && !mine && booking.bookedBy.department ? <small>{booking.bookedBy.department}</small> : null}</dd></div>
      {booking.participants && <div><Users aria-hidden /><dt>Partisipan</dt><dd>{booking.participants.length ? booking.participants.map(person => person.name).join(", ") : "Tanpa partisipan lain"}</dd></div>}
      {booking.description && <div><Text aria-hidden /><dt>Deskripsi</dt><dd>{booking.description}</dd></div>}
    </dl>
    {booking.isSession && <p className={css.sheetNote}><MapPin size={14} aria-hidden /> Ruang ini dipegang sesi Pra WAM dan tidak bisa dibooking pada jam itu. Panitia yang mengaturnya.</p>}
    {!booking.isSession && !booking.participants && <p className={css.sheetNote}>Partisipan dan deskripsi hanya terlihat oleh pemesan, partisipan, dan panitia.</p>}
  </Sheet>;
}

/** A day's title: the date, and a small "Hari ini" or a word on why it cannot be booked. */
function DayHead({ date, today, note, className }: { date: string; today: string; note?: string | null; className?: string }) {
  return <div className={`${css.dayTitle} ${className ?? ""}`}>
    <h2>{dayLabel(date)}</h2>
    {date === today ? <span className={css.dayTag}>Hari ini</span> : note ? <span className={`${css.dayTag} ${css.dayTagMuted}`}>{note}</span> : null}
  </div>;
}

const nextDay = (date: string, by: number) => new Date(Date.parse(`${date}T12:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10);

/**
 * Denah (5 Nov 2026): only the plan. The day above it steps with ‹ ›, every room shows the day's
 * status in its chairs' colour, and a tap on a room opens its label: name, people and facilities,
 * status and "Book ruang ini" when it can still be booked that day. The room cards stay with Kalender.
 */
function PlanView({ date, today, now, rooms, bookings, canBook, weekend, note, onDay, onBookRoom }: {
  date: string; today: string; now: Date; rooms: Room[]; bookings: Booking[]; canBook: boolean;
  /** A Saturday or Sunday: every room closed. */
  weekend: boolean;
  /** Why the day cannot be booked, in a word; null on an ordinary day. */
  note: string | null;
  onDay: (date: string) => void; onBookRoom: (room: Room) => void;
}) {
  const outside = !inPeriod(date);
  const placed = placeRooms(rooms).placed.map(item => item.room);
  const dayOf = (room: Room) => roomDay({ date, bookable: room.bookable, now, holds: bookings.filter(booking => booking.roomId === room.id).map(booking => ({ startsAt: booking.startsAt, endsAt: booking.endsAt, session: booking.isSession })) });
  const statusOf = (room: Room): DayStatus => weekend && room.bookable ? { tone: "closed", text: "Akhir pekan" }
    : outside && room.bookable ? { tone: "closed", text: "Di luar periode" } : dayOf(room).status;
  const anyClosed = placed.some(room => statusOf(room).tone === "closed");
  const before = nextDay(date, -1), after = nextDay(date, 1);
  return <section className={`${styles.card} ${css.planCard}`} aria-label={`Denah kantor ${dayLabel(date)}`}>
    <div className={css.planDay}>
      <button type="button" className={css.round} onClick={() => onDay(before)} disabled={before < appraisalRules.periodStart} aria-label="Hari sebelumnya"><ChevronLeft aria-hidden /></button>
      <DayHead date={date} today={today} note={note} />
      <button type="button" className={css.round} onClick={() => onDay(after)} disabled={after > appraisalRules.periodEnd} aria-label="Hari berikutnya"><ChevronRight aria-hidden /></button>
    </div>
    <FloorPlan rooms={rooms} statusOf={statusOf} label={`Denah kantor, ${dayLabel(date)}`}
      otherSpots="plain" showUnplaced={false}
      activeOf={(room, status) => canBook && room.bookable && (status.tone === "free" || status.tone === "part")}
      tipAction={(room, status) => canBook && room.bookable && (status.tone === "free" || status.tone === "part") ? { label: "Book ruang ini", run: () => onBookRoom(room) } : null}
      legend={anyClosed ? ["free", "part", "full", "closed", "off"] : ["free", "part", "full", "off"]}
      legendLabels={{ part: "Sebagian", full: "Penuh", closed: weekend ? "Tutup" : outside ? "Di luar periode" : "Sudah lewat", off: "Bukan ruang booking" }}
      caption={canBook ? "Ruang bergaris biru bisa dibooking. Ketuk untuk detail." : undefined} />
  </section>;
}
