"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleAlert, Coffee, Eye, EyeOff, LogOut, ShieldAlert, Smartphone } from "lucide-react";
import { useSignIn } from "@/components/booking/BookingAuth";
import { coffeePath } from "@/lib/routes";
import { CoffeeApiError, coffeePush, endSession } from "../api";
import { dropPush, forgetLocalPush, type PushPort } from "../usePush";
import css from "./ga.module.css";

/*
 * The tablet's own sign-in (/coffee/ga/masuk, 26 Nov 2026). GA and the daily workers already have
 * a Journey employee account, so this is that account and that session (the hooks and APIs of
 * BookingAuth, exactly as /coffee/masuk uses them): only the page is the tablet's, and it leads
 * straight to Mode GA. Landscape tablet first (two panes, so the form stays above an on-screen
 * keyboard), one column when the tablet stands upright or on a phone. Every control is 48 px or more.
 */

/** After signing in: Mode GA; with the first password: "Buat password baru", which leads on to Mode GA as well. */
const paths = { home: coffeePath.ga, newPassword: coffeePath.newPassword };

function Shell({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <div className={`${css.ga} ${css.signPage}`}>
      <main className={css.signCard}>
        <section className={css.signIntro}>
          <p className={css.brand}><Coffee aria-hidden size={22} />WG Coffee<span className={css.signSub}>Tablet GA</span></p>
          <h1>{title}</h1>
          <p className={css.signLead}>{lead}</p>
        </section>
        <section className={css.signBody}>{children}</section>
      </main>
    </div>
  );
}

/**
 * Masuk · Mode GA. `next`: where to go afterwards (Mode GA only; the page checked it). `forget`:
 * nobody is signed in on this browser, so a push subscription that is still there belongs to
 * whoever was signed in before and is let go of, as on the employee sign-in (audit F5-07).
 */
export function GaLogin({ next, forget = false }: { next: string | null; forget?: boolean }) {
  useEffect(() => { if (forget) void forgetLocalPush(); }, [forget]);
  // Always a way back: without one the first-password page would lead to the employee app.
  const { email, setEmail, password, setPassword, busy, error, submit } = useSignIn(next ?? coffeePath.ga, paths);
  const [show, setShow] = useState(false);
  return (
    <Shell title="Masuk · Mode GA" lead="Pakai email kantor dan password akun karyawan Journey milikmu. Setelah masuk, tablet langsung membuka pesanan rapat.">
      <form className={css.signForm} onSubmit={submit} noValidate>
        {error && <p className={css.problem} role="alert"><CircleAlert aria-hidden size={18} /><span>{error}</span></p>}
        <label className={css.label} htmlFor="ga-email">Email kantor</label>
        <input id="ga-email" className={css.input} type="email" autoComplete="username" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next"
          placeholder="nama@werkudara.com" value={email} onChange={event => setEmail(event.target.value)} required />
        <label className={css.label} htmlFor="ga-password">Password</label>
        <span className={css.signSecret}>
          <input id="ga-password" className={css.input} type={show ? "text" : "password"} autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="go"
            value={password} onChange={event => setPassword(event.target.value)} required />
          <button type="button" className={css.iconButton} aria-pressed={show} aria-label={show ? "Sembunyikan password" : "Lihat password"} onClick={() => setShow(!show)}>{show ? <EyeOff aria-hidden size={22} /> : <Eye aria-hidden size={22} />}</button>
        </span>
        <button type="submit" className={`${css.primary} ${css.big}`} disabled={busy || !email || !password}>{busy ? "Memeriksa…" : "Masuk"}</button>
        <div className={css.signLinks}>
          <Link href={coffeePath.gaForgot} className={css.ghost}>Lupa password?</Link>
          <a href={coffeePath.home} className={css.ghost}><Smartphone aria-hidden size={18} />Aplikasi karyawan</a>
        </div>
      </form>
    </Shell>
  );
}

/**
 * Signed in, but the account may not use Mode GA: the page says so, plainly, instead of bouncing
 * to the employee app. The way on is to sign out here (this device's notifications are let go of
 * first, as everywhere) and sign in with another account, or to open the employee app.
 * `signOut` and `push` are the real ones unless the preview or a test passes its own.
 */
export function GaDenied({ name, signOut = () => endSession(coffeePath.gaLogin()), push = coffeePush }: { name: string; signOut?: () => Promise<void>; push?: PushPort | null }) {
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(false);
  const [error, setError] = useState("");
  const leave = async () => {
    if (busy) return;
    setBusy(true); setError("");
    await dropPush(push);
    try { await signOut(); }
    catch (failure) {
      setBusy(false);
      setError(failure instanceof CoffeeApiError ? failure.message : "Belum bisa keluar. Periksa jaringan lalu coba lagi.");
      return;
    }
    // The sign-in page is on its way: the name does not stay on the screen meanwhile.
    setLeft(true);
  };
  return (
    <Shell title="Belum ada akses Mode GA" lead={left ? "Kamu sudah keluar. Membuka halaman masuk tablet…" : `Kamu masuk sebagai ${name}.`}>
      <div className={css.signForm}>
        <p className={css.signDenied} role="status"><ShieldAlert aria-hidden size={22} /><span>Akun ini belum punya akses Mode GA. Minta pengelola WG Coffee.</span></p>
        {error && <p className={css.problem} role="alert"><CircleAlert aria-hidden size={18} /><span>{error}</span></p>}
        {left
          ? <a className={`${css.primary} ${css.big}`} href={coffeePath.gaLogin()}>Masuk dengan akun lain</a>
          : <button type="button" className={`${css.primary} ${css.big}`} aria-disabled={busy || undefined} onClick={() => void leave()}><LogOut aria-hidden size={20} />{busy ? "Keluar…" : "Keluar dan masuk dengan akun lain"}</button>}
        <a href={coffeePath.home} className={css.secondary}><Smartphone aria-hidden size={18} />Buka aplikasi karyawan</a>
      </div>
    </Shell>
  );
}
