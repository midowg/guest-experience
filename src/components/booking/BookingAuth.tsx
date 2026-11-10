"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, CalendarClock, Check, CheckCircle2, Circle, Eye, EyeOff } from "lucide-react";
import { errorText, PraWamApiError, praWamRequest } from "@/components/pra-wam/api";
import { passwordRules } from "@/lib/pra-wam/password";
import { RESET_NOTE_MAX } from "@/lib/pra-wam/reset-requests";
import { bookingPath, praWamApi } from "@/lib/routes";
import css from "./booking.module.css";

/*
 * Booking Kantor's own sign-in, "Lupa password" and first new password (11 Nov 2026): its own name
 * and look, nothing of WAM's. Behind them is the employee's one account (the same email and
 * password as WAM), so nobody gets a second password and the same APIs do the work.
 */

/** The card every sign-in page sits on, with the app's mark and name. */
export function AuthCard({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return <div className={css.authPage}>
    <div className={css.authCard}>
      <div className={css.authHead}>
        <span className={css.authMark}><CalendarClock size={26} aria-hidden /></span>
        <p className={css.authApp}>Booking Kantor</p>
        <h1>{title}</h1>
        {lead && <p className={css.lead}>{lead}</p>}
      </div>
      {children}
    </div>
    <p className={css.authFoot}>Werkudara Group</p>
  </div>;
}

function Secret({ id, label, value, onChange, autoComplete, error }: { id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: string; error?: string }) {
  const [show, setShow] = useState(false);
  return <div className={css.field}>
    <label className={css.label} htmlFor={id}>{label}</label>
    <div className={css.secret}>
      <input id={id} className={css.control} type={show ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={event => onChange(event.target.value)} aria-invalid={!!error} />
      <button type="button" className={css.iconBtn} onClick={() => setShow(!show)} aria-pressed={show} aria-label={show ? `Sembunyikan ${label.toLowerCase()}` : `Lihat ${label.toLowerCase()}`}>{show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}</button>
    </div>
    {error && <p className={css.error}>{error}</p>}
  </div>;
}

const Problem = ({ text }: { text: string }) => <p className={css.noteBad} role="alert"><AlertTriangle size={18} aria-hidden />{text}</p>;

/** Masuk: email and password; the first password leads on to "Buat password baru" once. */
export function BookingLogin({ next }: { next: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const result = await praWamRequest<{ askNewPassword: boolean }>(praWamApi.login, { method: "POST", json: { email, password } });
      router.refresh(); router.replace(result.data?.askNewPassword ? bookingPath.newPassword(next ?? undefined) : next ?? bookingPath.home);
    } catch (problem) { setError(errorText(problem)); setBusy(false); }
  }

  return <AuthCard title="Masuk" lead="Pakai email kantor dan password akun karyawanmu.">
    <form className={css.authForm} onSubmit={submit} noValidate>
      {error && <Problem text={error} />}
      <div className={css.field}>
        <label className={css.label} htmlFor="email">Email</label>
        <input id="email" className={css.control} type="email" autoComplete="username" inputMode="email" placeholder="nama@werkudara.com" value={email} onChange={event => setEmail(event.target.value)} required />
      </div>
      <Secret id="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
      <Link href={bookingPath.forgot} className={css.authLink}>Lupa password?</Link>
      <button type="submit" className={css.btn} disabled={busy || !email || !password}>{busy ? "Memeriksa…" : "Masuk"}</button>
    </form>
  </AuthCard>;
}

/** Lupa password: a request to reset the account to the first password; the same answer for every email. */
export function BookingForgot() {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; email?: string } | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try { await praWamRequest(praWamApi.forgot, { method: "POST", json: { email, note } }); setDone(true); }
    catch (problem) { setError({ text: errorText(problem), email: problem instanceof PraWamApiError ? problem.fieldErrors?.email?.[0] : undefined }); }
    finally { setBusy(false); }
  }

  if (done) return <AuthCard title="Permintaan terkirim">
    <p className={css.noteOk} role="status"><CheckCircle2 size={18} aria-hidden />Bila email ini terdaftar, admin akan mengatur ulang password-mu ke password awal. Setelah itu masuk dengan password awal, lalu buat password baru.</p>
    <Link href={bookingPath.login()} className={css.btnQuiet}><ArrowLeft size={18} aria-hidden />Kembali ke Masuk</Link>
  </AuthCard>;

  return <AuthCard title="Lupa password" lead="Kirim permintaan ke admin. Password-mu akan diatur ulang ke password awal.">
    <form className={css.authForm} onSubmit={submit} noValidate>
      {error && <Problem text={error.text} />}
      <div className={css.field}>
        <label className={css.label} htmlFor="forgot-email">Email kantor</label>
        <input id="forgot-email" className={css.control} type="email" autoComplete="username" inputMode="email" placeholder="nama@werkudara.com" value={email} onChange={event => setEmail(event.target.value)} required aria-invalid={!!error?.email} />
        {error?.email && <p className={css.error}>{error.email}</p>}
      </div>
      <div className={css.field}>
        <label className={css.label} htmlFor="forgot-note">Catatan untuk admin (boleh kosong)</label>
        <textarea id="forgot-note" className={css.control} maxLength={RESET_NOTE_MAX} value={note} onChange={event => setNote(event.target.value)} />
      </div>
      <button type="submit" className={css.btn} disabled={busy || !email}>{busy ? "Mengirim…" : "Kirim permintaan"}</button>
      <Link href={bookingPath.login()} className={css.authLink}><ArrowLeft size={16} aria-hidden />Kembali ke Masuk</Link>
    </form>
  </AuthCard>;
}

/** Right after signing in with the first password: a new one (the rules ticked as they type), or skip. */
export function BookingNewPassword({ next }: { next: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const set = (key: keyof typeof form) => (value: string) => setForm({ ...form, [key]: value });
  const rules = [
    ...passwordRules.map(rule => ({ id: rule.id, label: rule.label, ok: rule.test(form.next) })),
    { id: "differs", label: "Berbeda dari password awal", ok: form.next.length > 0 && form.next !== form.current },
    { id: "same", label: "Diulang sama persis", ok: form.confirm.length > 0 && form.confirm === form.next },
  ];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null); setFields({});
    try { await praWamRequest(praWamApi.password, { method: "POST", json: form }); router.refresh(); router.replace(next); }
    catch (problem) {
      if (problem instanceof PraWamApiError && problem.fieldErrors) setFields(Object.fromEntries(Object.entries(problem.fieldErrors).map(([key, list]) => [key, list[0]])));
      setError(errorText(problem)); setBusy(false);
    }
  }

  return <AuthCard title="Buat password baru" lead="Kamu masuk dengan password awal. Sebaiknya ganti sekarang.">
    <form className={css.authForm} onSubmit={submit} noValidate>
      {error && <Problem text={error} />}
      <Secret id="current" label="Password awal" value={form.current} onChange={set("current")} autoComplete="current-password" error={fields.current} />
      <Secret id="next" label="Password baru" value={form.next} onChange={set("next")} autoComplete="new-password" error={fields.next} />
      <Secret id="confirm" label="Ulangi password baru" value={form.confirm} onChange={set("confirm")} autoComplete="new-password" error={fields.confirm} />
      <ul className={css.rules} aria-label="Syarat password">{rules.map(rule => <li key={rule.id} className={rule.ok ? css.ruleOk : undefined}>
        {rule.ok ? <Check size={16} aria-hidden /> : <Circle size={16} aria-hidden />}{rule.label}<span className="sr-only">{rule.ok ? " (terpenuhi)" : " (belum)"}</span>
      </li>)}</ul>
      <button type="submit" className={css.btn} disabled={busy || rules.some(rule => !rule.ok) || !form.current}>{busy ? "Menyimpan…" : "Simpan password"}</button>
      <Link href={next} className={css.authLink}>Lewati, atur nanti</Link>
    </form>
  </AuthCard>;
}
