"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, BedDouble, Check, Home, Info, Laptop, Leaf, LogOut, RotateCcw, Settings2, TrainFront, UserRound, Utensils, Workflow } from "lucide-react";
import {
  CARBON_REFERENCES, GROUP_MODES, carbonFactorRows, carbonFigure, carbonParts, carbonView, ownModeLabel, personCarbonInput, splitPercent, tripLabel, tripValid,
  type CarbonEventSettings, type CarbonPerson, type CarbonSetup, type GroupTrip,
} from "@/lib/pra-wam/carbon";
import { CarbonCard } from "@/components/pra-wam/carbon/CarbonCard";
import css from "./carbon-admin.module.css";

type Tab = "ringkasan" | "sendiri" | "pengaturan";

const clock = (date: Date) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(date);
const kg = (value: number) => { const figure = carbonFigure(value); return `${figure.value} ${figure.unit.replace(" CO₂e", "")}`; };
const num = (value: number) => new Intl.NumberFormat("id-ID").format(value);

/**
 * Admin Pra WAM → Jejak karbon (prototype, 23 Nov 2026, revised; docs/standar-admin.md). The trip is
 * the same for nearly everyone, so the panitia type it once in plain fields (Pengaturan acara: dari,
 * ke, kendaraan, km, orang per kendaraan, pulang-pergi), with nights and meals; everyone counts with it
 * at once. A participant who travels on their own says so from their card; "Berangkat sendiri" lists
 * them, read-only, and can send one back to the group (after a confirmation). Rooms come from Misi
 * Perjalanan. Controlled: the page holding the data passes it in.
 */
export function CarbonAdmin({ setup, people, onSetup, onPeople }: {
  setup: CarbonSetup; people: CarbonPerson[];
  onSetup: (setup: CarbonSetup) => void; onPeople: (people: CarbonPerson[]) => void;
}) {
  const [toast, setToast] = useState("");
  const [save, setSave] = useState<{ state: "saved" | "saving"; at: Date }>({ state: "saved", at: new Date() });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const touched = () => {
    setSave(current => ({ ...current, state: "saving" }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSave({ state: "saved", at: new Date() }), 700);
  };
  const say = (text: string) => { setToast(text); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 2600); };

  const ready = tripValid(setup.trip);
  const own = people.filter(person => person.travel?.own);
  const status = save.state === "saving" ? "Menyimpan…" : `Tersimpan ${clock(save.at)}`;

  return <div className={css.page}>
    <header className={css.topbar}>
      <span className={css.brand}><b>Journey</b><span>Admin Pra WAM</span></span>
      <span className={css.topActions}>
        <a href="#" className={css.topLink}><Home aria-hidden /><span>Beranda</span></a>
        <span className={css.who}>Panitia Contoh</span>
        <a href="#" className={css.topLink}><LogOut aria-hidden /><span>Keluar</span></a>
      </span>
    </header>

    <div className={css.wrap}>
      <div className={css.head}>
        <a href="#" className={css.back} aria-label="Kembali ke Admin Pra WAM"><ArrowLeft aria-hidden /></a>
        <span className={css.headIcon}><Leaf aria-hidden /></span>
        <span className={css.headText}>
          <h1>Jejak karbon</h1>
          <span className={css.headLine}>
            {ready ? tripLabel(setup.trip) : "Perjalanan belum diisi"} · {own.length} berangkat sendiri ·{" "}
            <span aria-live="polite" className={save.state === "saving" ? css.saving : css.saved}>{save.state === "saved" && <Check aria-hidden />}{status}</span>
          </span>
        </span>
        <button type="button" className={css.primary} onClick={() => setSave({ state: "saved", at: new Date() })}>Simpan</button>
      </div>

      <CarbonAdminBody setup={setup} people={people} say={say}
        onSetup={next => { onSetup(next); touched(); }}
        onToGroup={person => { onPeople(people.map(item => item.id === person.id && item.travel ? { ...item, travel: { ...item.travel, own: null } } : item)); touched(); say(`${person.name} kembali ikut rombongan.`); }} />
    </div>
    <div className={css.toast} role="status" aria-live="polite">{toast && <span><Check aria-hidden />{toast}</span>}</div>
  </div>;
}

/**
 * The page's content under its head (shared by Admin Pra WAM and the prototype): Ringkasan, Berangkat
 * sendiri, Pengaturan acara. Every change goes through onSetup; the holder saves it.
 */
export function CarbonAdminBody({ setup, people, onSetup, onToGroup, say }: {
  setup: CarbonSetup; people: CarbonPerson[];
  onSetup: (setup: CarbonSetup) => void;
  /** Send someone back to the group trip (their own trip dropped), after the confirmation here. */
  onToGroup: (person: CarbonPerson) => void;
  say: (text: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("ringkasan");
  const [asking, setAsking] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState(people[0]?.id ?? "");
  const setSetting = (key: keyof CarbonEventSettings, value: number) => onSetup({ ...setup, settings: { ...setup.settings, [key]: value } });
  const setTrip = (change: Partial<GroupTrip>) => onSetup({ ...setup, trip: { ...setup.trip, ...change } });

  const ready = tripValid(setup.trip);
  const rows = people.map(person => {
    const input = personCarbonInput(setup, person.travel, person.occupants);
    const parts = input ? carbonParts(input) : null;
    return { person, total: parts ? parts.perjalanan + parts.kamar + parts.makan + parts.perangkat : 0, parts };
  });
  const counted = rows.filter(row => row.parts);
  const own = rows.filter(row => row.person.travel?.own);
  const answered = rows.filter(row => row.person.travel).length;
  const sum = counted.reduce((acc, row) => ({ perjalanan: acc.perjalanan + row.parts!.perjalanan, kamar: acc.kamar + row.parts!.kamar, makan: acc.makan + row.parts!.makan, perangkat: acc.perangkat + row.parts!.perangkat }), { perjalanan: 0, kamar: 0, makan: 0, perangkat: 0 });
  const total = sum.perjalanan + sum.kamar + sum.makan + sum.perangkat;
  const shares = splitPercent([sum.kamar, sum.perjalanan, sum.makan, sum.perangkat]);
  const rooms = new Set(people.map(person => person.room)).size;
  const preview = people.find(person => person.id === previewId) ?? people[0];

  return <>
  <div className={css.tabs} role="tablist" aria-label="Bagian">
    {([["ringkasan", "Ringkasan"], ["sendiri", "Berangkat sendiri"], ["pengaturan", "Pengaturan acara"]] as [Tab, string][]).map(([key, label]) =>
      <button key={key} type="button" role="tab" aria-selected={tab === key} className={css.tab} onClick={() => setTab(key)}>
        {label}{key === "sendiri" && own.length > 0 && <span className={css.count}>{own.length}</span>}
        {key === "pengaturan" && !ready && <span className={css.badge}>Perlu diisi</span>}
      </button>)}
  </div>

  {tab === "ringkasan" && <div className={css.summary}>
    <ul className={css.owners} aria-label="Siapa mengisi apa">
      <li><Settings2 aria-hidden /><strong>Panitia</strong><span>Perjalanan, malam, makan</span></li>
      <li><UserRound aria-hidden /><strong>Peserta</strong><span>Botol, laptop, HP, berangkat sendiri</span></li>
      <li><Workflow aria-hidden /><strong>Otomatis</strong><span>Kamar</span></li>
    </ul>

    {!ready && <p className={css.warnBox}><AlertCircle aria-hidden /><span>Isi perjalanan rombongan dulu, lalu angka semua peserta langsung muncul.</span>
      <button type="button" className={css.small} onClick={() => setTab("pengaturan")}>Isi sekarang</button></p>}

    <div className={css.stats}>
      <section className={css.stat}>
        <span className={css.statLabel}>Total perkiraan</span>
        <span className={css.statValue}>{carbonFigure(total).value}<small>{carbonFigure(total).unit}</small></span>
      </section>
      <section className={css.stat}>
        <span className={css.statLabel}>Rata-rata per orang</span>
        <span className={css.statValue}>{counted.length ? carbonFigure(total / counted.length).value : "–"}<small>kg CO₂e</small></span>
      </section>
      <section className={css.stat}>
        <span className={css.statLabel}>Berangkat sendiri</span>
        <span className={css.statValue}>{own.length}<small>dari {people.length}</small></span>
        {own.length > 0 && <button type="button" className={css.textLink} onClick={() => setTab("sendiri")}>Lihat daftarnya</button>}
      </section>
    </div>

    <div className={css.twoCol}>
      <section className={css.card}>
        <h2 className={css.h2}>Asalnya</h2>
        <ul className={css.sources}>
          {([["kamar", "Kamar", BedDouble, sum.kamar, shares[0], `${setup.settings.nights} malam · ${rooms} kamar`],
            ["perjalanan", "Perjalanan", TrainFront, sum.perjalanan, shares[1], ready ? tripLabel(setup.trip) : "Belum diisi"],
            ["makan", "Makan & minum", Utensils, sum.makan, shares[2], `${setup.settings.mealsPerPerson} porsi per orang, dan botol plastik`],
            ["perangkat", "Perangkat", Laptop, sum.perangkat, shares[3], `Laptop dan HP · ${answered} peserta sudah mengisi`]] as const).map(([key, title, Icon, value, share, note]) =>
            <li key={key}>
              <span className={css.srcIcon}><Icon aria-hidden /></span>
              <span className={css.srcText}>
                <span className={css.srcTop}><strong>{title}</strong><span>{kg(value)} · {share}%</span></span>
                <span className={css.srcBar} aria-hidden><i data-key={key} style={{ width: `${Math.max(share, 2)}%` }} /></span>
                <span className={css.srcNote}>{note}</span>
              </span>
            </li>)}
        </ul>
      </section>

      <section className={css.card}>
        <div className={css.previewHead}>
          <h2 className={css.h2}>Kartu peserta</h2>
          <label className={css.field}>
            <span className={css.label}>Lihat sebagai</span>
            <select className={css.input} value={preview?.id} onChange={event => setPreviewId(event.target.value)}>
              {people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </label>
        </div>
        <div className={css.phone}>
          {preview && <CarbonCard key={preview.id} view={carbonView(personCarbonInput(setup, preview.travel, preview.occupants))}
            form={{ trip: setup.trip, nights: setup.settings.nights, occupants: preview.occupants, meals: setup.settings.mealsPerPerson, travel: preview.travel, open: setup.formOpen,
              inputFor: travel => personCarbonInput(setup, travel, preview.occupants), onSave: () => say("Hanya pratinjau: diisi peserta sendiri.") }} />}
        </div>
      </section>
    </div>
  </div>}

  {tab === "sendiri" && <section className={css.card}>
    <p className={css.lead}><Info aria-hidden /><span>Peserta lain dihitung ikut rombongan{ready ? ` (${tripLabel(setup.trip)})` : ""}.</span></p>
    {own.length === 0
      ? <p className={css.empty}>Semua peserta ikut rombongan.</p>
      : <table className={css.table}>
        <thead><tr><th>Peserta</th><th>Kamar</th><th>Perjalanan</th><th className={css.num}>Perkiraan</th><th><span className={css.srOnly}>Aksi</span></th></tr></thead>
        <tbody>
          {own.map(({ person, total: personTotal }) => {
            const trip = person.travel!.own!;
            return <tr key={person.id}>
              <td data-label="Peserta"><span className={css.person}><strong>{person.name}</strong><span>{person.dept}</span></span></td>
              <td data-label="Kamar"><span className={css.cellMuted}>{person.room} · {person.occupants > 1 ? `${person.occupants} orang` : "sendiri"}</span></td>
              <td data-label="Perjalanan"><span className={css.answer}><strong>Dari {trip.from}</strong><span>{[ownModeLabel(trip.mode), trip.mode === "lainnya" ? "belum dihitung" : `${num(trip.km)} km`, trip.roundTrip ? "pulang-pergi" : "pergi saja"].join(" · ")}</span></span></td>
              <td data-label="Perkiraan" className={css.num}><span className={css.done}>{kg(personTotal)}</span></td>
              <td className={css.actions}>
                {asking === person.id
                  ? <span className={css.confirm}>
                    <span>Kembalikan ke rombongan?</span>
                    <button type="button" className={css.small} onClick={() => setAsking(null)}>Batal</button>
                    <button type="button" className={`${css.small} ${css.danger}`} onClick={() => { onToGroup(person); setAsking(null); }}>Ya</button>
                  </span>
                  : <button type="button" className={css.small} onClick={() => setAsking(person.id)}><RotateCcw aria-hidden />Ke rombongan</button>}
              </td>
            </tr>;
          })}
        </tbody>
      </table>}
  </section>}

  {tab === "pengaturan" && <div className={css.settings}>
    <section className={css.card}>
      <h2 className={css.h2}>Perjalanan rombongan</h2>
      <div className={css.pairFields}>
        <TextField label="Dari" value={setup.trip.from} placeholder="Contoh: Kantor Yogyakarta" error={!setup.trip.from.trim() ? "Isi tempat berangkat." : ""} onChange={value => setTrip({ from: value })} />
        <TextField label="Ke" value={setup.trip.to} placeholder="Contoh: Kaliurang" error={!setup.trip.to.trim() ? "Isi tujuan." : ""} onChange={value => setTrip({ to: value })} />
      </div>
      <div className={css.field}>
        <span className={css.label} id="kendaraan">Kendaraan</span>
        <span className={css.modes} role="radiogroup" aria-labelledby="kendaraan">
          {GROUP_MODES.map(mode => <button key={mode.key} type="button" role="radio" aria-checked={setup.trip.mode === mode.key} className={css.mode} onClick={() => setTrip({ mode: mode.key })}>{mode.label}</button>)}
        </span>
      </div>
      <div className={css.pairFields}>
        <NumberField label="Jarak sekali jalan" value={setup.trip.km} unit="km" error={!(setup.trip.km > 0) ? "Isi jarak." : ""} onChange={value => setTrip({ km: value })} />
        {setup.trip.mode !== "kereta" && <NumberField label="Orang per kendaraan" value={setup.trip.perVehicle} unit="orang" error={!(setup.trip.perVehicle > 0) ? "Isi jumlah orang." : ""} onChange={value => setTrip({ perVehicle: value })} />}
      </div>
      <label className={css.check}><input type="checkbox" checked={setup.trip.roundTrip} onChange={event => setTrip({ roundTrip: event.target.checked })} />Pulang-pergi</label>
    </section>

    <section className={css.card}>
      <h2 className={css.h2}>Menginap dan makan</h2>
      <NumberField label="Jumlah malam" value={setup.settings.nights} unit="malam" onChange={value => setSetting("nights", value)} />
      <NumberField label="Porsi makan per orang" value={setup.settings.mealsPerPerson} unit="porsi" onChange={value => setSetting("mealsPerPerson", value)} />
      <p className={css.auto}><BedDouble aria-hidden /><span>{rooms} kamar otomatis dari Misi Perjalanan</span></p>
    </section>

    <section className={css.card}>
      <h2 className={css.h2}>Berangkat sendiri</h2>
      <div className={css.segmented} role="radiogroup" aria-label="Peserta boleh mengisi berangkat sendiri">
        <button type="button" role="radio" aria-checked={setup.formOpen} onClick={() => onSetup({ ...setup, formOpen: true })}>Dibuka</button>
        <button type="button" role="radio" aria-checked={!setup.formOpen} onClick={() => onSetup({ ...setup, formOpen: false })}>Ditutup</button>
      </div>
      <p className={css.fieldHint}>Peserta {setup.formOpen ? "bisa" : "tidak bisa lagi"} mengubah perjalanannya.</p>
    </section>

    <section className={css.card}>
      <h2 className={css.h2}>Faktor emisi</h2>
      <ul className={css.factors}>
        {carbonFactorRows().map(row => <li key={row.key}><span><strong>{row.name}</strong><small>{row.unit}</small></span><b>{row.value}</b></li>)}
      </ul>
      <p className={css.refs}>Sumber: {CARBON_REFERENCES.map((ref, index) => <span key={ref.url}><a href={ref.url} target="_blank" rel="noopener noreferrer" title={ref.title}>{ref.short}</a>{index < CARBON_REFERENCES.length - 1 ? ", " : ""}</span>)}</p>
    </section>
  </div>}
  </>;
}

function TextField({ label, value, placeholder, error, onChange }: { label: string; value: string; placeholder: string; error?: string; onChange: (value: string) => void }) {
  return <label className={css.field}>
    <span className={css.label}>{label}</span>
    <input className={css.input} value={value} placeholder={placeholder} aria-invalid={!!error || undefined} onChange={event => onChange(event.target.value)} />
    {error && <span className={css.fieldError}>{error}</span>}
  </label>;
}

function NumberField({ label, value, unit, error, onChange }: { label: string; value: number; unit: string; error?: string; onChange: (value: number) => void }) {
  return <label className={css.field}>
    <span className={css.label}>{label}</span>
    <span className={css.unitInput}><input className={css.input} type="number" inputMode="numeric" min={0} value={value || ""} placeholder="0" aria-invalid={!!error || undefined} onChange={event => onChange(Math.max(0, Number(event.target.value) || 0))} /><span>{unit}</span></span>
    {error && <span className={css.fieldError}>{error}</span>}
  </label>;
}
