"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, KeyRound, Lock, LockKeyhole, RefreshCw, Search, ShieldAlert, Unlock, type LucideIcon } from "lucide-react";
import { Button, ButtonLink, Notice } from "@/components/ui";
import { AdminApiError, adminRequest, errorMessage } from "@/components/admin/shared/api";
import { HR_LOCKOUT_MINUTES, HR_MAX_FAILURES, HR_UNLOCK_MINUTES } from "@/lib/pra-wam/hr-password";
import { praWamHrApi, wamAdminPath } from "@/lib/routes";
import type { HrAction, HrLogRow, HrPersonDetail, HrPersonRow } from "@/lib/server/pra-wam/hr-lock";
import { HrPasswordInput } from "./HrPasswordInput";
import hr from "./hr.module.css";

/** What the server knows before rendering; data only when it verified the unlock itself. */
export type HrScreenState = {
  migrated: boolean; hasPassword: boolean; unlockedUntil: string | null; lockedUntil: string | null; attemptsLeft: number; renderedAt: number;
};
export type HrScreenData = { people: HrPersonRow[]; questions: number; log: HrLogRow[] } | null;

/* A shared clock for the countdowns: one timer however many read it. */
let clock = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
function subscribe(listener: () => void) {
  clock = Date.now();
  listeners.add(listener);
  timer ??= setInterval(() => { clock = Date.now(); listeners.forEach(notify => notify()); }, 5_000);
  return () => { listeners.delete(listener); if (!listeners.size && timer) { clearInterval(timer); timer = undefined; } };
}
const useNow = (serverNow: number) => useSyncExternalStore(subscribe, () => clock, () => serverNow);

const when = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const minutesUntil = (iso: string, now: number) => Math.max(0, Math.ceil((Date.parse(iso) - now) / 60_000));

/** "Chrome di Android": enough to recognise a device in the log, nothing more. */
function device(userAgent: string | null): string {
  if (!userAgent) return "Perangkat tidak dikenal";
  const browser = /Edg\//.test(userAgent) ? "Edge" : /OPR\//.test(userAgent) ? "Opera" : /Firefox\//.test(userAgent) ? "Firefox" : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : "Browser";
  const system = /iPhone|iPad/.test(userAgent) ? "iOS" : /Android/.test(userAgent) ? "Android" : /Windows/.test(userAgent) ? "Windows" : /Mac OS X/.test(userAgent) ? "macOS" : /Linux/.test(userAgent) ? "Linux" : "";
  return system ? `${browser} di ${system}` : browser;
}

const actions: Record<HrAction, { icon: LucideIcon; text: (subject: string | null) => string }> = {
  buka: { icon: Unlock, text: () => "Membuka Data HR" },
  gagal: { icon: ShieldAlert, text: () => "Gagal membuka: password HR salah" },
  kunci: { icon: Lock, text: () => "Mengunci Data HR" },
  lihat: { icon: Eye, text: subject => `Membuka jawaban ${subject ?? "seseorang"}` },
  ekspor: { icon: Download, text: () => "Mengekspor data HR" },
  ganti_password: { icon: KeyRound, text: () => "Mengatur, mengganti, atau mengatur ulang password HR" },
};

/** A padlock on a shield: the locked screen's picture. */
function LockArt() {
  return <svg className={hr.lockArt} viewBox="0 0 112 112" aria-hidden="true">
    <circle cx="56" cy="56" r="54" fill="#eef4fd" />
    <path d="M56 18 84 29v22c0 19-12 34-28 41-16-7-28-22-28-41V29Z" fill="#fff" stroke="#2f6feb" strokeWidth="3" strokeLinejoin="round" />
    <rect x="42" y="50" width="28" height="22" rx="5" fill="#2f6feb" />
    <path d="M47 50v-6a9 9 0 0 1 18 0v6" fill="none" stroke="#2f6feb" strokeWidth="4" strokeLinecap="round" />
    <circle cx="56" cy="59" r="3" fill="#fff" />
    <path d="M56 61v5" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
  </svg>;
}

/**
 * Admin WAM → Kuesioner → Data HR. Locked: who may open it, that every opening is logged, the
 * password form and, after too many wrong tries, how long until it can be tried again. Unlocked
 * (the server checked the cookie before sending anything): the time left, "Kunci sekarang", the
 * people who answered HR questions, one person's answers, and the access log. Unlocking and
 * locking reload the page from the server, so HR data only ever arrives from a verified render
 * or an API that checks the unlock again.
 */
export function HrDataScreen({ state, data }: { state: HrScreenState; data: HrScreenData }) {
  if (!state.migrated) return <Notice tone="warning">Data HR menunggu migrasi 202611040011_wam_questionnaire.sql. Sampai migrasi diterapkan, tidak ada data yang bisa dibuka.</Notice>;
  if (!state.hasPassword) return <div className={hr.lockCard}>
    <LockArt />
    <h2 className={hr.lockTitle}>Password HR belum diatur</h2>
    <p className={hr.lead}>Data HR hanya bisa dibuka dengan password HR yang terpisah dari password admin. Atur password itu dulu di Pengaturan kuesioner.</p>
    <ButtonLink href={wamAdminPath.questionnaire.settings}><KeyRound size={17} aria-hidden="true" /> Atur password HR</ButtonLink>
  </div>;
  return state.unlockedUntil && data ? <Unlocked until={state.unlockedUntil} renderedAt={state.renderedAt} data={data} /> : <Locked state={state} />;
}

function Locked({ state }: { state: HrScreenState }) {
  const router = useRouter();
  const now = useNow(state.renderedAt);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lockedUntil, setLockedUntil] = useState(state.lockedUntil);
  const [left, setLeft] = useState(state.attemptsLeft);
  const wait = lockedUntil ? minutesUntil(lockedUntil, now) : 0;
  const paused = wait > 0;

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || paused) return;
    if (!password) { setError("Isi password HR."); return; }
    setBusy(true); setError("");
    try {
      await adminRequest<{ expiresAt: string }>(praWamHrApi.unlock, { method: "POST", body: JSON.stringify({ password }) });
      setPassword("");
      // The data comes from the server render, which checks the new cookie itself.
      router.refresh();
    } catch (problem) {
      setPassword("");
      setError(errorMessage(problem));
      if (problem instanceof AdminApiError && problem.status === 429) setLockedUntil(new Date(Date.now() + HR_LOCKOUT_MINUTES * 60_000).toISOString());
      else if (problem instanceof AdminApiError && problem.status === 403) setLeft(count => Math.max(1, count - 1));
      setBusy(false);
    }
  }

  return <div className={hr.lockCard}>
    <LockArt />
    <h2 className={hr.lockTitle}>Data HR terkunci</h2>
    <ul className={hr.lockList}>
      <li>Berisi jawaban per orang dengan level HR dan Rahasia: kesehatan, data menginap, dan kontak.</li>
      <li>Hanya HR dan orang yang diberi tahu password HR yang bisa membukanya. Password ini terpisah dari password admin.</li>
      <li>Terbuka {HR_UNLOCK_MINUTES} menit di perangkat ini saja, lalu terkunci lagi otomatis.</li>
      <li>Setiap buka, gagal buka, dan buka data per orang dicatat: waktu, IP, dan perangkat.</li>
    </ul>
    {paused
      ? <Notice tone="warning">{error || `Terlalu banyak password yang salah. Coba lagi dalam ${wait} menit.`}</Notice>
      : left < HR_MAX_FAILURES && <Notice tone="info">Sisa {left} percobaan sebelum dikunci sementara.</Notice>}
    <form className={hr.lockForm} onSubmit={unlock} noValidate aria-busy={busy}>
      {error && !paused && <Notice tone="error">{error}</Notice>}
      <HrPasswordInput id="hr-unlock" label="Password HR" value={password} onChange={value => { setPassword(value); setError(""); }}
        autoComplete="current-password" disabled={busy || paused} autoFocus />
      <Button type="submit" disabled={busy || paused}><LockKeyhole size={17} aria-hidden="true" /> {busy ? "Memeriksa…" : "Buka Data HR"}</Button>
    </form>
  </div>;
}

function Unlocked({ until, renderedAt, data }: { until: string; renderedAt: number; data: NonNullable<HrScreenData> }) {
  const router = useRouter();
  const now = useNow(renderedAt);
  const [query, setQuery] = useState("");
  const [log, setLog] = useState(data.log);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<HrPersonDetail | null>(null);
  const [busy, setBusy] = useState<"lock" | "person" | "log" | null>(null);
  const [message, setMessage] = useState("");

  const msLeft = Date.parse(until) - now;
  const minutes = Math.floor(msLeft / 60_000);
  const over = msLeft <= 0;
  // Locked by time: what is on screen is hidden at once, and the server renders the lock screen.
  useEffect(() => { if (over) router.refresh(); }, [over, router]);
  const shown = over ? null : detail;

  const people = useMemo(() => {
    const words = query.trim().toLocaleLowerCase("id").split(/\s+/).filter(Boolean);
    return words.length ? data.people.filter(person => words.every(word => `${person.name} ${person.department}`.toLocaleLowerCase("id").includes(word))) : data.people;
  }, [data.people, query]);

  /** A 403 means the lock closed meanwhile (time, a new password, another tab): reload locked. */
  function closedMeanwhile(problem: unknown) {
    if (problem instanceof AdminApiError && problem.status === 403) { setDetail(null); router.refresh(); return true; }
    return false;
  }

  async function refreshLog() {
    try { const result = await adminRequest<HrLogRow[]>(praWamHrApi.log); if (result.data) setLog(result.data); }
    catch (problem) { if (!closedMeanwhile(problem)) setMessage(errorMessage(problem)); }
  }

  async function open(person: HrPersonRow) {
    if (busy) return;
    setSelected(person.id); setDetail(null); setBusy("person"); setMessage("");
    try {
      const result = await adminRequest<HrPersonDetail>(praWamHrApi.person(person.id));
      if (result.data) setDetail(result.data);
      void refreshLog();
    } catch (problem) { if (!closedMeanwhile(problem)) setMessage(errorMessage(problem)); }
    finally { setBusy(null); }
  }

  async function lockNow() {
    if (busy) return;
    setBusy("lock"); setMessage(""); setDetail(null);
    try { await adminRequest<null>(praWamHrApi.lock, { method: "POST" }); router.refresh(); }
    catch (problem) { setMessage(errorMessage(problem)); setBusy(null); }
  }

  async function reloadLog() {
    if (busy) return;
    setBusy("log");
    await refreshLog();
    setBusy(null);
  }

  return <div className="stack">
    <div className={`${hr.unlockedBar} ${minutes < 5 ? hr.unlockedSoon : ""}`} role="status">
      <Unlock size={20} aria-hidden="true" />
      <p>{over ? "Mengunci…" : minutes < 1 ? "Terkunci lagi dalam kurang dari 1 menit" : `Terkunci lagi dalam ${minutes} menit`}</p>
      <Button type="button" variant="secondary" disabled={busy === "lock"} onClick={() => void lockNow()}><Lock size={17} aria-hidden="true" /> {busy === "lock" ? "Mengunci…" : "Kunci sekarang"}</Button>
    </div>
    {message && <Notice tone="error">{message}</Notice>}

    <div className={hr.layout}>
      <section className={hr.panel} aria-labelledby="hr-people">
        <h2 id="hr-people">Orang</h2>
        <p className={hr.logMeta}>{data.people.length} orang menjawab pertanyaan HR ({data.questions} pertanyaan berlevel HR atau Rahasia).</p>
        <label className="sr-only" htmlFor="hr-search">Cari nama atau departemen</label>
        <span className={hr.searchRow}>
          <Search size={18} aria-hidden="true" />
          <input id="hr-search" className="input" type="search" placeholder="Cari nama atau departemen" value={query} onChange={event => setQuery(event.target.value)} autoComplete="off" />
        </span>
        {people.length ? <ul className={hr.people}>
          {people.map(person => <li key={person.id}>
            <button type="button" className={hr.person} aria-current={selected === person.id} onClick={() => void open(person)}>
              <span className={hr.personName}><strong>{person.name}</strong><small>{person.department || "Tanpa departemen"}</small></span>
              <span className={hr.count} aria-label={`${person.answered} jawaban HR`}>{person.answered}</span>
            </button>
          </li>)}
        </ul> : <p className={hr.lead}>{data.people.length ? "Tidak ada yang cocok dengan pencarian." : "Belum ada yang menjawab pertanyaan HR."}</p>}
      </section>

      <section className={hr.panel} aria-labelledby="hr-detail" aria-busy={busy === "person"}>
        {!selected ? <>
          <h2 id="hr-detail">Jawaban per orang</h2>
          <p className={hr.lead}>Pilih nama di daftar untuk membuka jawabannya. Setiap orang yang dibuka tercatat di log akses.</p>
        </> : busy === "person" ? <>
          <h2 id="hr-detail">Memuat jawaban…</h2>
        </> : shown ? <>
          <div>
            <h2 id="hr-detail">{shown.person.name}</h2>
            <p className={hr.logMeta}>{shown.person.department || "Tanpa departemen"}</p>
          </div>
          {shown.sections.length ? shown.sections.map(section => <div key={section.id} className={hr.section}>
            <h3>{section.title}</h3>
            <dl className={hr.answers}>
              {section.answers.map(answer => <div key={answer.key} className={hr.answer}>
                <dt>{answer.prompt}{answer.visibility === "hronly" && <span className={hr.secret}><LockKeyhole size={11} aria-hidden="true" /> Rahasia</span>}{answer.hidden && " (pertanyaan disembunyikan)"}</dt>
                <dd>{answer.lines.length > 1 ? answer.lines.map(line => <span key={line} style={{ display: "block" }}>{line}</span>) : answer.lines[0]}</dd>
              </div>)}
            </dl>
          </div>) : <p className={hr.lead}>Orang ini belum menjawab pertanyaan HR.</p>}
        </> : <h2 id="hr-detail">Jawaban belum terbuka</h2>}
      </section>
    </div>

    <section className={hr.panel} aria-labelledby="hr-log">
      <div className={hr.settingsHead}>
        <h2 id="hr-log" style={{ flex: 1 }}>Log akses</h2>
        <Button type="button" variant="quiet" disabled={!!busy} onClick={() => void reloadLog()}><RefreshCw size={16} aria-hidden="true" /> {busy === "log" ? "Memuat…" : "Muat ulang"}</Button>
      </div>
      <p className={hr.logMeta}>50 catatan terakhir, terbaru di atas. Waktu dalam WIB.</p>
      {log.length ? <ul className={hr.log}>
        {log.map(row => {
          const { icon: Icon, text } = actions[row.action] ?? actions.lihat;
          return <li key={row.id} className={hr.logItem}>
            <span className={`${hr.logIcon} ${hr[`log_${row.action}`] ?? ""}`} aria-hidden="true"><Icon size={16} /></span>
            <span className={hr.logText}>
              <p><strong>{text(row.subject)}</strong></p>
              <p className={hr.logMeta}>{when(row.createdAt)} · {row.ip ?? "IP tidak tercatat"} · {device(row.userAgent)}</p>
            </span>
          </li>;
        })}
      </ul> : <p className={hr.lead}>Belum ada catatan.</p>}
    </section>
  </div>;
}
