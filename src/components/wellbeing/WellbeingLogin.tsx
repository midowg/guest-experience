"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Check, CircleAlert, CircleCheck, Circle, Eye, EyeOff, KeyRound } from "lucide-react";
import { errorText as wamErrorText, PraWamApiError, praWamRequest } from "@/components/pra-wam/api";
import { passwordRules } from "@/lib/pra-wam/password";
import { RESET_NOTE_MAX } from "@/lib/pra-wam/reset-requests";
import { praWamApi, WELLBEING_PATH, wellbeingPath } from "@/lib/routes";
import { ThemeBoot, useTheme, type ThemeChoice } from "./context";
import { fontVars } from "./font";
import { cx } from "./parts";
import { WLM_FULL_NAME, WLM_NAME, WlmWordmark } from "./Wordmark";
import css from "./wellbeing.module.css";

/*
 * Masuk (17 Nov 2026): Wellbeing's own sign-in, with the WAM account (email or nama panggilan,
 * one password for WAM, Booking Kantor and Wellbeing) through the same WAM APIs as Booking.
 * "Lupa password?" sends the same reset request to the admin WAM, here on the page; after the
 * first password, the person may pick a new one (or skip), as in Booking.
 */

type View = "login" | "forgot" | "forgot-sent" | "new-password";

/** On a phone the keyboard would jump up at once; focus the first field only with a mouse or trackpad. */
const focusIfDesk = (element: HTMLElement | null) => { if (window.matchMedia?.("(pointer: fine)").matches) element?.focus(); };

/** Only a Wellbeing address may be the way back. */
const safeNext = (next: string | null) => next && next.startsWith(WELLBEING_PATH) && !next.startsWith("//") ? next : wellbeingPath.home;

/**
 * WLM, Journey's own sign-in (18 Nov 2026, second take): only the name WLM, big, in the colours of the
 * five dimensions; the page follows the app's theme (Otomatis / Terang / Gelap, the same choice as in
 * Profil), and says plainly how to get in: the WAM account. No mark, no slogan.
 *
 * Motion, played once on the sign-in (about 1.5 s) and never with reduced motion: the letters rise one
 * by one, the colours flow across them once and settle, "Werkudara Life Mode" draws in from wide to
 * tight, a line in the five colours grows from the centre, then the card rises.
 */
// The name and its wordmark live in Wordmark.tsx (the splash draws them too).
export { WLM_FULL_NAME, WLM_NAME, WlmWordmark } from "./Wordmark";

/** The phone's status bar in the page's colour (it follows the theme, and the system's on Otomatis). */
function useStatusBar(theme: ThemeChoice) {
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const paint = () => {
      const dark = theme === "dark" || (theme === "system" && !!media?.matches);
      let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (!meta) { meta = document.createElement("meta"); meta.name = "theme-color"; document.head.appendChild(meta); }
      meta.content = dark ? "#0A0E15" : "#F3F4F6";
    };
    paint();
    if (theme !== "system" || !media?.addEventListener) return;
    media.addEventListener("change", paint);
    return () => media.removeEventListener("change", paint);
  }, [theme]);
}

/* The words that run behind the name: the five dimensions, and what people do for them. */
const RUN_DIMENSIONS = "Fisik · Emosional · Sosial · Finansial · Spiritual · ";
const RUN_ACTIVITIES = "Lari · Yoga · Meditasi · Menabung · Berbagi · Bersepeda · Renang · ";

/**
 * Behind everything (decoration, hidden from screen readers): an aurora of the five dimension colours
 * drifting slowly, a fine grain, and on the sign-in two rows of big outlined words running opposite ways
 * behind the name, like a sports poster. All of it still with reduced motion.
 */
function Backdrop({ hero }: { hero: boolean }) {
  return <div className={css.wlmBackdrop} aria-hidden="true">
    {[1, 2, 3, 4].map(n => <i key={n} className={css.wlmBlob} data-n={n} />)}
    {hero && <div className={css.wlmRun}>
      {[RUN_DIMENSIONS, RUN_ACTIVITIES].map((words, row) => <div key={row} className={css.wlmRunRow} data-row={row}>
        {/* The words twice, so the row loops without a gap. */}
        <span>{words.repeat(2)}</span><span>{words.repeat(2)}</span>
      </div>)}
    </div>}
  </div>;
}

function Frame({ title, lead, hero = false, children, foot }: { title: string; lead?: string; hero?: boolean; children: ReactNode; foot?: ReactNode }) {
  const [theme] = useTheme();
  useStatusBar(theme);
  return <div className={cx(css.tokens, css.login, fontVars)} data-theme={theme === "system" ? undefined : theme} suppressHydrationWarning>
    <ThemeBoot />
    <Backdrop hero={hero} />
    <main className={css.loginColumn}>
      {hero ? <header className={css.wlmHero}>
        <h1 className={css.wlmTitle} aria-label={`${WLM_NAME}, ${WLM_FULL_NAME}. ${title}`}><WlmWordmark animated /></h1>
        <p className={css.wlmName} aria-hidden="true">{WLM_FULL_NAME}</p>
        <span className={css.wlmLine} aria-hidden="true"><i /><i /><i /><i /><i /></span>
        {lead && <p className={css.wlmLead}>{lead}</p>}
      </header> : <>
        <WlmWordmark className={css.wlmSmall} />
        <h1 className={css.title} style={{ marginTop: 16 }}>{title}</h1>
        {lead && <p className={css.muted} style={{ marginTop: 4 }}>{lead}</p>}
      </>}
      {hero ? <div className={css.loginCard}>{children}</div> : children}
      <p className={cx(css.loginFoot, css.caption, css.faint)}>{foot ?? <>Program wellbeing Werkudara</>}</p>
    </main>
  </div>;
}

/** Said above the form; it shakes a little when it (re)appears, so a wrong password is noticed. */
const Problem = ({ text }: { text: string }) => <div className={cx(css.note, css.noteErr, css.loginProblem)} role="alert"><CircleAlert size={20} aria-hidden="true" /><span>{text}</span></div>;

/** How to get in, said quietly at the top of the card (not a highlight): the WAM account. */
function WamNote() {
  return <p className={css.wamNote}><KeyRound size={15} aria-hidden="true" />Masuk dengan akun WAM</p>;
}

function Secret({ id, label, value, onChange, autoComplete, error, placeholder }: { id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: string; error?: string; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return <div className={css.field}>
    <label className={css.fieldLabel} htmlFor={id}>{label}</label>
    <div className={css.inputWrap}>
      <input id={id} className={css.input} type={show ? "text" : "password"} autoComplete={autoComplete} placeholder={placeholder} value={value}
        onChange={event => onChange(event.target.value)} aria-invalid={!!error} style={{ paddingRight: 52 }} />
      <button type="button" className={css.pwToggle} onClick={() => setShow(!show)} aria-pressed={show} aria-label={show ? `Sembunyikan ${label.toLowerCase()}` : `Tampilkan ${label.toLowerCase()}`}>
        {show ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
      </button>
    </div>
    {error && <span className={css.errText}><CircleAlert size={14} aria-hidden="true" />{error}</span>}
  </div>;
}

export function WellbeingLogin({ next }: { next: string | null }) {
  const router = useRouter();
  const [view, setView] = useState<View>("login");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Each try replays the note's shake, also when the same message comes again.
  const [tries, setTries] = useState(0);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { if (view === "login") focusIfDesk(first.current); }, [view]);
  // Lupa password and Buat password baru have their own history entry: Back returns to Masuk.
  useEffect(() => {
    const onPop = () => { if (!window.history.state?.wbLogin) setView("login"); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const openView = (target: Exclude<View, "login">) => {
    if (window.history.state?.wbLogin) window.history.replaceState({ ...window.history.state, wbLogin: target }, "");
    else window.history.pushState({ ...window.history.state, wbLogin: target }, "");
    setView(target);
  };
  const backToLogin = () => { setError(null); if (window.history.state?.wbLogin) window.history.back(); else setView("login"); };
  const goNext = () => { router.refresh(); router.replace(safeNext(next)); };

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setTries(count => count + 1);
    if (!user.trim() || !password) { setError("Isi email atau nama panggilan, dan password."); return; }
    setBusy(true); setError(null);
    try {
      const result = await praWamRequest<{ askNewPassword: boolean }>(praWamApi.login, { method: "POST", json: { email: user.trim(), password } });
      if (result.data?.askNewPassword) { setBusy(false); openView("new-password"); return; }
      goNext();
    } catch (problem) { setError(wamErrorText(problem)); setBusy(false); }
  }

  if (view === "forgot" || view === "forgot-sent") return <Forgot initial={user} sent={view === "forgot-sent"} onSent={() => openView("forgot-sent")} onBack={backToLogin} />;
  if (view === "new-password") return <NewPassword current={password} onDone={goNext} />;

  return <Frame hero title="Masuk">
    <WamNote />
    <form className={css.loginForm} onSubmit={signIn} noValidate>
      {error && <Problem key={tries} text={error} />}
      <div className={css.field}>
        <label className={css.fieldLabel} htmlFor="wb-user">Email atau nama panggilan</label>
        <input ref={first} id="wb-user" className={css.input} name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="mis. dewi"
          value={user} onChange={event => setUser(event.target.value)} />
      </div>
      <Secret id="wb-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" placeholder="Password" />
      <button type="submit" className={cx(css.btn, css.btnPrimary, css.block)} aria-busy={busy}>{busy ? <><span className={css.spin} aria-hidden="true" />Masuk…</> : "Masuk"}</button>
      <div className={css.center} style={{ marginTop: 8 }}><button type="button" className={css.link} onClick={() => { setError(null); openView("forgot"); }}>Lupa password?</button></div>
    </form>
  </Frame>;
}

/** Lupa password: a request to the admin WAM to reset to the first password (the same answer for every account). */
function Forgot({ initial, sent, onSent, onBack }: { initial: string; sent: boolean; onSent: () => void; onBack: () => void }) {
  const [user, setUser] = useState(initial);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [answer, setAnswer] = useState("");
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { focusIfDesk(first.current); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user.trim()) { setError({ text: "", field: "Isi email kantor atau nama panggilan." }); return; }
    setBusy(true); setError(null);
    try {
      const result = await praWamRequest<{ sent: boolean }>(praWamApi.forgot, { method: "POST", json: { email: user.trim(), note } });
      setAnswer(result.message); onSent();
    } catch (problem) { setError({ text: wamErrorText(problem), field: problem instanceof PraWamApiError ? problem.fieldErrors?.email?.[0] : undefined }); }
    finally { setBusy(false); }
  }

  const back = <button type="button" className={cx(css.btn, css.btnText, css.block)} style={{ marginTop: 8 }} onClick={onBack}><ArrowLeft size={18} aria-hidden="true" />Kembali ke Masuk</button>;
  if (sent) return <Frame title="Permintaan terkirim">
    <div className={cx(css.note, css.noteOk)} role="status" style={{ marginTop: 28 }}><CircleCheck size={20} aria-hidden="true" />
      <span>{answer || "Permintaan tercatat. Bila akun ini terdaftar, admin WAM akan mengatur ulang password-mu ke password awal."}</span></div>
    <p className={css.muted} style={{ marginTop: 16 }}>Setelah direset, masuk dengan password awal lalu buat password baru.</p>
    {back}
  </Frame>;
  return <Frame title="Lupa password" lead="Kirim permintaan ke admin WAM. Password-mu akan diatur ulang ke password awal.">
    <form className={css.loginForm} onSubmit={submit} noValidate>
      {/* Said once: on the field when it is about the field, else above the form. */}
      {error?.text && error.text !== error.field && <Problem text={error.text} />}
      <div className={css.field}>
        <label className={css.fieldLabel} htmlFor="wb-forgot-user">Email kantor atau nama panggilan</label>
        <input ref={first} id="wb-forgot-user" className={css.input} autoComplete="username" autoCapitalize="none" spellCheck={false} value={user}
          onChange={event => setUser(event.target.value)} aria-invalid={!!error?.field} />
        {error?.field && <span className={css.errText}><CircleAlert size={14} aria-hidden="true" />{error.field}</span>}
      </div>
      <div className={css.field}>
        <label className={css.fieldLabel} htmlFor="wb-forgot-note">Catatan untuk admin <span className={css.faint}>(boleh kosong)</span></label>
        <textarea id="wb-forgot-note" className={css.input} maxLength={RESET_NOTE_MAX} value={note} onChange={event => setNote(event.target.value)} />
      </div>
      <button type="submit" className={cx(css.btn, css.btnPrimary, css.block)} aria-busy={busy}>{busy ? <><span className={css.spin} aria-hidden="true" />Mengirim…</> : "Kirim permintaan"}</button>
      {back}
    </form>
  </Frame>;
}

/** Right after the first password: a new one (the rules ticked as they type), or skip for now. */
function NewPassword({ current, onDone }: { current: string; onDone: () => void }) {
  const [form, setForm] = useState({ next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const rules = [
    ...passwordRules.map(rule => ({ id: rule.id, label: rule.label, ok: rule.test(form.next) })),
    { id: "differs", label: "Berbeda dari password awal", ok: form.next.length > 0 && form.next !== current },
    { id: "same", label: "Diulang sama persis", ok: form.confirm.length > 0 && form.confirm === form.next },
  ];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (rules.some(rule => !rule.ok)) { setError("Password baru belum memenuhi semua syarat di bawah."); return; }
    setBusy(true); setError(null); setFields({});
    try { await praWamRequest(praWamApi.password, { method: "POST", json: { current, next: form.next, confirm: form.confirm } }); onDone(); }
    catch (problem) {
      if (problem instanceof PraWamApiError && problem.fieldErrors) setFields(Object.fromEntries(Object.entries(problem.fieldErrors).map(([key, list]) => [key, list[0]])));
      setError(wamErrorText(problem)); setBusy(false);
    }
  }

  return <Frame title="Buat password baru" lead="Kamu masuk dengan password awal. Sebaiknya ganti sekarang.">
    <form className={css.loginForm} onSubmit={submit} noValidate>
      {error && <Problem text={error} />}
      <Secret id="wb-next" label="Password baru" value={form.next} onChange={value => setForm({ ...form, next: value })} autoComplete="new-password" error={fields.next} />
      <Secret id="wb-confirm" label="Ulangi password baru" value={form.confirm} onChange={value => setForm({ ...form, confirm: value })} autoComplete="new-password" error={fields.confirm} />
      <ul className={css.rules} aria-label="Syarat password">{rules.map(rule => <li key={rule.id} data-ok={rule.ok}>
        {rule.ok ? <Check size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}{rule.label}<span className="sr-only">{rule.ok ? " (terpenuhi)" : " (belum)"}</span>
      </li>)}</ul>
      <button type="submit" className={cx(css.btn, css.btnPrimary, css.block)} aria-busy={busy}>{busy ? <><span className={css.spin} aria-hidden="true" />Menyimpan…</> : "Simpan password"}</button>
      <button type="button" className={cx(css.btn, css.btnText, css.block)} style={{ marginTop: 8 }} onClick={onDone}>Lewati, atur nanti</button>
    </form>
  </Frame>;
}
