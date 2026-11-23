"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, BedDouble, Check, ClipboardPaste, Home, Info, Leaf, LogOut, Search, TrainFront, Utensils } from "lucide-react";
import {
  CARBON_REFERENCES, TRAVEL_MODES, carbonFactorRows, carbonFigure, carbonParts, carbonView, parsePastedTravel, personCarbonInput, splitPercent, travelComplete,
  type CarbonEventSettings, type CarbonPerson, type CarbonTravel, type TravelMode,
} from "@/lib/pra-wam/carbon";
import { CarbonCard } from "@/components/pra-wam/carbon/CarbonCard";
import { Sheet } from "@/components/pra-wam/Sheet";
import css from "./carbon-admin.module.css";

export type { CarbonPerson };

type Tab = "ringkasan" | "perjalanan" | "pengaturan";
type Filter = "semua" | "belum" | "lengkap";

const EMPTY_TRAVEL: CarbonTravel = { from: "", mode: null, km: 0, roundTrip: true, shuttle: true };
const clock = (date: Date) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(date);
const kg = (value: number) => { const figure = carbonFigure(value); return `${figure.value} ${figure.unit.replace(" CO₂e", "")}`; };

/**
 * Admin Pra WAM → Jejak karbon (prototype, 23 Nov 2026; docs/standar-admin.md): the page head with
 * one action, three tabs. Ringkasan: the event's total, the average, how many rows are complete, where
 * it comes from, and the participant's real card for anyone picked. Perjalanan peserta: one row per
 * person (kota asal, moda as chips, km one way, pulang-pergi, shuttle), filter chips with counts,
 * search, and "Tempel dari Excel". Pengaturan acara: nights, meals, the shuttle, the factors and their
 * sources. Rooms come from Misi Perjalanan's list, never typed here. Saves on its own with the
 * status always in view (here only in the page's memory: nothing is sent).
 */
export function CarbonAdmin({ people: initialPeople, settings: initialSettings }: { people: CarbonPerson[]; settings: CarbonEventSettings }) {
  const [people, setPeople] = useState(initialPeople);
  const [settings, setSettings] = useState(initialSettings);
  const [tab, setTab] = useState<Tab>("ringkasan");
  const [filter, setFilter] = useState<Filter>("semua");
  const [query, setQuery] = useState("");
  const [paste, setPaste] = useState(false);
  const [previewId, setPreviewId] = useState(initialPeople[0]?.id ?? "");
  const [save, setSave] = useState<{ state: "saved" | "saving"; at: Date }>({ state: "saved", at: new Date() });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const touched = () => {
    setSave(current => ({ ...current, state: "saving" }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSave({ state: "saved", at: new Date() }), 700);
  };
  const setTravel = (id: string, change: Partial<CarbonTravel>) => {
    setPeople(list => list.map(person => person.id === id ? { ...person, travel: { ...(person.travel ?? EMPTY_TRAVEL), ...change } } : person));
    touched();
  };
  const setSetting = (key: keyof CarbonEventSettings, value: number) => { setSettings(current => ({ ...current, [key]: value })); touched(); };

  const rows = useMemo(() => people.map(person => {
    const input = personCarbonInput(settings, person.travel, person.occupants);
    const parts = input ? carbonParts(input) : null;
    return { person, input, total: parts ? parts.perjalanan + parts.kamar + parts.makan : 0, parts, complete: travelComplete(person.travel) };
  }), [people, settings]);
  const complete = rows.filter(row => row.complete);
  const missing = rows.length - complete.length;
  const sum = complete.reduce((acc, row) => ({ perjalanan: acc.perjalanan + row.parts!.perjalanan, kamar: acc.kamar + row.parts!.kamar, makan: acc.makan + row.parts!.makan }), { perjalanan: 0, kamar: 0, makan: 0 });
  const total = sum.perjalanan + sum.kamar + sum.makan;
  const shares = splitPercent([sum.kamar, sum.perjalanan, sum.makan]);
  const rooms = new Set(people.map(person => person.room)).size;

  const shown = rows.filter(row => (filter === "semua" || (filter === "lengkap") === row.complete)
    && (!query.trim() || `${row.person.name} ${row.person.dept} ${row.person.travel?.from ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())));
  const preview = people.find(person => person.id === previewId) ?? people[0];
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
          <span className={css.headLine}>Pra WAM · {complete.length} dari {people.length} peserta lengkap · <span aria-live="polite" className={save.state === "saving" ? css.saving : css.saved}>{save.state === "saved" && <Check aria-hidden />}{status}</span></span>
        </span>
        <button type="button" className={css.primary} onClick={() => setSave({ state: "saved", at: new Date() })}>Simpan</button>
      </div>

      <div className={css.tabs} role="tablist" aria-label="Bagian">
        {([["ringkasan", "Ringkasan"], ["perjalanan", "Perjalanan peserta"], ["pengaturan", "Pengaturan acara"]] as [Tab, string][]).map(([key, label]) =>
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={css.tab} onClick={() => setTab(key)}>
            {label}{key === "perjalanan" && missing > 0 && <span className={css.badge}>{missing} belum</span>}
          </button>)}
      </div>

      {tab === "ringkasan" && <div className={css.summary}>
        <div className={css.stats}>
          <section className={css.stat}>
            <span className={css.statLabel}>Total perkiraan</span>
            <span className={css.statValue}>{carbonFigure(total).value}<small>{carbonFigure(total).unit}</small></span>
            <span className={css.statNote}>Dari {complete.length} peserta yang datanya lengkap</span>
          </section>
          <section className={css.stat}>
            <span className={css.statLabel}>Rata-rata per peserta</span>
            <span className={css.statValue}>{complete.length ? carbonFigure(total / complete.length).value : "–"}<small>kg CO₂e</small></span>
            <span className={css.statNote}>Tiap peserta melihat angkanya sendiri</span>
          </section>
          <section className={css.stat}>
            <span className={css.statLabel}>Data perjalanan</span>
            <span className={css.statValue}>{complete.length}<small>dari {people.length}</small></span>
            <span className={css.progress} aria-hidden><i style={{ width: `${people.length ? (complete.length / people.length) * 100 : 0}%` }} /></span>
            {missing > 0
              ? <button type="button" className={css.textLink} onClick={() => { setTab("perjalanan"); setFilter("belum"); }}>Lengkapi {missing} peserta</button>
              : <span className={css.statNote}>Semua sudah lengkap</span>}
          </section>
        </div>

        <div className={css.twoCol}>
          <section className={css.card}>
            <h2 className={css.h2}>Dari mana asalnya</h2>
            <ul className={css.sources}>
              {([["kamar", "Kamar", BedDouble, sum.kamar, shares[0], `${settings.nights} malam · ${rooms} kamar dari Misi Perjalanan`],
                ["perjalanan", "Perjalanan", TrainFront, sum.perjalanan, shares[1], "Kota asal ke venue, dan shuttle"],
                ["makan", "Makan", Utensils, sum.makan, shares[2], `${settings.mealsPerPerson} porsi per peserta`]] as const).map(([key, title, Icon, value, share, note]) =>
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
              <h2 className={css.h2}>Kartu yang dilihat peserta</h2>
              <label className={css.field}>
                <span className={css.label}>Lihat sebagai</span>
                <select className={css.input} value={preview?.id} onChange={event => setPreviewId(event.target.value)}>
                  {people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
              </label>
            </div>
            <div className={css.phone}>
              {preview && <CarbonCard view={carbonView(personCarbonInput(settings, preview.travel, preview.occupants))} />}
            </div>
          </section>
        </div>
      </div>}

      {tab === "perjalanan" && <section className={css.card}>
        <div className={css.toolbar}>
          <div className={css.chips} role="radiogroup" aria-label="Saring peserta">
            {([["semua", "Semua", people.length], ["belum", "Belum lengkap", missing], ["lengkap", "Lengkap", complete.length]] as [Filter, string, number][]).map(([key, label, count]) =>
              <button key={key} type="button" role="radio" aria-checked={filter === key} className={css.chip} onClick={() => setFilter(key)}>{label} <span>{count}</span></button>)}
          </div>
          <label className={css.search}>
            <Search aria-hidden />
            <input type="search" placeholder="Cari nama, departemen, atau kota" aria-label="Cari peserta" value={query} onChange={event => setQuery(event.target.value)} />
          </label>
          <button type="button" className={css.secondary} onClick={() => setPaste(true)}><ClipboardPaste aria-hidden />Tempel dari Excel</button>
        </div>
        <p className={css.hint}><Info aria-hidden />Isi cara tiap peserta berangkat ke venue. Kamar dan teman sekamar terisi otomatis dari daftar kamar Misi Perjalanan.</p>

        {shown.length === 0
          ? <p className={css.empty}>{filter === "belum" ? "Semua peserta sudah lengkap." : "Tidak ada peserta yang cocok."}</p>
          : <table className={css.table}>
            <thead><tr><th>Peserta</th><th>Kota asal</th><th>Moda</th><th>Jarak sekali jalan</th><th>Pilihan</th><th className={css.num}>Perkiraan</th></tr></thead>
            <tbody>
              {shown.map(({ person, total: personTotal, complete: done }) => {
                const travel = person.travel ?? EMPTY_TRAVEL;
                return <tr key={person.id}>
                  <td data-label="Peserta">
                    <span className={css.person}><strong>{person.name}</strong><span>{person.dept} · Kamar {person.room}{person.occupants > 1 ? `, ${person.occupants} orang` : ", sendiri"}</span></span>
                  </td>
                  <td data-label="Kota asal"><input className={css.input} aria-label={`Kota asal ${person.name}`} placeholder="Contoh: Jakarta" value={travel.from} onChange={event => setTravel(person.id, { from: event.target.value })} /></td>
                  <td data-label="Moda">
                    <span className={css.modes} role="radiogroup" aria-label={`Moda ${person.name}`}>
                      {TRAVEL_MODES.map(mode => <button key={mode.key} type="button" role="radio" aria-checked={travel.mode === mode.key} className={css.mode} onClick={() => setTravel(person.id, { mode: mode.key as TravelMode })}>{mode.label}</button>)}
                    </span>
                  </td>
                  <td data-label="Jarak sekali jalan">
                    <span className={css.unitInput}>
                      <input className={css.input} type="number" inputMode="numeric" min={0} aria-label={`Jarak sekali jalan ${person.name}, km`} placeholder="0" disabled={travel.mode === "lainnya"}
                        value={travel.km || ""} onChange={event => setTravel(person.id, { km: Number(event.target.value) || 0 })} />
                      <span>km</span>
                    </span>
                  </td>
                  <td data-label="Pilihan">
                    <span className={css.checks}>
                      <label><input type="checkbox" checked={travel.roundTrip} onChange={event => setTravel(person.id, { roundTrip: event.target.checked })} />Pulang-pergi</label>
                      <label><input type="checkbox" checked={travel.shuttle} onChange={event => setTravel(person.id, { shuttle: event.target.checked })} />Ikut shuttle</label>
                    </span>
                  </td>
                  <td data-label="Perkiraan" className={css.num}>
                    {done ? <span className={css.done}><Check aria-hidden />{kg(personTotal)}</span> : <span className={css.todo}><AlertCircle aria-hidden />Belum lengkap</span>}
                  </td>
                </tr>;
              })}
            </tbody>
          </table>}
      </section>}

      {tab === "pengaturan" && <div className={css.settings}>
        <section className={css.card}>
          <h2 className={css.h2}>Menginap</h2>
          <NumberField label="Jumlah malam" hint="Sama untuk semua peserta." value={settings.nights} unit="malam" onChange={value => setSetting("nights", value)} />
          <p className={css.auto}><BedDouble aria-hidden /><span><strong>{rooms} kamar, {people.length} orang</strong> terisi otomatis dari daftar kamar Misi Perjalanan. Emisi kamar dibagi rata ke penghuninya.</span></p>
        </section>
        <section className={css.card}>
          <h2 className={css.h2}>Makan</h2>
          <NumberField label="Porsi makan per peserta" hint="Contoh: 2 hari × 3 kali makan = 6 porsi." value={settings.mealsPerPerson} unit="porsi" onChange={value => setSetting("mealsPerPerson", value)} />
        </section>
        <section className={css.card}>
          <h2 className={css.h2}>Bus dan shuttle</h2>
          <NumberField label="Jarak shuttle, stasiun ke venue" hint="Sekali jalan. Untuk peserta yang dicentang Ikut shuttle." value={settings.shuttleKm} unit="km" onChange={value => setSetting("shuttleKm", value)} />
          <NumberField label="Penumpang per shuttle" hint="Emisi satu bus dibagi rata ke penumpangnya." value={settings.shuttlePerBus} unit="orang" onChange={value => setSetting("shuttlePerBus", value)} />
          <NumberField label="Penumpang per bus rombongan" hint="Untuk peserta dengan moda Bus (rombongan dari kota asal)." value={settings.groupBusPerBus} unit="orang" onChange={value => setSetting("groupBusPerBus", value)} />
        </section>
        <section className={css.card}>
          <h2 className={css.h2}>Faktor emisi</h2>
          <p className={css.muted}>Sama dengan WAM 2026. Diubah lewat tim produk, bukan di sini.</p>
          <ul className={css.factors}>
            {carbonFactorRows().map(row => <li key={row.key}><span><strong>{row.name}</strong><small>{row.unit}</small></span><b>{row.value}</b></li>)}
          </ul>
          <p className={css.refs}>Sumber data: {CARBON_REFERENCES.map((ref, index) => <span key={ref.url}><a href={ref.url} target="_blank" rel="noopener noreferrer" title={ref.title}>{ref.short}</a>{index < CARBON_REFERENCES.length - 1 ? ", " : ""}</span>)}</p>
        </section>
      </div>}
    </div>

    {paste && <PasteSheet names={people.map(person => person.name)} onClose={() => setPaste(false)} onApply={applied => {
      setPeople(list => list.map(person => {
        const row = applied.find(item => item.match === person.name);
        return row ? { ...person, travel: { ...(person.travel ?? EMPTY_TRAVEL), from: row.from, mode: row.mode ?? person.travel?.mode ?? null, km: row.km } } : person;
      }));
      touched(); setPaste(false); setTab("perjalanan"); setFilter("semua");
    }} />}
  </div>;
}

function NumberField({ label, hint, value, unit, onChange }: { label: string; hint: string; value: number; unit: string; onChange: (value: number) => void }) {
  return <label className={css.field}>
    <span className={css.label}>{label}</span>
    <span className={css.unitInput}><input className={css.input} type="number" inputMode="numeric" min={0} value={value || ""} placeholder="0" onChange={event => onChange(Number(event.target.value) || 0)} /><span>{unit}</span></span>
    <span className={css.fieldHint}>{hint}</span>
  </label>;
}

function PasteSheet({ names, onClose, onApply }: { names: string[]; onClose: () => void; onApply: (rows: ReturnType<typeof parsePastedTravel>["rows"]) => void }) {
  const [text, setText] = useState("");
  const result = parsePastedTravel(text, names);
  return <Sheet open onClose={onClose} title="Tempel dari Excel" subtitle="Salin kolom Nama, Kota asal, Moda, Km sekali jalan"
    footer={<button type="button" className={css.primary} disabled={!result.rows.length} onClick={() => onApply(result.rows)}>{result.rows.length ? `Terapkan ${result.rows.length} baris` : "Terapkan"}</button>}>
    <div className={css.paste}>
      <label className={css.field}>
        <span className={css.label}>Tempel di sini</span>
        <textarea className={css.textarea} rows={7} value={text} onChange={event => setText(event.target.value)} placeholder={"Nama\tKota asal\tModa\tKm\nRani Contoh\tJakarta\tKereta\t513"} />
        <span className={css.fieldHint}>Moda: Kereta, Bus, atau Lainnya. Baris judul boleh ikut.</span>
      </label>
      {text.trim() && <ul className={css.pasteResult}>
        <li className={css.ok}><Check aria-hidden />{result.rows.length} baris cocok dengan nama peserta</li>
        {result.unknown.length > 0 && <li className={css.warn}><AlertCircle aria-hidden />{result.unknown.length} nama tidak ditemukan: {result.unknown.map(row => row.name).join(", ")}</li>}
        {result.bad.length > 0 && <li className={css.warn}><AlertCircle aria-hidden />Baris {result.bad.join(", ")} tidak terbaca. Periksa kolom Km, harus angka.</li>}
      </ul>}
    </div>
  </Sheet>;
}
