"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Circle, Eye, EyeOff } from "lucide-react";
import { useForgot, useNewPassword, useSignIn } from "@/components/booking/BookingAuth";
import { RESET_NOTE_MAX } from "@/lib/pra-wam/reset-requests";
import { zoneOfTimeZone } from "@/lib/pra-wam/zone";
import { minuteOfDay } from "@/lib/hr/history";
import { clockAt, LANGS, type Lang } from "@/lib/hr/lang";
import { hrPath } from "@/lib/routes";
import { useCopy } from "./lang";
import { expectSplash, SplashCover } from "./Splash";
import { DayLine } from "./ui";
import { WgMark } from "./WgMark";
import styles from "./auth.module.css";

/*
 * WG People's own sign-in, Lupa password and first new password (21 Nov 2026; the owner found the
 * shared card too ordinary). The same account and APIs as Booking Kantor and WAM (the hooks in
 * BookingAuth), in WG People's look: Werkudara blue on top with a short line about the app and the day line
 * with the sun at the time it is now, then the form on a white sheet. One action per screen, in
 * yellow. On a wide screen the same column sits in the middle.
 */

const paths = { home: hrPath.home, newPassword: hrPath.newPassword };

/** The time now on this device, in its own zone ("08.41", "WIB"); null on the server and before it is known. */
const subscribeMinute = (change: () => void) => { const timer = window.setInterval(change, 15_000); return () => window.clearInterval(timer); };
function useDeviceNow(lang: Lang): { label: string; minute: number } | null {
  const now = useSyncExternalStore(subscribeMinute, () => {
    const zone = zoneOfTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const iso = new Date().toISOString();
    return `${clockAt(lang, iso, zone)} ${zone}|${minuteOfDay(iso, zone)}`;
  }, () => null);
  if (!now) return null;
  const [label, minute] = now.split("|");
  return { label, minute: Number(minute) };
}

/** EN | ID at the top right: the language before signing in (the same choice as Profile → Language). */
function LangSwitch() {
  const { t, lang, setLang } = useCopy();
  return <div className={styles.lang} role="group" aria-label={t.auth.language}>
    {LANGS.map(value => <button key={value} type="button" lang={value} aria-pressed={value === lang} onClick={() => setLang(value)}
      aria-label={value === "en" ? "English" : "Bahasa Indonesia"}>{value.toUpperCase()}</button>)}
  </div>;
}

/** The page: blue with the name, the line and the day line; the sheet below with the form. */
function AuthShell({ page, title, lead, children }: { page: string; title: ReactNode; lead: ReactNode; children: ReactNode }) {
  const { t, lang } = useCopy();
  const now = useDeviceNow(lang);
  // The tab's title follows a language switched on this page (the server set it in the first one).
  useEffect(() => { document.title = `${page} · WG People`; }, [page]);
  return <div className={styles.page}>
    <header className={styles.top}>
      <div className={styles.topBar}>
        <p className={styles.brand}><span className={styles.brandMark}><WgMark size={30} head="var(--hr-on-brand)" aria-hidden /></span>WG People</p>
        <LangSwitch />
      </div>
      <div className={styles.pitch}>
        <p className={styles.headline}>{title}</p>
        <p className={styles.pitchLead}>{lead}</p>
      </div>
      <div className={styles.today}>
        <DayLine tone="brand" now={now?.minute ?? null} labels />
        <p className={styles.nowLabel} aria-live="off">{now ? <>{t.auth.now} <strong>{now.label}</strong></> : " "}</p>
      </div>
    </header>
    <main className={styles.sheet}>
      <div className={styles.sheetInner}>{children}</div>
      <p className={styles.foot}>{t.auth.foot}</p>
    </main>
    <SplashCover />
  </div>;
}

function Secret({ id, label, value, onChange, autoComplete, error }: { id: string; label: string; value: string; onChange(value: string): void; autoComplete: string; error?: string }) {
  const [show, setShow] = useState(false);
  const { t } = useCopy();
  return <div className={styles.field}>
    <label htmlFor={id}>{label}</label>
    <div className={styles.secret}>
      <input id={id} type={show ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={event => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
      <button type="button" className={styles.eye} onClick={() => setShow(!show)} aria-pressed={show} aria-label={show ? t.auth.hide(label) : t.auth.show(label)}>{show ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}</button>
    </div>
    {error && <p id={`${id}-error`} className={styles.fieldError}>{t.server(error)}</p>}
  </div>;
}

function Problem({ text }: { text: string }) {
  const { t } = useCopy();
  return <p className={styles.problem} role="alert"><AlertTriangle size={18} aria-hidden /><span>{t.server(text)}</span></p>;
}

/** Masuk. */
export function HrLogin({ next }: { next: string | null }) {
  const { email, setEmail, password, setPassword, busy, error, submit } = useSignIn(next, paths, expectSplash);
  const { t } = useCopy();
  return <AuthShell page={t.auth.login} title={t.auth.loginHeadline} lead={t.auth.loginLead}>
    <h1 className={styles.title}>{t.auth.login}</h1>
    <p className={styles.lead}>{t.auth.loginNote}</p>
    <form className={styles.form} onSubmit={submit} noValidate>
      {error && <Problem text={error} />}
      <div className={styles.field}>
        <label htmlFor="email">{t.auth.email}</label>
        <input id="email" type="email" autoComplete="username" inputMode="email" placeholder="nama@werkudara.com" value={email} onChange={event => setEmail(event.target.value)} required />
      </div>
      <Secret id="password" label={t.auth.password} value={password} onChange={setPassword} autoComplete="current-password" />
      <button type="submit" className={styles.action} disabled={busy || !email || !password}>{busy ? t.auth.checking : t.auth.login}</button>
      <Link href={hrPath.forgot} className={styles.link}>{t.auth.forgot}</Link>
    </form>
  </AuthShell>;
}

/** Lupa password: a request to the admin; the same answer for every email. */
export function HrForgot() {
  const { email, setEmail, note, setNote, busy, error, done, submit } = useForgot();
  const { t } = useCopy();
  if (done) return <AuthShell page={t.auth.forgotTitle} title={t.auth.sentHeadline} lead={t.auth.sentLead}>
    <h1 className={styles.title}>{t.auth.sentTitle}</h1>
    <p className={styles.ok} role="status"><CheckCircle2 size={20} aria-hidden /><span>{t.auth.sentBody}</span></p>
    <Link href={hrPath.login()} className={styles.action}><ArrowLeft size={18} aria-hidden /> {t.auth.backToLogin}</Link>
  </AuthShell>;
  return <AuthShell page={t.auth.forgotTitle} title={t.auth.forgotHeadline} lead={t.auth.forgotLead}>
    <h1 className={styles.title}>{t.auth.forgotTitle}</h1>
    <form className={styles.form} onSubmit={submit} noValidate>
      {error && <Problem text={error.text} />}
      <div className={styles.field}>
        <label htmlFor="forgot-email">{t.auth.email}</label>
        <input id="forgot-email" type="email" autoComplete="username" inputMode="email" placeholder="nama@werkudara.com" value={email} onChange={event => setEmail(event.target.value)} required aria-invalid={Boolean(error?.email)} aria-describedby={error?.email ? "forgot-email-error" : undefined} />
        {error?.email && <p id="forgot-email-error" className={styles.fieldError}>{t.server(error.email)}</p>}
      </div>
      <div className={styles.field}>
        <label htmlFor="forgot-note">{t.auth.noteForAdmin} <span className={styles.optional}>{t.common.optional}</span></label>
        <textarea id="forgot-note" maxLength={RESET_NOTE_MAX} value={note} onChange={event => setNote(event.target.value)} />
      </div>
      <button type="submit" className={styles.action} disabled={busy || !email}>{busy ? t.common.sending : t.auth.sendRequest}</button>
      <Link href={hrPath.login()} className={styles.link}><ArrowLeft size={16} aria-hidden /> {t.auth.backToLogin}</Link>
    </form>
  </AuthShell>;
}

/** Right after signing in with the first password: a new one, or later. */
export function HrNewPassword({ next }: { next: string }) {
  const { form, set, busy, error, fields, rules, ready, submit } = useNewPassword(next, expectSplash);
  const { t } = useCopy();
  return <AuthShell page={t.auth.newTitle} title={t.auth.newHeadline} lead={t.auth.newLead}>
    <h1 className={styles.title}>{t.auth.newTitle}</h1>
    <form className={styles.form} onSubmit={submit} noValidate>
      {error && <Problem text={error} />}
      <Secret id="current" label={t.auth.current} value={form.current} onChange={set("current")} autoComplete="current-password" error={fields.current} />
      <Secret id="next" label={t.auth.next} value={form.next} onChange={set("next")} autoComplete="new-password" error={fields.next} />
      <Secret id="confirm" label={t.auth.confirm} value={form.confirm} onChange={set("confirm")} autoComplete="new-password" error={fields.confirm} />
      <ul className={styles.rules} aria-label={t.auth.rules}>{rules.map(rule => <li key={rule.id} data-ok={rule.ok || undefined}>
        {rule.ok ? <Check size={16} aria-hidden /> : <Circle size={16} aria-hidden />}{t.auth.rule[rule.id] ?? rule.label}<span className={styles.srOnly}>{rule.ok ? t.auth.met : t.auth.unmet}</span>
      </li>)}</ul>
      <button type="submit" className={styles.action} disabled={busy || !ready}>{busy ? t.auth.saving : t.auth.save}</button>
      <Link href={next} className={styles.link} onClick={expectSplash}>{t.auth.skip}</Link>
    </form>
  </AuthShell>;
}
