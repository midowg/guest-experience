"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { Armchair, Building2, Bus, ClipboardPaste, Leaf, MapPin, Pencil, Plus, Footprints, TrainFront, Trash2, X } from "lucide-react";
import { ConsoleButton, PageHeader, Pill, type Crumb } from "@/components/console";
import { adminRequest } from "@/components/admin/shared/api";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { shortDate, tripDirectionLabels, tripKindLabels } from "@/lib/main-wam/admin/labels";
import type { AdminPerson } from "@/lib/main-wam/admin/people";
import { blankTrip, carbonLine, parseSeatPaste, seatColumnLabels, tripInputSchema, tripToInput, type SeatPaste, type SeatsInput, type TripInput } from "@/lib/main-wam/admin/trips";
import { timeRange, wibDate, wibTime } from "@/lib/main-wam/rundown";
import { TRIP_DIRECTIONS, TRIP_KINDS, type MwSession, type MwTrip, type MwTripSeat, type TripDirection, type TripKind } from "@/lib/main-wam/types";
import { mainWamAdminApi } from "@/lib/routes";
import { Choice, ContentTabs, dayOptionLabel, DaySelect, described, Field, MessageLine, NumberInput, PersonSelect, SwitchRow, useRun, Waiting, type Message, type Problems } from "./fields";
import { PasteSheet } from "./PasteSheet";
import { Sheet, SheetError } from "./Sheet";
import css from "./isi.module.css";

type Board = { trips: MwTrip[]; seats: MwTripSeat[] };
type SheetState = { type: "edit"; trip: MwTrip | null; direction: TripDirection } | { type: "seats"; trip: MwTrip } | { type: "paste"; trip: MwTrip } | null;
const icons: Record<TripKind, typeof Bus> = { kumpul: Footprints, kereta: TrainFront, bus: Bus, tiba: Building2, lain: MapPin };
const dot = (time: string) => time.replace(":", ".");
const tripTime = (trip: MwTrip) => trip.startsAt ? `${shortDate(wibDate(trip.startsAt))} · ${trip.endsAt ? timeRange({ startsAt: trip.startsAt, endsAt: trip.endsAt }) : dot(wibTime(trip.startsAt))}` : "Jam belum diisi";

/**
 * Admin WAM → Main WAM → Perjalanan (agen E): the steps there and back (titik kumpul, kereta,
 * shuttle, tiba) with time, place or route, ticket details, coordinator and rundown session; each
 * person's seat or vehicle (typed or pasted); and the km and buses Jejak karbon is computed from.
 */
export function TripsEditor({ initial, migrated, sessions, people, dates, crumbs, title }: {
  initial: Board; migrated: boolean; sessions: readonly MwSession[]; people: readonly AdminPerson[]; dates: readonly string[]; crumbs: readonly Crumb[]; title: string;
}) {
  const [board, setBoard] = useState(initial);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [message, setMessage] = useState<Message>(null);
  const { busy, run } = useRun(setMessage);
  const [confirm, confirmDialog] = useConfirm();
  const names = useMemo(() => new Map(people.map(person => [person.id, person.fullName])), [people]);
  const seatCount = (tripId: string) => board.seats.filter(seat => seat.tripId === tripId).length;
  const send = async (url: string, method: string, body?: unknown) => adminRequest<Board>(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const apply = (answer: Board) => setBoard({ trips: answer.trips, seats: answer.seats });
  const carbon = board.trips.filter(trip => trip.distanceKm !== null || trip.vehicles);
  const missingKm = board.trips.filter(trip => (trip.kind === "kereta" || trip.kind === "bus") && trip.distanceKm === null);

  async function remove(trip: MwTrip) {
    const seats = seatCount(trip.id);
    if (!(await confirm({ title: `Hapus ${trip.title}?`, body: seats ? `Langkah ini dan kursi ${seats} orang di dalamnya dihapus.` : "Langkah ini dihapus dari Perjalanan peserta.", confirmLabel: "Hapus", danger: true }))) return;
    await run(`hapus-${trip.id}`, async () => { const result = await send(mainWamAdminApi.trip(trip.id), "DELETE"); apply(result.data!); return result.message; });
  }
  const parse = useCallback((text: string) => parseSeatPaste(text, people), [people]);

  return <SheetError.Provider value={message?.tone === "error" ? message.text : null}><div className={css.page}>
    <PageHeader crumbs={crumbs} title={title} subtitle="Langkah berangkat dan pulang, kursi tiap orang, dan data untuk Jejak karbon." />
    <ContentTabs current="perjalanan" />
    {!migrated && <Waiting what="Perjalanan" />}
    <MessageLine message={message} />

    <section className={css.item} aria-labelledby="mw-karbon">
      <div className={css.itemHead}>
        <h2 id="mw-karbon" className={css.itemTitle}><Leaf size={18} aria-hidden /> Data Jejak karbon</h2>
        {missingKm.length ? <Pill tone="warn">{missingKm.length} langkah tanpa km</Pill> : board.trips.length ? <Pill tone="ok">Lengkap</Pill> : null}
      </div>
      <p className={css.small}>Dihitung otomatis dari jarak dan jumlah kendaraan tiap langkah; tidak ada isian emisi.</p>
      {carbon.length ? <p className={css.names}>{carbon.map(trip => `${trip.title} (${tripDirectionLabels[trip.direction].toLowerCase()}): ${carbonLine(trip)}`).join(" · ")}</p> : <p className={css.small}>Belum ada jarak yang diisi.</p>}
    </section>

    {TRIP_DIRECTIONS.map(direction => {
      const steps = board.trips.filter(trip => trip.direction === direction).sort((a, b) => a.sort - b.sort || (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
      return <section key={direction} className={css.section} aria-labelledby={`mw-arah-${direction}`}>
        <div className={css.sectionHead}>
          <h2 id={`mw-arah-${direction}`}>{tripDirectionLabels[direction]}</h2>
          <ConsoleButton icon={<Plus size={18} aria-hidden />} disabled={!migrated} onClick={() => setSheet({ type: "edit", trip: null, direction })}
            aria-label={`Tambah langkah ${tripDirectionLabels[direction].toLowerCase()}`}>Tambah langkah</ConsoleButton>
        </div>
        {steps.length ? <ol className={css.steps}>{steps.map(trip => {
          const Icon = icons[trip.kind];
          const seats = seatCount(trip.id);
          return <li key={trip.id} className={css.step}>
            <span className={css.stepIcon}><Icon size={20} aria-hidden /></span>
            <div className={css.sessionMain}>
              <h3 className={css.itemTitle}>{trip.title}{trip.place ? <span className={css.small}> · {trip.place}</span> : null}</h3>
              <div className={css.meta}>
                <span>{tripTime(trip)}</span>
                {trip.detail && <span>{trip.detail}</span>}
                {trip.coordinatorId && <span>Koordinator {names.get(trip.coordinatorId) ?? "tanpa nama"}</span>}
              </div>
              <div className={css.chips}>
                <Pill tone="neutral">{tripKindLabels[trip.kind]}</Pill>
                {seats > 0 && <Pill tone="blue">{seats} kursi</Pill>}
                {carbonLine(trip) && <Pill>{carbonLine(trip)}</Pill>}
                {trip.sessionId && <Pill tone="purple">Di rundown</Pill>}
              </div>
            </div>
            <div className={css.actions}>
              <button type="button" className={css.iconButton} onClick={() => setSheet({ type: "seats", trip })} disabled={busy !== null} aria-label={`Kursi ${trip.title}`} title="Kursi"><Armchair size={18} aria-hidden /></button>
              <button type="button" className={css.iconButton} onClick={() => setSheet({ type: "edit", trip, direction })} disabled={busy !== null} aria-label={`Ubah ${trip.title}`} title="Ubah"><Pencil size={18} aria-hidden /></button>
              <button type="button" className={`${css.iconButton} ${css.iconDanger}`} onClick={() => void remove(trip)} disabled={busy !== null} aria-label={`Hapus ${trip.title}`} title="Hapus"><Trash2 size={18} aria-hidden /></button>
            </div>
          </li>;
        })}</ol> : <div className={css.empty}><p>Belum ada langkah {direction === "berangkat" ? "berangkat" : "pulang"}. Mulai dari titik kumpul.</p></div>}
      </section>;
    })}

    {sheet?.type === "edit" && <TripSheet trip={sheet.trip} direction={sheet.direction} trips={board.trips} sessions={sessions} people={people} dates={dates} busy={busy === "simpan"}
      onClose={() => setSheet(null)}
      onSave={input => void run("simpan", async () => {
        const result = sheet.trip ? await send(mainWamAdminApi.trip(sheet.trip.id), "PUT", input) : await send(mainWamAdminApi.trips, "POST", input);
        apply(result.data!);
        setSheet(null);
        return result.message;
      })} />}
    {sheet?.type === "seats" && <SeatsSheet trip={sheet.trip} seats={board.seats.filter(seat => seat.tripId === sheet.trip.id)} people={people} busy={busy === "kursi"}
      onClose={() => setSheet(null)} onPaste={() => setSheet({ type: "paste", trip: sheet.trip })}
      onSave={seats => void run("kursi", async () => {
        const result = await send(mainWamAdminApi.tripSeats(sheet.trip.id), "PUT", { seats, replace: true });
        apply(result.data!);
        setSheet(null);
        return result.message;
      })} />}
    {sheet?.type === "paste" && <SeatPasteSheet trip={sheet.trip} parse={parse} names={names} busy={busy === "kursi"} onClose={() => setSheet({ type: "seats", trip: sheet.trip })}
      onSave={(seats, replace) => void run("kursi", async () => {
        const result = await send(mainWamAdminApi.tripSeats(sheet.trip.id), "PUT", { seats, replace });
        apply(result.data!);
        setSheet(null);
        return result.message;
      })} />}
    {confirmDialog}
  </div></SheetError.Provider>;
}

function TripSheet({ trip, direction, trips, sessions, people, dates, busy, onClose, onSave }: {
  trip: MwTrip | null; direction: TripDirection; trips: readonly MwTrip[]; sessions: readonly MwSession[]; people: readonly AdminPerson[]; dates: readonly string[]; busy: boolean;
  onClose: () => void; onSave: (input: TripInput) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<TripInput>(() => trip ? tripToInput(trip) : blankTrip(direction, direction === "berangkat" ? dates[0] ?? null : dates.at(-1) ?? null, trips.filter(item => item.direction === direction).length + 1));
  const [problems, setProblems] = useState<Problems>({});
  const set = (patch: Partial<TripInput>) => { setDraft(current => ({ ...current, ...patch })); setProblems({}); };
  function submit() {
    const checked = tripInputSchema.safeParse(draft);
    if (!checked.success) {
      const found: Problems = {};
      for (const issue of checked.error.issues) found[String(issue.path[0])] ??= issue.message;
      setProblems(found);
      return;
    }
    onSave(checked.data);
  }
  const text = (key: "title" | "place" | "detail" | "note" | "mapUrl", label: string, max: number, extra: { optional?: boolean; hint?: string; placeholder?: string; inputMode?: "url" } = {}) =>
    <Field id={`${id}-${key}`} label={label} optional={extra.optional} hint={extra.hint} error={problems[key]}>
      <input className="input" {...described(`${id}-${key}`, problems[key], !!extra.hint)} value={draft[key]} maxLength={max} placeholder={extra.placeholder} inputMode={extra.inputMode}
        onChange={event => set({ [key]: event.target.value } as Partial<TripInput>)} />
    </Field>;
  const choices = sessions.filter(session => session.status !== "batal");
  return <Sheet title={trip ? "Ubah langkah" : "Tambah langkah"} subtitle={trip ? trip.title : "Satu langkah perjalanan peserta."} busy={busy} onClose={onClose} onSubmit={submit}
    footer={<>
      <ConsoleButton disabled={busy} onClick={onClose}>Batal</ConsoleButton>
      <ConsoleButton type="submit" variant="primary" disabled={busy}>{busy ? "Menyimpan…" : trip ? "Simpan" : "Tambah langkah"}</ConsoleButton>
    </>}>
    <fieldset className={css.group}>
      <legend>Langkah</legend>
      <Choice label="Arah" name={`${id}-direction`} value={draft.direction} onChange={value => set({ direction: value })} options={TRIP_DIRECTIONS.map(value => ({ value, label: tripDirectionLabels[value] }))} />
      <Field id={`${id}-kind`} label="Jenis">
        <select className="select" id={`${id}-kind`} value={draft.kind} onChange={event => set({ kind: event.target.value as TripKind })}>
          {TRIP_KINDS.map(value => <option key={value} value={value}>{tripKindLabels[value]}</option>)}
        </select>
      </Field>
      {text("title", "Judul", 100, { placeholder: "mis. Kereta" })}
      {text("place", "Tempat atau rute", 200, { optional: true, placeholder: "mis. Stasiun Tugu · pintu selatan" })}
      <div className={css.trio}>
        <Field id={`${id}-date`} label="Hari" optional error={problems.date}><DaySelect id={`${id}-date`} dates={dates} value={draft.date} allowNone onChange={date => set({ date })} error={problems.date} /></Field>
        <Field id={`${id}-start`} label="Berangkat" optional error={problems.start}>
          <input className="input" type="time" step={300} {...described(`${id}-start`, problems.start)} value={draft.start ?? ""} onChange={event => set({ start: event.target.value || null })} />
        </Field>
        <Field id={`${id}-end`} label="Tiba" optional error={problems.end}>
          <input className="input" type="time" step={300} {...described(`${id}-end`, problems.end)} value={draft.end ?? ""} onChange={event => set({ end: event.target.value || null })} />
        </Field>
      </div>
    </fieldset>
    <fieldset className={css.group}>
      <legend>Untuk peserta</legend>
      {text("detail", "Rincian tiket", 300, { optional: true, placeholder: "mis. KA (contoh) · Ekonomi" })}
      {text("note", "Catatan", 300, { optional: true, placeholder: "mis. Tunjukkan KTP saat naik kereta." })}
      {text("mapUrl", "Tautan peta", 500, { optional: true, placeholder: "https://maps.google.com/…", inputMode: "url" })}
      <Field id={`${id}-coordinator`} label="Koordinator" optional hint="Tombol Hubungi di Perjalanan peserta." error={problems.coordinatorId}>
        <PersonSelect id={`${id}-coordinator`} people={people} value={draft.coordinatorId} onChange={coordinatorId => set({ coordinatorId })} error={problems.coordinatorId} />
      </Field>
      <Field id={`${id}-session`} label="Sesi rundown" optional hint="Misalnya Kumpul di stasiun yang pakai absen." error={problems.sessionId}>
        <select className="select" {...described(`${id}-session`, problems.sessionId, true)} value={draft.sessionId ?? ""} onChange={event => set({ sessionId: event.target.value || null })}>
          <option value="">Tanpa sesi</option>
          {choices.map(session => <option key={session.id} value={session.id}>{`${dayOptionLabel(dates, wibDate(session.startsAt))} · ${timeRange(session)} ${session.title}`}</option>)}
        </select>
      </Field>
    </fieldset>
    <fieldset className={css.group}>
      <legend>Jejak karbon</legend>
      <div className={css.pair}>
        <Field id={`${id}-km`} label="Jarak" optional hint="Sekali jalan, km." error={problems.distanceKm}>
          <NumberInput id={`${id}-km`} value={draft.distanceKm} onChange={distanceKm => set({ distanceKm })} suffix="km" error={problems.distanceKm} />
        </Field>
        <Field id={`${id}-vehicles`} label="Jumlah kendaraan" optional hint="Bus atau shuttle; kereta kosongkan." error={problems.vehicles}>
          <NumberInput id={`${id}-vehicles`} integer value={draft.vehicles} onChange={vehicles => set({ vehicles })} suffix="unit" error={problems.vehicles} />
        </Field>
      </div>
      <Field id={`${id}-sort`} label="Urutan" hint="Langkah ke berapa.">
        <NumberInput id={`${id}-sort`} integer value={draft.sort} onChange={sort => set({ sort: sort ?? 0 })} />
      </Field>
    </fieldset>
  </Sheet>;
}

type SeatRow = SeatsInput["seats"][number];

function SeatsSheet({ trip, seats, people, busy, onClose, onPaste, onSave }: {
  trip: MwTrip; seats: readonly MwTripSeat[]; people: readonly AdminPerson[]; busy: boolean; onClose: () => void; onPaste: () => void; onSave: (seats: SeatRow[]) => void;
}) {
  const id = useId();
  const [rows, setRows] = useState<SeatRow[]>(() => seats.map(seat => ({ employeeId: seat.employeeId, seat: seat.seat, vehicle: seat.vehicle })));
  const [adding, setAdding] = useState<string | null>(null);
  const names = useMemo(() => new Map(people.map(person => [person.id, person.fullName])), [people]);
  const taken = new Set(rows.map(row => row.employeeId));
  const left = people.filter(person => !taken.has(person.id));
  const sorted = [...rows].sort((a, b) => (names.get(a.employeeId) ?? "").localeCompare(names.get(b.employeeId) ?? "", "id"));
  const update = (employeeId: string, patch: Partial<SeatRow>) => setRows(current => current.map(row => (row.employeeId === employeeId ? { ...row, ...patch } : row)));
  return <Sheet title={`Kursi · ${trip.title}`} subtitle={`${tripTime(trip)} · ${rows.length} orang`} wide busy={busy} onClose={onClose}
    onSubmit={() => onSave(rows.filter(row => row.seat.trim() || row.vehicle.trim()).map(row => ({ ...row, seat: row.seat.trim(), vehicle: row.vehicle.trim() })))}
    footer={<>
      <ConsoleButton className={css.push} icon={<ClipboardPaste size={18} aria-hidden />} disabled={busy} onClick={onPaste}>Tempel dari Excel</ConsoleButton>
      <ConsoleButton disabled={busy} onClick={onClose}>Batal</ConsoleButton>
      <ConsoleButton type="submit" variant="primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan kursi"}</ConsoleButton>
    </>}>
    <div className={css.pickerTools}>
      <div className={`${css.field} ${css.grow}`}>
        <label htmlFor={`${id}-add`}>Tambah orang</label>
        <PersonSelect id={`${id}-add`} people={left} value={adding} onChange={setAdding} />
      </div>
      <ConsoleButton icon={<Plus size={18} aria-hidden />} disabled={!adding} onClick={() => { if (adding) { setRows(current => [...current, { employeeId: adding, seat: "", vehicle: "" }]); setAdding(null); } }}>Tambah</ConsoleButton>
    </div>
    {sorted.length ? <div className={css.previewWrap}>
      <table className={css.preview}>
        <thead><tr><th scope="col">Nama</th><th scope="col">Kursi</th><th scope="col">Kendaraan</th><th scope="col"><span className="sr-only">Hapus</span></th></tr></thead>
        <tbody>{sorted.map(row => {
          const name = names.get(row.employeeId) ?? "Tanpa nama";
          return <tr key={row.employeeId}>
            <td>{name}</td>
            <td><input className="input" value={row.seat} maxLength={60} placeholder="mis. Gerbong 3 · 12A" aria-label={`Kursi ${name}`} onChange={event => update(row.employeeId, { seat: event.target.value })} /></td>
            <td><input className="input" value={row.vehicle} maxLength={60} placeholder="mis. Bus 2" aria-label={`Kendaraan ${name}`} onChange={event => update(row.employeeId, { vehicle: event.target.value })} /></td>
            <td><button type="button" className={`${css.iconButton} ${css.iconDanger}`} aria-label={`Hapus kursi ${name}`} onClick={() => setRows(current => current.filter(item => item.employeeId !== row.employeeId))}><X size={18} aria-hidden /></button></td>
          </tr>;
        })}</tbody>
      </table>
    </div> : <div className={css.empty}><p>Belum ada kursi. Tambah orang satu per satu atau tempel dari Excel.</p></div>}
    <p className={css.hint}>Baris tanpa kursi dan kendaraan tidak disimpan.</p>
  </Sheet>;
}

function SeatPasteSheet({ trip, parse, names, busy, onClose, onSave }: {
  trip: MwTrip; parse: (text: string) => SeatPaste; names: Map<string, string>; busy: boolean; onClose: () => void; onSave: (seats: SeatRow[], replace: boolean) => void;
}) {
  const [replace, setReplace] = useState(false);
  return <PasteSheet<SeatRow, SeatPaste> title={`Tempel kursi · ${trip.title}`} subtitle="Satu orang per baris: nama, kursi, kendaraan."
    columns={seatColumnLabels} parse={parse} busy={busy}
    example={"Nama karyawan\tKursi\tKendaraan\nRani Contoh\tGerbong 3 · 12A\t\nSari Contoh\t\tBus 2"}
    heads={["Nama", "Kursi", "Kendaraan"]}
    cells={input => [names.get(input.employeeId) ?? "", input.seat || "—", input.vehicle || "—"]}
    extra={<SwitchRow title="Ganti semua kursi langkah ini" sub="Mati: yang ditempel ditambahkan atau diperbarui, yang lain tetap." checked={replace} onChange={setReplace} />}
    saveLabel={count => `Simpan ${count} kursi`}
    onClose={onClose}
    onSave={result => onSave(result.rows.map(row => row.input!), replace)} />;
}
