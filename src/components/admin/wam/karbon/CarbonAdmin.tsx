"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, BedDouble, Bell, Check, Home, Info, Leaf, LogOut, Plus, RotateCcw, Search, Settings2, Trash2, TrainFront, UserRound, Utensils, Workflow } from "lucide-react";
import {
  CARBON_REFERENCES, OTHER_ROUTE, TRAVEL_MODES, carbonFactorRows, carbonFigure, carbonParts, carbonView, personCarbonInput, routeLabel, routeUse, routeValid, splitPercent, travelAnswered,
  type CarbonEventSettings, type CarbonPerson, type CarbonRoute, type CarbonSetup,
} from "@/lib/pra-wam/carbon";
import { CarbonCard } from "@/components/pra-wam/carbon/CarbonCard";
import css from "./carbon-admin.module.css";

type Tab = "ringkasan" | "jawaban" | "pengaturan";
type Filter = "semua" | "belum" | "sudah";

const clock = (date: Date) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(date);
const kg = (value: number) => { const figure = carbonFigure(value); return `${figure.value} ${figure.unit.replace(" CO₂e", "")}`; };

/**
 * Admin Pra WAM → Jejak karbon (prototype, 23 Nov 2026; docs/standar-admin.md). One owner for every
 * piece, so nothing is typed twice: the panitia set the event here (routes with their km, nights,
 * meals, shuttle, people per bus, and whether the participants' form is open); each participant
 * answers for themself on Beranda (route, back the same way, shuttle); rooms come from Misi
 * Perjalanan. "Jawaban peserta" only shows the answers: the panitia remind, or ask for an answer again
 * (which clears it, after a confirmation), but never type it. Controlled: the page that holds the
 * data passes it in (the prototype shares it with the participant's card).
 */
export function CarbonAdmin({ setup, people, onSetup, onPeople }: {
  setup: CarbonSetup; people: CarbonPerson[];
  onSetup: (setup: CarbonSetup) => void; onPeople: (people: CarbonPerson[]) => void;
}) {
  const [tab, setTab] = useState<Tab>("ringkasan");
  const [filter, setFilter] = useState<Filter>("semua");
  const [query, setQuery] = useState("");
  const [asking, setAsking] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [previewId, setPreviewId] = useState(people[0]?.id ?? "");
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
  const setSetting = (key: keyof CarbonEventSettings, value: number) => { onSetup({ ...setup, settings: { ...setup.settings, [key]: value } }); touched(); };
  const setRoutes = (routes: CarbonRoute[]) => { onSetup({ ...setup, routes }); touched(); };

  const rows = people.map(person => {
    const answered = travelAnswered(person.travel, setup.routes);
    const input = answered ? personCarbonInput(setup, person.travel, person.occupants) : null;
    const parts = input ? carbonParts(input) : null;
    return { person, answered, total: parts ? parts.perjalanan + parts.kamar + parts.makan : 0, parts };
  });
  const done = rows.filter(row => row.answered);
  const missing = rows.length - done.length;
  const sum = done.reduce((acc, row) => ({ perjalanan: acc.perjalanan + row.parts!.perjalanan, kamar: acc.kamar + row.parts!.kamar, makan: acc.makan + row.parts!.makan }), { perjalanan: 0, kamar: 0, makan: 0 });
  const total = sum.perjalanan + sum.kamar + sum.makan;
  const shares = splitPercent([sum.kamar, sum.perjalanan, sum.makan]);
  const rooms = new Set(people.map(person => person.room)).size;
  const use = routeUse(people);
  const others = done.filter(row => row.person.travel?.routeId === OTHER_ROUTE).length;

  const shown = rows.filter(row => (filter === "semua" || (filter === "sudah") === row.answered)
    && (!query.trim() || `${row.person.name} ${row.person.dept}`.toLowerCase().includes(query.trim().toLowerCase())));
  const preview = people.find(person => person.id === previewId) ?? people[0];
  const status = save.state === "saving" ? "Menyimpan…" : `Tersimpan ${clock(save.at)}`;
  const answerOf = (person: CarbonPerson) => {
    if (!person.travel) return "";
    const route = setup.routes.find(item => item.id === person.travel!.routeId);
    return route ? routeLabel(route) : "Rute lain (belum dihitung)";
  };

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
            {done.length}/{people.length} sudah mengisi · Formulir {setup.formOpen ? "dibuka" : "ditutup"} ·{" "}
            <span aria-live="polite" className={save.state === "saving" ? css.saving : css.saved}>{save.state === "saved" && <Check aria-hidden />}{status}</span>
          </span>
        </span>
        <button type="button" className={css.primary} onClick={() => setSave({ state: "saved", at: new Date() })}>Simpan</button>
      </div>

      <div className={css.tabs} role="tablist" aria-label="Bagian">
        {([["ringkasan", "Ringkasan"], ["jawaban", "Jawaban peserta"], ["pengaturan", "Pengaturan acara"]] as [Tab, string][]).map(([key, label]) =>
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={css.tab} onClick={() => setTab(key)}>
            {label}{key === "jawaban" && missing > 0 && <span className={css.badge}>{missing} belum</span>}
          </button>)}
      </div>

      {tab === "ringkasan" && <div className={css.summary}>
        <ul className={css.owners} aria-label="Siapa mengisi apa">
          <li><Settings2 aria-hidden /><strong>Panitia</strong><span>Rute, malam, makan, shuttle</span></li>
          <li><UserRound aria-hidden /><strong>Peserta</strong><span>Pilih rute sendiri</span></li>
          <li><Workflow aria-hidden /><strong>Otomatis</strong><span>Kamar</span></li>
        </ul>

        <div className={css.stats}>
          <section className={css.stat}>
            <span className={css.statLabel}>Total perkiraan</span>
            <span className={css.statValue}>{carbonFigure(total).value}<small>{carbonFigure(total).unit}</small></span>
          </section>
          <section className={css.stat}>
            <span className={css.statLabel}>Rata-rata per orang</span>
            <span className={css.statValue}>{done.length ? carbonFigure(total / done.length).value : "–"}<small>kg CO₂e</small></span>
          </section>
          <section className={css.stat}>
            <span className={css.statLabel}>Sudah mengisi</span>
            <span className={css.statValue}>{done.length}<small>dari {people.length}</small></span>
            <span className={css.progress} aria-hidden><i style={{ width: `${people.length ? (done.length / people.length) * 100 : 0}%` }} /></span>
            {missing > 0
              ? <button type="button" className={css.textLink} onClick={() => { setTab("jawaban"); setFilter("belum"); }}>Lihat {missing} yang belum</button>
              : null}
          </section>
        </div>

        <div className={css.twoCol}>
          <section className={css.card}>
            <h2 className={css.h2}>Asalnya</h2>
            <ul className={css.sources}>
              {([["kamar", "Kamar", BedDouble, sum.kamar, shares[0], `${setup.settings.nights} malam · ${rooms} kamar`],
                ["perjalanan", "Perjalanan", TrainFront, sum.perjalanan, shares[1], others ? `${others} rute lain belum dihitung` : "Rute dan shuttle"],
                ["makan", "Makan", Utensils, sum.makan, shares[2], `${setup.settings.mealsPerPerson} porsi per orang`]] as const).map(([key, title, Icon, value, share, note]) =>
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
                  {people.map(person => <option key={person.id} value={person.id}>{person.name}{travelAnswered(person.travel, setup.routes) ? "" : " (belum mengisi)"}</option>)}
                </select>
              </label>
            </div>
            <div className={css.phone}>
              {preview && <CarbonCard key={preview.id} view={carbonView(personCarbonInput(setup, preview.travel, preview.occupants))}
                form={{ routes: setup.routes, travel: preview.travel, open: setup.formOpen, onSave: () => say("Hanya pratinjau: jawaban diisi peserta sendiri.") }} />}
            </div>
          </section>
        </div>
      </div>}

      {tab === "jawaban" && <section className={css.card}>
        <p className={css.lead}><Info aria-hidden /><span>Diisi peserta sendiri. Panitia hanya bisa mengingatkan atau minta isi ulang.</span></p>
        <div className={css.toolbar}>
          <div className={css.chips} role="radiogroup" aria-label="Saring peserta">
            {([["semua", "Semua", people.length], ["belum", "Belum mengisi", missing], ["sudah", "Sudah mengisi", done.length]] as [Filter, string, number][]).map(([key, label, count]) =>
              <button key={key} type="button" role="radio" aria-checked={filter === key} className={css.chip} onClick={() => setFilter(key)}>{label} <span>{count}</span></button>)}
          </div>
          <label className={css.search}>
            <Search aria-hidden />
            <input type="search" placeholder="Cari nama" aria-label="Cari peserta" value={query} onChange={event => setQuery(event.target.value)} />
          </label>
          <button type="button" className={css.secondary} disabled={!missing || !setup.formOpen} onClick={() => say(`Pengingat terkirim ke ${missing} orang.`)}><Bell aria-hidden />Ingatkan semua ({missing})</button>
        </div>
        {!setup.formOpen && <p className={css.warnLine}><AlertCircle aria-hidden />Formulir ditutup.</p>}

        {shown.length === 0
          ? <p className={css.empty}>{filter === "belum" ? "Semua peserta sudah mengisi." : "Tidak ada peserta yang cocok."}</p>
          : <table className={css.table}>
            <thead><tr><th>Peserta</th><th>Kamar</th><th>Jawaban</th><th className={css.num}>Perkiraan</th><th><span className={css.srOnly}>Aksi</span></th></tr></thead>
            <tbody>
              {shown.map(({ person, answered, total: personTotal }) => <tr key={person.id}>
                <td data-label="Peserta"><span className={css.person}><strong>{person.name}</strong><span>{person.dept}</span></span></td>
                <td data-label="Kamar"><span className={css.cellMuted}>{person.room} · {person.occupants > 1 ? `${person.occupants} orang` : "sendiri"}</span></td>
                <td data-label="Jawaban">
                  {answered
                    ? <span className={css.answer}><strong>{answerOf(person)}</strong><span>{[person.travel!.roundTrip ? "Pulang-pergi" : "Pergi saja", person.travel!.shuttle ? "shuttle" : ""].filter(Boolean).join(" · ")}</span></span>
                    : <span className={css.todo}><AlertCircle aria-hidden />Belum</span>}
                </td>
                <td data-label="Perkiraan" className={css.num}>{answered ? <span className={css.done}>{kg(personTotal)}</span> : <span className={css.cellMuted}>–</span>}</td>
                <td className={css.actions}>
                  {!answered
                    ? <button type="button" className={css.small} disabled={!setup.formOpen} onClick={() => say(`Pengingat terkirim ke ${person.name}.`)}><Bell aria-hidden />Ingatkan</button>
                    : asking === person.id
                      ? <span className={css.confirm}>
                        <span>Kosongkan jawaban?</span>
                        <button type="button" className={css.small} onClick={() => setAsking(null)}>Batal</button>
                        <button type="button" className={`${css.small} ${css.danger}`} onClick={() => { onPeople(people.map(item => item.id === person.id ? { ...item, travel: null } : item)); setAsking(null); touched(); say(`${person.name} diminta isi ulang.`); }}>Ya</button>
                      </span>
                      : <button type="button" className={css.small} disabled={!setup.formOpen} onClick={() => setAsking(person.id)}><RotateCcw aria-hidden />Isi ulang</button>}
                </td>
              </tr>)}
            </tbody>
          </table>}
      </section>}

      {tab === "pengaturan" && <div className={css.settings}>
        <section className={css.card}>
          <h2 className={css.h2}>Formulir peserta</h2>
          <div className={css.segmented} role="radiogroup" aria-label="Formulir peserta">
            <button type="button" role="radio" aria-checked={setup.formOpen} onClick={() => { onSetup({ ...setup, formOpen: true }); touched(); }}>Dibuka</button>
            <button type="button" role="radio" aria-checked={!setup.formOpen} onClick={() => { onSetup({ ...setup, formOpen: false }); touched(); }}>Ditutup</button>
          </div>
        </section>

        <section className={css.card}>
          <h2 className={css.h2}>Rute</h2>
          <p className={css.muted}>Peserta memilih dari daftar ini.</p>
          <ul className={css.routes}>
            {setup.routes.map(route => {
              const used = use.get(route.id) ?? 0;
              const valid = routeValid(route);
              const update = (change: Partial<CarbonRoute>) => setRoutes(setup.routes.map(item => item.id === route.id ? { ...item, ...change } : item));
              return <li key={route.id} className={css.route}>
                <div className={css.routeFields}>
                  <label className={css.field}><span className={css.label}>Kota asal</span>
                    <input className={css.input} value={route.from} placeholder="Contoh: Jakarta" aria-invalid={!route.from.trim() || undefined} onChange={event => update({ from: event.target.value })} /></label>
                  <div className={css.field}><span className={css.label} id={`moda-${route.id}`}>Moda</span>
                    <span className={css.modes} role="radiogroup" aria-labelledby={`moda-${route.id}`}>
                      {TRAVEL_MODES.map(mode => <button key={mode.key} type="button" role="radio" aria-checked={route.mode === mode.key} className={css.mode} onClick={() => update({ mode: mode.key })}>{mode.label}</button>)}
                    </span></div>
                  <label className={css.field}><span className={css.label}>Jarak (sekali jalan)</span>
                    <span className={css.unitInput}><input className={css.input} type="number" inputMode="numeric" min={0} placeholder="0" aria-invalid={!(route.km > 0) || undefined} value={route.km || ""} onChange={event => update({ km: Number(event.target.value) || 0 })} /><span>km</span></span></label>
                </div>
                <div className={css.routeFoot}>
                  <span className={valid ? css.cellMuted : css.fieldError}>{valid ? (used ? `Dipilih ${used} orang` : "Belum dipilih") : "Isi kota dan jarak."}</span>
                  <button type="button" className={css.small} disabled={used > 0} title={used ? "Rute yang sudah dipilih peserta tidak bisa dihapus" : undefined}
                    onClick={() => setRoutes(setup.routes.filter(item => item.id !== route.id))}><Trash2 aria-hidden />Hapus</button>
                </div>
              </li>;
            })}
          </ul>
          <button type="button" className={css.secondary} onClick={() => setRoutes([...setup.routes, { id: `r${Date.now()}`, from: "", mode: "kereta", km: 0 }])}><Plus aria-hidden />Tambah rute</button>
        </section>

        <section className={css.card}>
          <h2 className={css.h2}>Menginap dan makan</h2>
          <NumberField label="Jumlah malam" value={setup.settings.nights} unit="malam" onChange={value => setSetting("nights", value)} />
          <NumberField label="Porsi makan per orang" value={setup.settings.mealsPerPerson} unit="porsi" onChange={value => setSetting("mealsPerPerson", value)} />
          <p className={css.auto}><BedDouble aria-hidden /><span>{rooms} kamar otomatis dari Misi Perjalanan</span></p>
        </section>

        <section className={css.card}>
          <h2 className={css.h2}>Bus dan shuttle</h2>
          <NumberField label="Jarak shuttle (stasiun ke venue)" value={setup.settings.shuttleKm} unit="km" onChange={value => setSetting("shuttleKm", value)} />
          <NumberField label="Penumpang per shuttle" value={setup.settings.shuttlePerBus} unit="orang" onChange={value => setSetting("shuttlePerBus", value)} />
          <NumberField label="Penumpang per bus rombongan" value={setup.settings.groupBusPerBus} unit="orang" onChange={value => setSetting("groupBusPerBus", value)} />
        </section>

        <section className={css.card}>
          <h2 className={css.h2}>Faktor emisi</h2>
          <p className={css.muted}>Sama dengan WAM 2026.</p>
          <ul className={css.factors}>
            {carbonFactorRows().map(row => <li key={row.key}><span><strong>{row.name}</strong><small>{row.unit}</small></span><b>{row.value}</b></li>)}
          </ul>
          <p className={css.refs}>Sumber: {CARBON_REFERENCES.map((ref, index) => <span key={ref.url}><a href={ref.url} target="_blank" rel="noopener noreferrer" title={ref.title}>{ref.short}</a>{index < CARBON_REFERENCES.length - 1 ? ", " : ""}</span>)}</p>
        </section>
      </div>}
    </div>
    <div className={css.toast} role="status" aria-live="polite">{toast && <span><Check aria-hidden />{toast}</span>}</div>
  </div>;
}

function NumberField({ label, value, unit, onChange }: { label: string; value: number; unit: string; onChange: (value: number) => void }) {
  return <label className={css.field}>
    <span className={css.label}>{label}</span>
    <span className={css.unitInput}><input className={css.input} type="number" inputMode="numeric" min={0} value={value || ""} placeholder="0" onChange={event => onChange(Number(event.target.value) || 0)} /><span>{unit}</span></span>
  </label>;
}
