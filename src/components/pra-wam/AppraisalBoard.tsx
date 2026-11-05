"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays, CalendarPlus, ChevronRight, Clock, DoorOpen, Map as MapIcon, MapPin, Plus, Text, User, Users, X } from "lucide-react";
import { Notice } from "@/components/ui";
import { appraisalRules, bookingWhere, clockAt, clockLabel, dayLabel, draftHours, isOutside, isWorkday, loadedWeek, nowOffset, OUTSIDE_ROOM, weekShift, wibDate, wibTime, workWeek, type Booking, type Person, type Room } from "@/lib/pra-wam/appraisal";
import { praWamApi, praWamPath } from "@/lib/routes";
import { errorText, praWamRequest } from "./api";
import { placeRooms } from "@/lib/pra-wam/floor-plan";
import { daySummaries, roomDay, type DayStatus, type DaySummary } from "@/lib/pra-wam/room-day";
import { bookingKey, DayCalendar, Legend, OutsideDay, RoomList, WeekCalendar, type BookPick } from "./BookCalendar";
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
  // A Saturday or Sunday: no rooms, only "Di luar kantor" (5 Nov 2026).
  const weekendDay = !isWorkday(selected);
  const canAway = canBook && inPeriod(selected) && selected >= today;
  const weekendPanel = <section className={`${styles.card} ${css.weekend}`} aria-label={`Akhir pekan, ${dayLabel(selected)}`}>
    <div className={css.dayTitle}><h2>{dayLabel(selected)}{selected === today ? " · hari ini" : ""}</h2></div>
    <p className={css.weekendText}>Ruang kantor hanya bisa dibooking Senin–Jumat. Di akhir pekan kamu bisa membooking kegiatan <b>di luar kantor</b> dengan nama tempatnya; jam bebas, sampai 23.30.</p>
    {canAway && <button type="button" className="button button--primary" onClick={() => book({ date: selected, room: OUTSIDE_ROOM })} aria-haspopup="dialog"><MapPin size={18} aria-hidden /> Book di luar kantor</button>}
    {!inPeriod(selected) ? <p className={css.weekendText}>Di luar periode appraisal.</p> : selected < today ? <p className={css.weekendText}>Sudah lewat, hanya untuk dilihat.</p> : !open ? <p className={css.weekendText}>Book ruang sedang ditutup.</p> : null}
  </section>;
  const nowLine = nowOffset(selected, clockNow);
  // The month calendar (DS "Kalender · tanggal terpilih") picks the day for both views.
  const calendar = <MonthCalendar from={appraisalRules.periodStart} to={appraisalRules.periodEnd} selected={selected} today={today} summary={days}
    mine={mine.map(booking => wibDate(booking.startsAt))} onPick={day => pickDay(day, false)} label="Pilih hari" />;
  const head = <ScreenHead eyebrow="Ruang meeting" title="Book ruang"
    lead={`Ruang ${clockLabel(appraisalRules.open)}–${clockLabel(appraisalRules.close)}, Senin–Jumat, 28 Okt–20 Nov; di luar kantor boleh kapan saja. Yang tersimpan lebih dulu yang mendapat ruang.`}
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
        <div className={`${css.dayTitle} ${mode === "minggu" ? css.deskHide : ""}`}>
          <h2>{dayLabel(selected)}{selected === today ? " · hari ini" : ""}</h2>
          <p>{nowLine != null ? `Sekarang ${clockLabel(clockAt(nowLine))}. ` : ""}{!inPeriod(selected) ? "Di luar periode appraisal." : selected < today ? "Sudah lewat, hanya untuk dilihat." : canBookDay ? "Ketuk waktu yang kosong untuk book." : open ? "" : "Book ruang sedang ditutup."}</p>
        </div>
        {mode === "minggu" && <div className={css.deskWeek}>
          <WeekCalendar week={week} rooms={bookable} bookings={bookings} viewerId={viewerId} now={clockNow} today={today} selected={selected} canBook={canBook}
            roomId={weekRoom} onRoom={setWeekRoom} onPickDay={pickDay} onWeek={goWeek} onOpen={openBooking}
            onBook={pick => book({ date: pick.date, room: pick.room.id, start: pick.start, end: pick.end })} />
        </div>}
        <DayCalendar date={selected} rooms={bookable} bookings={dayBookings} now={clockNow} viewerId={viewerId} canBook={canBookDay}
          onOpen={openBooking} onBook={(pick: BookPick) => book({ date: selected, room: pick.room.id, start: pick.start, end: pick.end })} phoneOnly={mode === "minggu"} />
      </div>}
    </div> : <>
      <div className={css.planPicker}>{calendar}</div>
      {weekendDay ? weekendPanel : <PlanView key={selected} date={selected} today={today} now={clockNow} rooms={rooms} bookable={bookable} bookings={dayBookings} viewerId={viewerId} canBook={canBookDay} open={open}
        onOpen={openBooking} onBook={(pick: BookPick) => book({ date: selected, room: pick.room.id, start: pick.start, end: pick.end })} />}
    </>}

    {/* Outside the office: the same under Kalender and Denah, phone and desktop. */}
    <div className={css.outsideWrap}><OutsideDay date={selected} bookings={dayBookings} now={clockNow} viewerId={viewerId} onOpen={openBooking} /></div>

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

/**
 * Denah: the office floor plan for the whole day, each room empty, partly used, full or not
 * bookable, with its key. Under it the same room cards as under Kalender (RoomList): the switch
 * only changes the picture and its key (5 Nov 2026). Tapping a room on the plan brings its card
 * into view and marks it. WAM rooms without a spot on the plan are not drawn, but keep their card.
 */
function PlanView({ date, today, now, rooms, bookable, bookings, viewerId, canBook, open, onOpen, onBook }: {
  date: string; today: string; now: Date; rooms: Room[]; bookable: Room[]; bookings: Booking[]; viewerId: string; canBook: boolean; open: boolean;
  onOpen: (booking: Booking) => void; onBook: (pick: BookPick) => void;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const outside = !inPeriod(date);
  const placed = placeRooms(rooms).placed.map(item => item.room);
  const holdsOf = (room: Room) => bookings.filter(booking => booking.roomId === room.id);
  const dayOf = (room: Room) => roomDay({ date, bookable: room.bookable, now, holds: holdsOf(room).map(booking => ({ startsAt: booking.startsAt, endsAt: booking.endsAt, session: booking.isSession })) });
  const statusOf = (room: Room): DayStatus => outside && room.bookable ? { tone: "closed", text: "Di luar periode" } : dayOf(room).status;
  const anyClosed = placed.some(room => statusOf(room).tone === "closed");

  function show(room: Room) {
    setFocus(room.id);
    const item = document.getElementById(`ruang-${room.id}`);
    if (!item) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    item.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "nearest" });
    item.focus({ preventScroll: true });
  }

  const hint = outside ? "Di luar periode appraisal." : date < today ? "Sudah lewat, hanya untuk dilihat." : canBook ? "Ketuk ruang di denah untuk melihat kartunya di bawah." : open ? "Ketuk ruang di denah untuk melihat kartunya di bawah." : "Book ruang sedang ditutup.";
  return <>
    <div className={css.dayTitle}>
      <h2>Denah kantor · {dayLabel(date)}{date === today ? " · hari ini" : ""}</h2>
      <p>Status sepanjang hari, {clockLabel(appraisalRules.open)}–{clockLabel(appraisalRules.close)}. {hint}</p>
    </div>
    <section className={`${styles.card} ${css.planCard}`} aria-label={`Denah kantor ${dayLabel(date)}`}>
      <FloorPlan rooms={rooms} statusOf={statusOf} label={`Denah kantor, ${dayLabel(date)}, sepanjang hari`}
        onPick={show} pickable={room => room.bookable} highlightId={focus ?? undefined} action="Lihat kartunya"
        otherSpots="plain" showUnplaced={false}
        legend={anyClosed ? ["free", "part", "full", "closed", "off"] : ["free", "part", "full", "off"]}
        legendLabels={{ part: "Terpakai sebagian", full: "Penuh (tak ada 30 mnt kosong)", closed: outside ? "Di luar periode" : "Sudah lewat" }} />
    </section>
    <RoomList always date={date} rooms={bookable} bookings={bookings} now={now} viewerId={viewerId} canBook={canBook} onOpen={onOpen} onBook={onBook} focusId={focus} />
  </>;
}
