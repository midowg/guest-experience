"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Circle, Eye, EyeOff } from "lucide-react";
import { useForgot, useNewPassword, useSignIn } from "@/components/booking/BookingAuth";
import { RESET_NOTE_MAX } from "@/lib/pra-wam/reset-requests";
import { instantLabel, zoneOfTimeZone } from "@/lib/pra-wam/zone";
import { minuteOfDay } from "@/lib/hr/history";
import { hrPath } from "@/lib/routes";
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
function useDeviceNow(): { label: string; minute: number } | null {
  const now = useSyncExternalStore(subscribeMinute, () => {
    const zone = zoneOfTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const iso = new Date().toISOString();
    return `${instantLabel(iso, zone)} ${zone}|${minuteOfDay(iso, zone)}`;
  }, () => null);
  if (!now) return null;
  const [label, minute] = now.split("|");
  return { label, minute: Number(minute) };
}

/** The page: blue with the name, the line and the day line; the sheet below with the form. */
function AuthShell({ title, lead, children }: { title: ReactNode; lead: ReactNode; children: ReactNode }) {
  const now = useDeviceNow();
  return <div className={styles.page}>
    <header className={styles.top}>
      <p className={styles.brand}><span className={styles.brandMark}><WgMark size={30} head="var(--hr-on-brand)" aria-hidden /></span>WG People</p>
      <div className={styles.pitch}>
        <p className={styles.headline}>{title}</p>
        <p className={styles.pitchLead}>{lead}</p>
      </div>
      <div className={styles.today}>
        <DayLine tone="brand" now={now?.minute ?? null} labels />
        <p className={styles.nowLabel} aria-live="off">{now ? <>Sekarang <strong>{now.label}</strong></> : " "}</p>
      </div>
    </header>
    <main className={styles.sheet}>
      <div className={styles.sheetInner}>{children}</div>
      <p className={styles.foot}>Werkudara Group</p>
    </main>
    <SplashCover />
  </div>;
}

function Secret({ id, label, value, onChange, autoComplete, error }: { id: string; label: string; value: string; onChange(value: string): void; autoComplete: string; error?: string }) {
  const [show, setShow] = useState(false);
  return <div className={styles.field}>
    <label htmlFor={id}>{label}</label>
    <div className={styles.secret}>
      <input id={id} type={show ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={event => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
      <button type="button" className={styles.eye} onClick={() => setShow(!show)} aria-pressed={show} aria-label={show ? `Sembunyikan ${label.toLowerCase()}` : `Lihat ${label.toLowerCase()}`}>{show ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}</button>
    </div>
    {error && <p id={`${id}-error`} className={styles.fieldError}>{error}</p>}
  </div>;
}

const Problem = ({ text }: { text: string }) => <p className={styles.problem} role="alert"><AlertTriangle size={18} aria-hidden /><span>{text}</span></p>;

/** Masuk. */
export function HrLogin({ next }: { next: string | null }) {
  const { email, setEmail, password, setPassword, busy, error, submit } = useSignIn(next, paths, expectSplash);
  return <AuthShell title={<>Hari kerja dimulai di sini.</>} lead="Absen masuk dan pulang cukup dengan wajahmu, dari HP sendiri.">
    <h1 className={styles.title}>Masuk</h1>
    <p className={styles.lead}>Pakai email kantor dan password akun karyawanmu, sama dengan WAM.</p>
    <form className={styles.form} onSubmit={submit} noValidate>
      {error && <Problem text={error} />}
      <div className={styles.field}>
        <label htmlFor="email">Email kantor</label>
        <input id="email" type="email" autoComplete="username" inputMode="email" placeholder="nama@werkudara.com" value={email} onChange={event => setEmail(event.target.value)} required />
      </div>
      <Secret id="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
      <button type="submit" className={styles.action} disabled={busy || !email || !password}>{busy ? "Memeriksa…" : "Masuk"}</button>
      <Link href={hrPath.forgot} className={styles.link}>Lupa password?</Link>
    </form>
  </AuthShell>;
}

/** Lupa password: a request to the admin; the same answer for every email. */
export function HrForgot() {
  const { email, setEmail, note, setNote, busy, error, done, submit } = useForgot();
  if (done) return <AuthShell title="Permintaan terkirim." lead="Admin akan mengatur ulang password-mu ke password awal.">
    <h1 className={styles.title}>Tinggal tunggu admin</h1>
    <p className={styles.ok} role="status"><CheckCircle2 size={20} aria-hidden /><span>Bila email ini terdaftar, password-mu diatur ulang ke password awal. Setelah itu masuk dengan password awal, lalu buat password baru.</span></p>
    <Link href={hrPath.login()} className={styles.action}><ArrowLeft size={18} aria-hidden /> Kembali ke Masuk</Link>
  </AuthShell>;
  return <AuthShell title="Lupa password? Tenang." lead="Kirim permintaan ke admin; password-mu diatur ulang ke password awal.">
    <h1 className={styles.title}>Lupa password</h1>
    <form className={styles.form} onSubmit={submit} noValidate>
      {error && <Problem text={error.text} />}
      <div className={styles.field}>
        <label htmlFor="forgot-email">Email kantor</label>
        <input id="forgot-email" type="email" autoComplete="username" inputMode="email" placeholder="nama@werkudara.com" value={email} onChange={event => setEmail(event.target.value)} required aria-invalid={Boolean(error?.email)} aria-describedby={error?.email ? "forgot-email-error" : undefined} />
        {error?.email && <p id="forgot-email-error" className={styles.fieldError}>{error.email}</p>}
      </div>
      <div className={styles.field}>
        <label htmlFor="forgot-note">Catatan untuk admin <span className={styles.optional}>(boleh kosong)</span></label>
        <textarea id="forgot-note" maxLength={RESET_NOTE_MAX} value={note} onChange={event => setNote(event.target.value)} />
      </div>
      <button type="submit" className={styles.action} disabled={busy || !email}>{busy ? "Mengirim…" : "Kirim permintaan"}</button>
      <Link href={hrPath.login()} className={styles.link}><ArrowLeft size={16} aria-hidden /> Kembali ke Masuk</Link>
    </form>
  </AuthShell>;
}

/** Right after signing in with the first password: a new one, or later. */
export function HrNewPassword({ next }: { next: string }) {
  const { form, set, busy, error, fields, rules, ready, submit } = useNewPassword(next, expectSplash);
  return <AuthShell title="Satu langkah lagi." lead="Ganti password awal dengan password milikmu sendiri.">
    <h1 className={styles.title}>Buat password baru</h1>
    <form className={styles.form} onSubmit={submit} noValidate>
      {error && <Problem text={error} />}
      <Secret id="current" label="Password awal" value={form.current} onChange={set("current")} autoComplete="current-password" error={fields.current} />
      <Secret id="next" label="Password baru" value={form.next} onChange={set("next")} autoComplete="new-password" error={fields.next} />
      <Secret id="confirm" label="Ulangi password baru" value={form.confirm} onChange={set("confirm")} autoComplete="new-password" error={fields.confirm} />
      <ul className={styles.rules} aria-label="Syarat password">{rules.map(rule => <li key={rule.id} data-ok={rule.ok || undefined}>
        {rule.ok ? <Check size={16} aria-hidden /> : <Circle size={16} aria-hidden />}{rule.label}<span className={styles.srOnly}>{rule.ok ? " (terpenuhi)" : " (belum)"}</span>
      </li>)}</ul>
      <button type="submit" className={styles.action} disabled={busy || !ready}>{busy ? "Menyimpan…" : "Simpan password"}</button>
      <Link href={next} className={styles.link} onClick={expectSplash}>Lewati, atur nanti</Link>
    </form>
  </AuthShell>;
}
