"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CalendarPlus, CalendarRange, ChevronRight, Clock, DoorOpen, MapPin, Plus, Text, User, Users, X } from "lucide-react";
import { Notice } from "@/components/ui";
import { appraisalRules, bookingWhere, clockLabel, dayLabel, draftHours, isOutside, loadedWeek, OUTSIDE_ROOM, wibDate, wibTime, type Booking, type Person, type Room } from "@/lib/pra-wam/appraisal";
import { praWamApi, praWamPath } from "@/lib/routes";
import { errorText, praWamRequest } from "./api";
import { daySummaries, type DaySummary } from "@/lib/pra-wam/room-day";
import { bookingKey } from "./BookCalendar";
import { BookingForm, type BookingDraft, type PeopleGroup } from "./BookingForm";
import { useConfirm } from "./ConfirmDialog";
import { hodResponseLabels, hodStatusLabels, type HodBookingInfo, type HodDepartment } from "@/lib/pra-wam/hod";
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
  /** Whether the booking form's Tempat step offers the floor plan (the super admin's setting); default true. */
  floorPlan?: boolean;
  /** Per weekday of the booking window: holds and whether it is full (windowSummary); the loaded week is recounted here. */
  summary?: Record<string, DaySummary>;
  /** A HOD's Meeting HOD (6 Nov 2026): booking "sebagai HOD" in the form, for HODs only. */
  hod?: { departments: HodDepartment[]; ownUnits: string[] } | null;
  /** Per booking made as HOD: its meeting and each HOD's answer, for the detail sheet (Terima and Tolak). */
  hodInfo?: Record<string, HodBookingInfo>;
};

type SheetState =
  | { kind: "detail"; booking: Booking }
  | { kind: "form"; key: number; editId?: string; initial: BookingDraft; dayOf: string; dayBookings: Booking[] };

const span = (booking: Booking) => `${clockLabel(wibTime(booking.startsAt))}–${clockLabel(wibTime(booking.endsAt))}`;
const shortDate = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const inPeriod = (date: string) => date >= appraisalRules.periodStart && date <= appraisalRules.periodEnd;

/**
 * Book (9 Nov 2026): no calendar and no floor plan any more. The day is picked on Timeline's
 * calendar (a tap opens the booking form on that day) or in the form itself, whose Tempat step
 * shows which rooms are free. Here: Book ruang and the person's own bookings ("Booking saya").
 * Everything opens over the page in a sheet from the left (bottom on a phone):
 * a booking's detail with Ubah and Batalkan, and the booking form, new or changing one. The open
 * sheet and the day are mirrored in the address (history.replaceState: no reload, no server round
 * trip), so a reload reopens it; a day in another week (picked on the date strip) is a navigation,
 * since its bookings are loaded on the server.
 */
export function AppraisalBoard({ date, week, dates, now, rooms, bookings, mine, viewerId, canCancelAny, open, form, arrive, banner, floorPlan = true, summary = {}, hod = null, hodInfo = {} }: Props) {
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

  // The loaded week is recounted from its bookings with the moving clock; the rest is the server's (the form's date strip).
  const days = { ...summary, ...daySummaries(week, rooms, bookings.map(booking => ({ roomId: booking.roomId, startsAt: booking.startsAt, endsAt: booking.endsAt, session: booking.isSession })), clockNow) };
  const head = <ScreenHead title="Book ruang" lead={<>Pilih tanggal di <a href={praWamPath.timeline}>kalender Timeline</a> untuk langsung booking pada hari itu, atau ketuk Book ruang.</>}
    actions={canBook && dates.length > 0 ? <button type="button" className="button button--primary" onClick={() => book()} aria-haspopup="dialog"><Plus size={18} aria-hidden /> Book ruang</button> : undefined} />;

  return <>
    {head}
    {banner}
    {confirmDialog}

    <p className={styles.sectionLabel}>Booking saya</p>
    {mine.length === 0 ? <div className={styles.emptyRow}>
      <span className={styles.tile} aria-hidden><CalendarPlus /></span>
      <p>Belum ada booking yang kamu pesan atau ikuti.</p>
      {canBook && dates.length > 0 && <a className="button button--secondary" href={praWamPath.timeline}><CalendarRange size={18} aria-hidden /> Lihat kalender</a>}
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
      busy={busy} onEdit={() => show(editFor(sheet.booking))} onCancel={() => cancel(sheet.booking)}
      hod={hodInfo[sheet.booking.id]} viewerId={viewerId} onAnswered={text => { setNotice({ tone: "success", text }); router.refresh(); }}
      onAnswerError={text => setNotice({ tone: "error", text })} />}

    {sheet?.kind === "form" && form && <BookingForm key={sheet.key} editId={sheet.editId} initial={sheet.initial}
      dates={dates.includes(sheet.initial.date) ? dates : [sheet.initial.date, ...dates]} now={clockNow.toISOString()} rooms={rooms}
      people={form.people} groups={form.groups} viewer={{ id: viewerId }} usedTitles={form.usedTitles}
      dayBookings={sheet.dayBookings} dayOf={sheet.dayOf} onSaved={saved} showPlan={floorPlan} summary={days} hod={hod}
      frame={(body, footer) => <Sheet open={shown} onClose={close} side="left" wide title={sheet.editId ? "Ubah booking" : "Book ruang"}
        subtitle="Yang tersimpan lebih dulu yang mendapat ruang." footer={footer}>{body}</Sheet>} />}

    {notice && <div className={css.toast}>
      <Notice tone={notice.tone}>{notice.text}</Notice>
      <button type="button" className={css.toastClose} onClick={() => setNotice(null)} aria-label="Tutup pesan"><X aria-hidden /></button>
    </div>}
  </>;
}

/** One booking in the sheet: when, where, who, and what can be done with it. */
function BookingSheet({ booking, shown, onClose, rooms, now, mine, canEdit, canCancel, busy, onEdit, onCancel, hod, viewerId, onAnswered, onAnswerError }: {
  booking: Booking; shown: boolean; onClose: () => void; rooms: Room[]; now: Date; mine: boolean; canEdit: boolean; canCancel: boolean;
  busy: string | null; onEdit: () => void; onCancel: () => void;
  /** A booking made as HOD: each HOD's answer, and Terima and Tolak for an invited HOD. */
  hod?: HodBookingInfo; viewerId: string; onAnswered: (text: string) => void; onAnswerError: (text: string) => void;
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
    {hod && <HodAnswers info={hod} viewerId={viewerId} ended={ended} onAnswered={onAnswered} onError={onAnswerError} />}
    {booking.isSession && <p className={css.sheetNote}><MapPin size={14} aria-hidden /> Ruang ini dipegang sesi Pra WAM dan tidak bisa dibooking pada jam itu. Panitia yang mengaturnya.</p>}
    {!booking.isSession && !booking.participants && <p className={css.sheetNote}>Partisipan dan deskripsi hanya terlihat oleh pemesan, partisipan, dan panitia.</p>}
  </Sheet>;
}

/**
 * A booking made as HOD (6 Nov 2026): Meeting HOD's state, each invited HOD with their answer, and
 * for an invited HOD still to answer, Terima and Tolak (as on their notification).
 */
function HodAnswers({ info, viewerId, ended, onAnswered, onError }: { info: HodBookingInfo; viewerId: string; ended: boolean; onAnswered: (text: string) => void; onError: (text: string) => void }) {
  const [busy, setBusy] = useState(false);
  const mine = info.invites.find(invite => invite.id === viewerId);
  const accepted = info.invites.filter(invite => invite.response === "terima").length;
  async function answer(accept: boolean) {
    setBusy(true);
    try { onAnswered((await praWamRequest(praWamApi.hodMeetings(info.meetingId), { method: "POST", json: { accept, note: "" } })).message); }
    catch (problem) { onError(errorText(problem)); }
    finally { setBusy(false); }
  }
  return <section className={css.hodBox} aria-label="Meeting HOD">
    <p className={css.hodHead}><strong>Meeting HOD · {hodStatusLabels[info.status]}</strong><span>{accepted} dari {info.invites.length} menerima</span></p>
    <ul className={css.hodList}>{info.invites.map(invite => <li key={invite.id}>
      <span><strong>{invite.id === viewerId ? "Kamu" : invite.name}</strong>{invite.unit && <small>{invite.unit}</small>}</span>
      <em className={css[`hod_${invite.response}`]}>{hodResponseLabels[invite.response]}</em>
    </li>)}</ul>
    {mine?.response === "menunggu" && info.status === "menunggu" && !ended && <div className={styles.actions}>
      <button type="button" className="button button--secondary" disabled={busy} onClick={() => void answer(false)}>Tolak</button>
      <button type="button" className="button button--primary" disabled={busy} onClick={() => void answer(true)}>{busy ? "Mengirim…" : "Terima"}</button>
    </div>}
  </section>;
}
