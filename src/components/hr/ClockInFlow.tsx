"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, FilePen, History, LogIn, LogOut, MapPin, RotateCcw, ScanFace, ShieldCheck } from "lucide-react";
import {
  clockMethodLabels, CONSENT_VERSION, consentPoints, faceStatusLabels, flagLabels, kindLabels, nextKind, REASON_KINDS, reasonLabels, statusLabels,
  type ClockInState, type DailyKind, type DailyRecord, type FaceStatus, type ReasonKind,
} from "@/lib/hr/attendance";
import { distanceLabel, locationVerdict, MAX_ACCURACY_M } from "@/lib/hr/geo";
import { matchPercent } from "@/lib/hr/face-match";
import { instantLabel, zoneSuffix, zoneTime, type ViewerZone } from "@/lib/pra-wam/zone";
import { errorText } from "@/components/pra-wam/api";
import { loadState, readPlace, startClockIn, startEnroll, submitClockIn, submitEnroll, withdrawFace, type Challenge, type Place } from "./clockInApi";
import { FaceCamera, type FaceCapture } from "./FaceCamera";
import { MyRequests, RevisionForm } from "./RevisionForm";
import { useViewerZone } from "@/components/pra-wam/ViewerZone";
import styles from "./absen.module.css";

type Reason = { kind: ReasonKind; text: string };
type Step =
  | { name: "ringkas" }
  | { name: "persetujuan"; then: "daftar" | DailyKind }
  | { name: "lokasi"; kind: DailyKind; consent: string | null }
  | { name: "kamera"; kind: DailyKind; challenge: Challenge; place: Place; reason: Reason | null; consent: string | null }
  | { name: "daftar"; challenge: Challenge; then: DailyKind | null }
  | { name: "kirim"; text: string }
  | { name: "hasil"; title: string; record: DailyRecord | null; note: string | null; then: DailyKind | null }
  | { name: "gagal"; text: string; retry: Step }
  | { name: "revisi"; date: string };

const usable = (status: FaceStatus | undefined) => status === "aktif" || status === "menunggu" || status === "siap";
const dateOf = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
/** "Selamat pagi" by the hour where the person is. */
function greetingAt(iso: string, zone: ViewerZone): string {
  const hour = Number(zoneTime(iso, zone).slice(0, 2));
  return hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam";
}
/** The time now, starting from the server's (so the first paint matches) and moving every 15 seconds. */
function useNow(initial: string): string {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 15_000);
    const first = window.setTimeout(() => setNow(new Date().toISOString()), 0);
    return () => { window.clearInterval(timer); window.clearTimeout(first); };
  }, []);
  return now;
}

function StatusChip({ record }: { record: DailyRecord }) {
  return <span className={`${styles.chip} ${styles[`chip_${record.status}`]}`}>{statusLabels[record.status]}</span>;
}

/** One slot of today: "Masuk 08.52 · Kantor Contoh", or "Belum". */
function Slot({ kind, record }: { kind: DailyKind; record: DailyRecord | null }) {
  const zone = useViewerZone();
  return <div className={styles.slot} data-done={record ? "ya" : undefined}>
    <span className={styles.slotLabel}><span className={styles.slotIcon} aria-hidden>{kind === "masuk" ? <LogIn size={16} /> : <LogOut size={16} />}</span>{kindLabels[kind]}</span>
    {record ? <>
      <strong className={styles.slotTime}>{instantLabel(record.at, zone)}{zoneSuffix(zone)}</strong>
      <span className={styles.slotPlace}>{record.officeName && !record.reasonKind ? record.officeName : record.reasonKind ? reasonLabels[record.reasonKind] : record.method === "manual" ? "Dicatat Admin HR" : "Di luar kantor"}</span>
      {record.status !== "sah" && <StatusChip record={record} />}
    </> : <strong className={styles.slotEmpty}>Belum</strong>}
  </div>;
}

/**
 * Absen harian (20 Nov 2026): today's masuk and pulang, and the way to clock in: the location
 * first (inside an office point, or a reason), then the face with two liveness steps, then the
 * server decides. First time: the consent, then the face is enrolled. Everything happens on this
 * screen without a reload; the server's answer replaces the summary.
 */
export function ClockInFlow({ initial, openEnroll = false, name = "", now: serverNow = new Date().toISOString() }: { initial: ClockInState; openEnroll?: boolean; name?: string; now?: string }) {
  const zone = useViewerZone();
  const now = useNow(serverNow);
  const [state, setState] = useState(initial);
  const [step, setStep] = useState<Step>(() => openEnroll && initial.ready && !usable(initial.face?.status) ? { name: "persetujuan", then: "daftar" } : { name: "ringkas" });
  const [agreed, setAgreed] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [reason, setReason] = useState<Reason>({ kind: "event", text: "" });
  const [reasonPicked, setReasonPicked] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const next = nextKind(state.today);
  const verdict = useMemo(() => (place ? locationVerdict(place, state.offices) : null), [place, state.offices]);
  const refresh = async () => { try { setState(await loadState()); } catch { /* keep what is shown */ } };

  const read = async () => {
    setReading(true); setPlaceError(null);
    try { setPlace(await readPlace()); } catch (error) { setPlaceError(errorText(error)); } finally { setReading(false); }
  };
  useEffect(() => {
    if (step.name !== "lokasi" || place || reading || placeError) return;
    const timer = window.setTimeout(() => void read(), 0);
    return () => window.clearTimeout(timer);
  });

  /** "Absen masuk" / "Absen pulang": consent and enrolment first when needed, else the location. */
  const begin = (kind: DailyKind) => {
    setNotice(null); setAgreed(false); setPlace(null); setPlaceError(null); setReasonPicked(false); setReason({ kind: "event", text: "" });
    if (!usable(state.face?.status)) setStep({ name: "persetujuan", then: "daftar" });
    else if (state.face?.status === "siap" && !state.face.consented) setStep({ name: "persetujuan", then: kind });
    else setStep({ name: "lokasi", kind, consent: null });
  };

  const openCamera = async (kind: DailyKind, consent: string | null) => {
    if (!place) return;
    const outside = verdict?.kind === "di_luar";
    setStep({ name: "kirim", text: "Menyiapkan absen…" });
    try {
      const answer = await startClockIn(kind);
      if (answer.kind === "daftar") { setNotice(answer.message); setStep({ name: "persetujuan", then: "daftar" }); return; }
      if (answer.kind === "sudah") { await refresh(); setStep({ name: "hasil", title: `Absen ${kindLabels[kind].toLowerCase()} hari ini sudah tercatat`, record: answer.record, note: null, then: null }); return; }
      setStep({ name: "kamera", kind, challenge: answer.challenge, place, reason: outside ? reason : null, consent });
    } catch (error) {
      setStep({ name: "gagal", text: errorText(error), retry: { name: "lokasi", kind, consent } });
    }
  };

  const captured = async (current: Extract<Step, { name: "kamera" }>, capture: FaceCapture) => {
    setStep({ name: "kirim", text: "Mengirim absen…" });
    try {
      const { data, message } = await submitClockIn(current.challenge, capture, current.place, current.reason, current.consent);
      await refresh();
      const flags = data.record.flags.map(flag => flagLabels[flag]).join(", ");
      setStep({ name: "hasil", title: message, record: data.record, note: data.record.status === "perlu_cek" ? `Perlu dicek Admin HR: ${flags}.` : null, then: null });
    } catch (error) {
      setStep({ name: "gagal", text: errorText(error), retry: { name: "lokasi", kind: current.kind, consent: current.consent } });
    }
  };

  const enroll = async (then: DailyKind | null) => {
    setStep({ name: "kirim", text: "Menyiapkan kamera…" });
    try { setStep({ name: "daftar", challenge: await startEnroll(), then }); }
    catch (error) { setStep({ name: "gagal", text: errorText(error), retry: { name: "persetujuan", then: "daftar" } }); }
  };

  const enrolled = async (current: Extract<Step, { name: "daftar" }>, capture: FaceCapture) => {
    setStep({ name: "kirim", text: "Menyimpan wajahmu…" });
    try {
      const { data, message } = await submitEnroll(current.challenge, capture, CONSENT_VERSION);
      await refresh();
      setStep({ name: "hasil", title: message, record: null, note: data.status === "menunggu" ? "Absenmu tetap bisa dicatat; statusnya \"Perlu dicek\" sampai Admin HR menyetujui wajahmu." : null, then: current.then ?? next });
    } catch (error) {
      setStep({ name: "gagal", text: errorText(error), retry: { name: "persetujuan", then: "daftar" } });
    }
  };

  const withdraw = async () => {
    setConfirmWithdraw(false);
    try { setNotice(await withdrawFace()); await refresh(); } catch (error) { setNotice(errorText(error)); }
  };

  if (!state.ready) return <section className={styles.panel}>
    <h1 className={styles.title}>Absen harian</h1>
    <p className={styles.muted}>{state.waiting ?? "Absen harian belum dibuka."}</p>
  </section>;

  if (step.name === "persetujuan") return <section className={styles.panel} aria-labelledby="persetujuan-judul">
    <span className={styles.iconTile}><ShieldCheck aria-hidden /></span>
    <h1 id="persetujuan-judul" className={styles.title}>Persetujuan data wajah</h1>
    {notice && <p className={styles.muted}>{notice}</p>}
    <ul className={styles.points}>{consentPoints.map(point => <li key={point}>{point}</li>)}</ul>
    <label className={styles.agree}><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} /> Saya sudah membaca dan setuju.</label>
    <div className={styles.buttons}>
      <button type="button" className={styles.main} disabled={!agreed} onClick={() => (step.then === "daftar" ? void enroll(next) : setStep({ name: "lokasi", kind: step.then, consent: CONSENT_VERSION }))}>
        {step.then === "daftar" ? "Setuju, daftarkan wajah" : "Setuju, lanjut absen"}
      </button>
      <button type="button" className={styles.second} onClick={() => setStep({ name: "ringkas" })}>Nanti saja</button>
    </div>
    <p className={styles.small}>Tidak setuju? Absenmu tetap bisa dicatat manual oleh Admin HR.</p>
  </section>;

  if (step.name === "lokasi") {
    const outside = verdict?.kind === "di_luar";
    const reasonOk = !outside || (reasonPicked && (reason.kind !== "lainnya" || reason.text.trim().length >= 3));
    return <section className={styles.panel} aria-labelledby="lokasi-judul">
      <span className={styles.iconTile}><MapPin aria-hidden /></span>
      <h1 id="lokasi-judul" className={styles.title}>Absen {kindLabels[step.kind].toLowerCase()} · lokasi</h1>
      {reading && <p className={styles.muted} role="status">Membaca lokasi…</p>}
      {placeError && <p className={styles.problem} role="alert">{placeError}</p>}
      {verdict?.kind === "di_dalam" && <p className={styles.good}>Di dalam area <strong>{verdict.office.name}</strong> · {distanceLabel(verdict.distanceM)} dari titik kantor</p>}
      {verdict?.kind === "di_luar" && <>
        <p className={styles.warn}>
          {verdict.why === "tidak_akurat" ? `Lokasi kurang akurat (±${distanceLabel(place!.accuracyM)}, perlu ±${MAX_ACCURACY_M} m). Nyalakan GPS atau dekati jendela, lalu baca ulang.`
            : verdict.why === "tanpa_kantor" ? "Titik kantor belum diatur Admin HR."
              : `Di luar area kantor · ${distanceLabel(verdict.nearest!.distanceM)} dari ${verdict.nearest!.office.name}.`}
        </p>
        <fieldset className={styles.reasons}>
          <legend>Kamu absen dari mana?</legend>
          {REASON_KINDS.map(kind => <label key={kind} className={reasonPicked && reason.kind === kind ? styles.reasonOn : styles.reason}>
            <input type="radio" name="alasan" value={kind} checked={reasonPicked && reason.kind === kind} onChange={() => { setReasonPicked(true); setReason(value => ({ ...value, kind })); }} />
            {reasonLabels[kind]}
          </label>)}
        </fieldset>
        <label className={styles.field}>
          <span>Keterangan{reason.kind === "lainnya" ? "" : " (boleh kosong)"}</span>
          <input type="text" maxLength={300} value={reason.text} placeholder="Mis. nama venue atau klien" onChange={event => setReason(value => ({ ...value, text: event.target.value }))} />
        </label>
        <p className={styles.small}>Absen di luar area tetap tercatat, dengan status &quot;Perlu dicek&quot; sampai Admin HR menyetujui.</p>
      </>}
      <div className={styles.buttons}>
        <button type="button" className={styles.main} disabled={!place || reading || !reasonOk} onClick={() => void openCamera(step.kind, step.consent)}><ScanFace size={18} aria-hidden /> Lanjut ke kamera</button>
        <button type="button" className={styles.second} disabled={reading} onClick={() => { setPlace(null); setPlaceError(null); void read(); }}><RotateCcw size={16} aria-hidden /> Baca ulang lokasi</button>
        <button type="button" className={styles.second} onClick={() => setStep({ name: "ringkas" })}>Batal</button>
      </div>
    </section>;
  }

  if (step.name === "kamera") return <section className={styles.flowCamera} aria-label={`Absen ${kindLabels[step.kind].toLowerCase()} · wajah`}>
    <FaceCamera key={step.challenge.nonce} steps={step.challenge.steps} purpose="absen" onDone={capture => void captured(step, capture)} onCancel={() => setStep({ name: "ringkas" })} />
  </section>;

  if (step.name === "daftar") return <section className={styles.flowCamera} aria-label="Daftar wajah">
    <p className={styles.muted}>Daftar wajah, sekali saja. Ikuti petunjuk di bawah kamera.</p>
    <FaceCamera key={step.challenge.nonce} steps={step.challenge.steps} purpose="daftar" onDone={capture => void enrolled(step, capture)} onCancel={() => setStep({ name: "ringkas" })} />
  </section>;

  if (step.name === "kirim") return <section className={styles.panel} aria-busy="true">
    <span className={styles.spinner} aria-hidden />
    <p className={styles.muted} role="status">{step.text}</p>
  </section>;

  if (step.name === "gagal") return <section className={styles.panel}>
    <p className={styles.problem} role="alert">{step.text}</p>
    <div className={styles.buttons}>
      <button type="button" className={styles.main} onClick={() => setStep(step.retry)}><RotateCcw size={18} aria-hidden /> Coba lagi</button>
      <button type="button" className={styles.second} onClick={() => setStep({ name: "ringkas" })}>Kembali</button>
    </div>
  </section>;

  if (step.name === "revisi") {
    const of = (kind: DailyKind) => state.recent.find(record => record.workDate === step.date && record.kind === kind) ?? null;
    const waitingKinds = state.requests.filter(request => request.status === "menunggu" && request.workDate === step.date).map(request => request.kind);
    return <RevisionForm date={step.date} records={{ masuk: of("masuk"), pulang: of("pulang") }} zone={zone} waiting={waitingKinds}
      onCancel={() => setStep({ name: "ringkas" })}
      onDone={message => { setNotice(message); void refresh(); setStep({ name: "ringkas" }); }} />;
  }

  if (step.name === "hasil") return <section className={styles.panel} aria-live="polite">
    <span className={styles.doneTile}><CheckCircle2 aria-hidden /></span>
    <h1 className={styles.title}>{step.title}</h1>
    {step.record && <p className={styles.muted}>{instantLabel(step.record.at, zone)}{zoneSuffix(zone)}{step.record.officeName ? ` · ${step.record.officeName}` : ""}</p>}
    {step.record?.faceScore != null && <p className={styles.match}><ScanFace size={16} aria-hidden /> Kecocokan wajah {matchPercent(step.record.faceScore)}%</p>}
    {step.note && <p className={styles.warn}>{step.note}</p>}
    <div className={styles.buttons}>
      {step.then && <button type="button" className={styles.main} onClick={() => begin(step.then!)}>Lanjut absen {kindLabels[step.then].toLowerCase()}</button>}
      <button type="button" className={step.then ? styles.second : styles.main} onClick={() => setStep({ name: "ringkas" })}>Selesai</button>
    </div>
  </section>;

  // Ringkasan: a greeting with the clock and one big button for what comes next (where the thumb
  // rests), today's masuk and pulang, the last two weeks, and the face data.
  const history = [...new Set(state.recent.map(record => record.workDate))].filter(date => date !== state.today.workDate);
  return <div className={styles.flow}>
    <section className={styles.hero} aria-labelledby="sapaan">
      <div className={styles.heroTop}>
        <p id="sapaan" className={styles.hello}>{greetingAt(now, zone)}{name ? <>,<br /><strong>{name}</strong></> : null}</p>
        <span className={styles.zoneChip}>{zone}</span>
      </div>
      <p className={styles.clock}><time dateTime={now}>{instantLabel(now, zone)}</time></p>
      <p className={styles.today}>{dateOf(state.today.workDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
      {next
        ? <button type="button" className={styles.bigAction} onClick={() => begin(next)}>
          <ScanFace aria-hidden />
          <span>Absen {kindLabels[next].toLowerCase()}</span>
        </button>
        : <p className={styles.allDone}><CheckCircle2 aria-hidden /> Absen hari ini lengkap</p>}
      <p className={styles.heroHint}>{next ? <><MapPin size={14} aria-hidden /> {clockMethodLabels[state.method]} · lokasi dicek saat absen</> : "Terima kasih, sampai jumpa besok."}</p>
      {next === "masuk" && <button type="button" className={styles.textButton} onClick={() => begin("pulang")}>Lupa absen masuk? Absen pulang</button>}
    </section>

    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.slots} aria-label="Absen hari ini"><Slot kind="masuk" record={state.today.masuk} /><Slot kind="pulang" record={state.today.pulang} /></div>
    <button type="button" className={styles.textButton} onClick={() => setStep({ name: "revisi", date: state.today.workDate })}><FilePen size={16} aria-hidden /> Ada yang salah hari ini? Ajukan revisi</button>

    {history.length > 0 && <section className={styles.panel} aria-labelledby="riwayat">
      <h2 id="riwayat" className={styles.subtitle}><History size={18} aria-hidden /> Riwayat sebulan</h2>
      <ul className={styles.history}>
        {history.map(date => {
          const of = (kind: DailyKind) => state.recent.find(record => record.workDate === date && record.kind === kind);
          const masuk = of("masuk"), pulang = of("pulang");
          const waiting = [masuk, pulang].find(record => record && record.status !== "sah");
          return <li key={date}>
            <span className={styles.histDay}><strong>{dateOf(date, { weekday: "short" })}</strong><small>{dateOf(date, { day: "numeric", month: "short" })}</small></span>
            <span className={styles.histTimes}>
              <span><LogIn size={14} aria-label="Masuk" />{masuk ? instantLabel(masuk.at, zone) : "—"}</span>
              <span><LogOut size={14} aria-label="Pulang" />{pulang ? instantLabel(pulang.at, zone) : "—"}</span>
            </span>
            {waiting ? <StatusChip record={waiting} /> : <span className={styles.histOk}><CheckCircle2 size={16} aria-label="Sah" /></span>}
            <button type="button" className={styles.histRevise} aria-label={`Ajukan revisi ${dateOf(date, { weekday: "long", day: "numeric", month: "long" })}`} onClick={() => setStep({ name: "revisi", date })}><FilePen size={16} aria-hidden /></button>
          </li>;
        })}
      </ul>
    </section>}

    <MyRequests requests={state.requests} onChanged={message => { setNotice(message); void refresh(); }} />

    <section id="data-wajah" className={styles.panel} aria-labelledby="wajah">
      <div className={styles.faceRow}>
        <span className={styles.iconTile}><ShieldCheck aria-hidden /></span>
        <span className={styles.faceText}>
          <h2 id="wajah" className={styles.subtitle}>Data wajah</h2>
          <span className={styles.muted}>{state.face ? faceStatusLabels[state.face.status] : "Belum terdaftar"}{state.face?.source === "greatday" && state.face.status === "siap" ? " (dari foto GreatDay)" : ""}</span>
        </span>
        {!usable(state.face?.status) && <button type="button" className={styles.chipButton} onClick={() => { setAgreed(false); setStep({ name: "persetujuan", then: "daftar" }); }}>Daftar <ChevronRight size={16} aria-hidden /></button>}
      </div>
      {state.face?.consented && !confirmWithdraw && <button type="button" className={styles.textButton} onClick={() => setConfirmWithdraw(true)}>Hapus data wajah</button>}
      {confirmWithdraw && <div className={styles.confirm} role="alertdialog" aria-label="Hapus data wajah">
        <p>Wajah acuan dan semua selfie absenmu akan dihapus. Absen berikutnya dicatat Admin HR secara manual, sampai kamu daftar wajah lagi.</p>
        <div className={styles.buttons}>
          <button type="button" className={styles.danger} onClick={() => void withdraw()}>Ya, hapus</button>
          <button type="button" className={styles.second} onClick={() => setConfirmWithdraw(false)}>Batal</button>
        </div>
      </div>}
    </section>
  </div>;
}
