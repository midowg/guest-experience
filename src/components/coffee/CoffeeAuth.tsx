"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowLeft, Check, CheckCircle2, ChevronLeft, Circle, CircleAlert, Coffee, Eye, EyeOff, RefreshCw } from "lucide-react";
import { useForgot, useNewPassword, useSignIn } from "@/components/booking/BookingAuth";
import { RESET_NOTE_MAX } from "@/lib/pra-wam/reset-requests";
import { coffeePath } from "@/lib/routes";
import css from "./coffee.module.css";

/*
 * Werkudara Coffee's own sign-in, Lupa password and first new password, in the look of the
 * approved prototype (welcome, then Masuk). The account and the APIs are the employee account's
 * (the hooks of BookingAuth, as WG People uses them): one email, one password, one session.
 */

const paths = { home: coffeePath.home, newPassword: coffeePath.newPassword };
/** Set on this device after a first sign-in: the welcome is not shown again. */
const KNOWN_KEY = "coffee:kenal";
const noChange = () => () => undefined;
const knownNow = () => { try { return window.localStorage.getItem(KNOWN_KEY) === "1"; } catch { return false; } };
const remember = () => { try { window.localStorage.setItem(KNOWN_KEY, "1"); } catch { /* private mode: the welcome simply shows again */ } };

function Page({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => { document.title = `${title} · Werkudara Coffee`; }, [title]);
  return <div className={css.column}><main className={css.activation}>{children}</main></div>;
}

function Problem({ text }: { text: string }) {
  return <p className={css.problem} role="alert"><CircleAlert size={18} aria-hidden /><span>{text}</span></p>;
}

function Secret({ id, label, value, onChange, autoComplete, error }: { id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: string; error?: string }) {
  const [show, setShow] = useState(false);
  return <>
    <label className={css.label} htmlFor={id}>{label}</label>
    <span className={css.secret}>
      <input id={id} className={css.input} type={show ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={event => onChange(event.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-galat` : undefined} />
      <button type="button" className={css.iconButton} aria-pressed={show} aria-label={show ? `Sembunyikan ${label.toLowerCase()}` : `Lihat ${label.toLowerCase()}`} onClick={() => setShow(!show)}>{show ? <EyeOff aria-hidden size={20} /> : <Eye aria-hidden size={20} />}</button>
    </span>
    {error && <p id={`${id}-galat`} className={css.fieldError}>{error}</p>}
  </>;
}

/** Masuk: the welcome first (once per device), then email and password. `next`: where to go afterwards (an address of the app only). */
export function CoffeeLogin({ next }: { next: string | null }) {
  const { email, setEmail, password, setPassword, busy, error, submit } = useSignIn(next, paths, remember);
  const known = useSyncExternalStore(noChange, knownNow, () => false);
  const [picked, setPicked] = useState<"welcome" | "login" | null>(null);
  const step = picked ?? (known || next ? "login" : "welcome");
  // "Masuk" on the welcome and "Kembali" on the form remove the button that was pressed: the focus follows to the new step.
  const emailField = useRef<HTMLInputElement>(null), startButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (picked === "login") emailField.current?.focus();
    else if (picked === "welcome") startButton.current?.focus();
  }, [picked]);

  if (step === "welcome") return (
    <Page title="Selamat datang">
      <section className={css.welcome}>
        <span className={css.welcomeMark}><Coffee aria-hidden size={36} /></span>
        <h1>Werkudara Coffee</h1>
        <p>Klaim jatah kopi bulanan dari HP. Pengajuanmu diproses HR atau admin, kamu tinggal ambil di mesin pantry.</p>
        <ul className={css.facts}>
          <li><Check aria-hidden size={18} />Masuk dengan akun karyawan Journey</li>
          <li><Check aria-hidden size={18} />Akun yang sama dengan WG People dan Booking Kantor</li>
        </ul>
        <button ref={startButton} type="button" className={css.primary} onClick={() => setPicked("login")}>Masuk</button>
      </section>
    </Page>
  );
  return (
    <Page title="Masuk">
      <header className={css.stepbar}>
        <button type="button" className={css.iconButton} aria-label="Kembali" onClick={() => setPicked("welcome")}><ChevronLeft aria-hidden size={24} /></button>
      </header>
      <section className={css.stepBody}>
        <h1>Masuk</h1>
        <p className={css.lead}>Pakai email kantor dan password akun karyawanmu.</p>
        <form className={css.form} onSubmit={submit} noValidate>
          {error && <Problem text={error} />}
          <label className={css.label} htmlFor="kopi-email">Email</label>
          <input ref={emailField} id="kopi-email" className={css.input} type="email" autoComplete="username" inputMode="email" placeholder="nama@werkudara.com" value={email} onChange={event => setEmail(event.target.value)} required />
          <Secret id="kopi-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
          <Link href={coffeePath.forgot} className={css.linkButton}>Lupa password?</Link>
          <button type="submit" className={css.primary} disabled={busy || !email || !password}>{busy ? "Memeriksa…" : "Masuk"}</button>
        </form>
      </section>
    </Page>
  );
}

/** Lupa password: a request to the admin to reset the account to its first password; the same answer for every email. */
export function CoffeeForgot() {
  const { email, setEmail, note, setNote, busy, error, done, submit } = useForgot();
  return (
    <Page title="Lupa password">
      <header className={css.stepbar}>
        <Link href={coffeePath.login()} className={css.iconButton} aria-label="Kembali"><ChevronLeft aria-hidden size={24} /></Link>
      </header>
      {done ? (
        <section className={css.stepBody}>
          <h1>Permintaan terkirim</h1>
          <p className={css.okBox} role="status"><CheckCircle2 size={20} aria-hidden /><span>Kalau email itu terdaftar, admin mengatur ulang password-mu ke password awal. Setelah dikabari, masuk dengan password awal lalu buat password baru.</span></p>
          <div className={css.footer}><Link href={coffeePath.login()} className={css.primary}><ArrowLeft size={18} aria-hidden />Kembali ke Masuk</Link></div>
        </section>
      ) : (
        <section className={css.stepBody}>
          <h1>Lupa password</h1>
          <p className={css.lead}>Tulis email kantormu. Admin mengatur ulang password-mu ke password awal, lalu kamu masuk dan membuat password baru.</p>
          <form className={css.form} onSubmit={submit} noValidate>
            {error && <Problem text={error.text} />}
            <label className={css.label} htmlFor="kopi-lupa-email">Email</label>
            <input id="kopi-lupa-email" className={css.input} type="email" autoComplete="username" inputMode="email" placeholder="nama@werkudara.com" value={email} onChange={event => setEmail(event.target.value)} required aria-invalid={error?.email ? true : undefined} aria-describedby={error?.email ? "kopi-lupa-email-galat" : undefined} />
            {error?.email && <p id="kopi-lupa-email-galat" className={css.fieldError}>{error.email}</p>}
            <label className={css.label} htmlFor="kopi-lupa-catatan">Catatan untuk admin <span className={css.optional}>(opsional)</span></label>
            <textarea id="kopi-lupa-catatan" className={css.input} maxLength={RESET_NOTE_MAX} value={note} onChange={event => setNote(event.target.value)} />
            <button type="submit" className={css.primary} disabled={busy || !email}>{busy ? "Mengirim…" : "Kirim permintaan"}</button>
          </form>
        </section>
      )}
    </Page>
  );
}

/** Right after signing in with the first password: a new one, or later. */
export function CoffeeNewPassword({ next }: { next: string }) {
  const { form, set, busy, error, fields, rules, ready, submit } = useNewPassword(next, remember);
  return (
    <Page title="Password baru">
      <section className={css.stepBody}>
        <h1>Buat password baru</h1>
        <p className={css.lead}>Kamu masuk dengan password awal. Ganti sekarang supaya akunmu aman.</p>
        <form className={css.form} onSubmit={submit} noValidate>
          {error && <Problem text={error} />}
          <Secret id="kopi-awal" label="Password awal" value={form.current} onChange={set("current")} autoComplete="current-password" error={fields.current} />
          <Secret id="kopi-baru" label="Password baru" value={form.next} onChange={set("next")} autoComplete="new-password" error={fields.next} />
          <Secret id="kopi-ulang" label="Ulangi password baru" value={form.confirm} onChange={set("confirm")} autoComplete="new-password" error={fields.confirm} />
          <ul className={css.rules} aria-label="Syarat password">{rules.map(rule => (
            <li key={rule.id} data-ok={rule.ok || undefined}>
              {rule.ok ? <Check size={16} aria-hidden /> : <Circle size={16} aria-hidden />}{rule.label}<span className={css.srOnly}>{rule.ok ? " (terpenuhi)" : " (belum)"}</span>
            </li>
          ))}</ul>
          <button type="submit" className={css.primary} disabled={busy || !ready}>{busy ? "Menyimpan…" : "Simpan password"}</button>
          <Link href={next} className={css.textButton}>Nanti saja</Link>
        </form>
      </section>
    </Page>
  );
}

/**
 * Before the migration ran (or the database is not set up): the app says so, plainly, instead of
 * failing. `detail` (the migration's name) is passed for the pengelola only.
 */
export function CoffeeWaiting({ detail }: { detail?: string }) {
  return (
    <div className={css.column}>
      <main className={css.waiting}>
        <span className={css.welcomeMark}><Coffee aria-hidden size={36} /></span>
        <h1>Werkudara Coffee belum dibuka</h1>
        <p className={css.lead}>Aplikasinya sedang disiapkan. Coba lagi nanti, atau tanyakan ke HR kapan mulai bisa dipakai.</p>
        {detail && <small>Rincian untuk admin: {detail}</small>}
      </main>
    </div>
  );
}

/** The app is open but could not be read just now (a database hiccup, not a missing migration): say so, with a way to try again. */
export function CoffeeTrouble({ here }: { here: string }) {
  return (
    <div className={css.column}>
      <main className={css.waiting}>
        <span className={css.welcomeMark}><Coffee aria-hidden size={36} /></span>
        <h1>Belum bisa memuat</h1>
        <p className={css.lead}>Werkudara Coffee belum bisa dibuka saat ini. Periksa jaringan, lalu coba lagi sebentar.</p>
        {/* A plain link: the page is asked for again, also when the script never arrived. */}
        <a className={css.primary} href={here}><RefreshCw aria-hidden size={18} />Coba lagi</a>
      </main>
    </div>
  );
}
