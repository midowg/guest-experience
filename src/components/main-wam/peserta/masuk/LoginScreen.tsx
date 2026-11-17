"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { CloudOff, Eye, EyeOff } from "lucide-react";
import { afterSignIn, ONBOARDED_KEY } from "@/lib/main-wam/peserta/onboarding";
import { hhmm } from "@/lib/main-wam/peserta/format";
import { praWamApi } from "@/lib/routes";
import { Banner, Button, Sheet, TextField, ToastProvider, useToast } from "@/components/main-wam/ui";
import { useOffline } from "../Live";
import { MwRequestError, failText, mwRequest } from "../request";
import css from "../peserta.module.css";

const LOCK_MINUTES = 10;

function onboarded(): boolean {
  try { return !!window.localStorage.getItem(ONBOARDED_KEY); } catch { return true; }
}

/**
 * Masuk (O02): WAM's own sign-in (the same account, praWamApi.login, its limits and its "Lupa
 * password?" request to the admin), drawn in Main WAM's theme. After it: the shared first password
 * goes to WAM's "Buat password baru", the first time on a phone to Izin notifikasi (O03), else
 * straight to where the person was going. What was typed stays on an error.
 */
export function LoginScreen(props: { next: string; eventName: string; preview?: Preview }) {
  return <ToastProvider><Login {...props} /></ToastProvider>;
}

type Preview = { email?: string; error?: "salah" | "terkunci" | "offline"; busy?: boolean; forgot?: boolean };

function Login({ next, eventName, preview }: { next: string; eventName: string; preview?: Preview }) {
  const router = useRouter();
  const toast = useToast();
  const offline = useOffline();
  const [email, setEmail] = useState(preview?.email ?? "");
  const [password, setPassword] = useState(preview ? "contohpassword" : "");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(!!preview?.busy);
  const [wrong, setWrong] = useState<string | null>(preview?.error === "salah" ? "Email atau password salah. Periksa lalu coba lagi." : null);
  const [problem, setProblem] = useState<{ tone: "error" | "offline"; text: string } | null>(
    preview?.error === "offline" ? { tone: "offline", text: "Tidak ada internet. Periksa sinyal, lalu coba lagi." }
      : preview?.error === "terkunci" ? { tone: "error", text: "Terlalu banyak percobaan. Coba lagi pukul 05.00." } : null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(preview?.error === "terkunci" ? Number.MAX_SAFE_INTEGER : null);
  const [forgot, setForgot] = useState(!!preview?.forgot);

  // The lock lifts by itself.
  useEffect(() => {
    if (!lockedUntil || preview) return;
    const timer = window.setTimeout(() => { setLockedUntil(null); setProblem(null); }, Math.max(0, lockedUntil - Date.now()));
    return () => window.clearTimeout(timer);
  }, [lockedUntil, preview]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || lockedUntil || preview) return;
    if (!email.trim() || !password) { setWrong(!email.trim() ? null : "Isi password."); return; }
    setBusy(true); setWrong(null); setProblem(null);
    try {
      const { data } = await mwRequest<{ askNewPassword: boolean }>(praWamApi.login, { method: "POST", json: { email: email.trim(), password } });
      const target = afterSignIn(next, { askNewPassword: !!data?.askNewPassword, onboarded: onboarded() });
      router.refresh();
      router.replace(target);
    } catch (error) {
      setBusy(false);
      if (error instanceof MwRequestError && error.offline) { setProblem({ tone: "offline", text: "Tidak ada internet. Periksa sinyal, lalu coba lagi." }); return; }
      if (error instanceof MwRequestError && error.status === 401) { setWrong(error.message); return; }
      if (error instanceof MwRequestError && error.status === 429) {
        const until = Date.now() + LOCK_MINUTES * 60_000;
        setLockedUntil(until);
        setProblem({ tone: "error", text: `Terlalu banyak percobaan. Coba lagi pukul ${hhmm(new Date(until).toISOString())}.` });
        return;
      }
      if (error instanceof MwRequestError && error.fieldErrors) { setWrong(Object.values(error.fieldErrors)[0]?.[0] ?? error.message); return; }
      setProblem({ tone: "error", text: failText(error) });
    }
  }

  const shownProblem = problem ?? (offline ? { tone: "offline" as const, text: "Tidak ada internet. Periksa sinyal, lalu coba lagi." } : null);
  const eye = <button type="button" className={css.eye} onClick={() => setShow(!show)} aria-pressed={show} aria-label={show ? "Sembunyikan password" : "Tampilkan password"}>
    {show ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
  </button>;
  return <main className={css.login}>
    <p className={css.wordmark}>{eventName}</p>
    <h1 className={css.pageTitle}>Masuk</h1>
    {shownProblem && <Banner tone={shownProblem.tone} icon={shownProblem.tone === "offline" ? <CloudOff /> : undefined}>{shownProblem.text}</Banner>}
    <form className={css.form} onSubmit={submit} noValidate>
      <TextField label="Email atau nama panggilan" type="text" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        value={email} onChange={event => setEmail(event.target.value)} required />
      <TextField label="Password" type={show ? "text" : "password"} autoComplete="current-password" value={password}
        onChange={event => setPassword(event.target.value)} error={wrong ?? undefined} suffix={eye} required />
      <Button variant="text" size="m" className={css.forgot} onClick={() => setForgot(true)} aria-haspopup="dialog">Lupa password?</Button>
      <Button type="submit" block loading={busy} loadingLabel="Memeriksa…" disabled={!!lockedUntil}>Masuk</Button>
    </form>
    <p className={css.loginNote}>Belum bisa masuk? Hubungi panitia.</p>
    <ForgotSheet open={forgot} onClose={() => setForgot(false)} email={email} onSent={() => { setForgot(false); toast.show({ text: "Permintaan terkirim ke panitia.", tone: "success" }); }} />
  </main>;
}

/** "Minta reset password" (O02__status#lupa): the admin resets it to the first password and tells the person. */
function ForgotSheet({ open, onClose, email, onSent }: { open: boolean; onClose: () => void; email: string; onSent: () => void }) {
  const [value, setValue] = useState(email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { if (open) { setValue(email); setError(null); setNote(null); } }, [open, email]); // eslint-disable-line react-hooks/set-state-in-effect -- a fresh form each time it opens

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!value.trim()) { setError("Isi email kantor atau nama panggilan."); return; }
    setBusy(true); setError(null); setNote(null);
    try {
      const { data, message } = await mwRequest<{ sent: boolean }>(praWamApi.forgot, { method: "POST", json: { email: value.trim() } });
      setBusy(false);
      if (data?.sent) onSent(); else setNote(message);
    } catch (problem) {
      setBusy(false);
      setError(problem instanceof MwRequestError && problem.fieldErrors ? Object.values(problem.fieldErrors)[0]?.[0] ?? problem.message : failText(problem));
    }
  }

  return <Sheet open={open} onClose={onClose} title="Minta reset password" locked={busy}>
    <form className={css.form} onSubmit={send} noValidate>
      <p className={css.textMuted}>Panitia mengatur ulang password-mu lalu memberi kabar.</p>
      <TextField label="Email atau nama panggilan" type="text" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
        value={value} onChange={event => setValue(event.target.value)} error={error ?? undefined} />
      {note && <Banner tone="info">{note}</Banner>}
      <Button type="submit" block loading={busy} loadingLabel="Mengirim…">Kirim permintaan</Button>
    </form>
  </Sheet>;
}
