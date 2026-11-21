"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ChevronRight, CloudOff, Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import { afterSignIn, ONBOARDED_KEY } from "@/lib/main-wam/peserta/onboarding";
import { hhmm } from "@/lib/main-wam/peserta/format";
import { praWamApi } from "@/lib/routes";
import { Banner, Button, LoadingDialog, Sheet, TextField, ToastProvider, useToast } from "@/components/main-wam/ui";
import { useKnown, useLang, useT } from "@/components/main-wam/i18n";
import { useOffline } from "../Live";
import { MwRequestError, failText, mwRequest } from "../request";
import { PegasusArt } from "./PegasusArt";
import css from "../peserta.module.css";
import look from "./masuk.module.css";

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
  const t = useT();
  const known = useKnown();
  const { lang } = useLang();
  const [email, setEmail] = useState(preview?.email ?? "");
  const [password, setPassword] = useState(preview ? "contohpassword" : "");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(!!preview?.busy);
  const [wrong, setWrong] = useState<string | null>(preview?.error === "salah" ? t("peserta.login.wrong") : null);
  const [problem, setProblem] = useState<{ tone: "error" | "offline"; text: string } | null>(
    preview?.error === "offline" ? { tone: "offline", text: t("err.offline") }
      : preview?.error === "terkunci" ? { tone: "error", text: t("peserta.login.locked", { time: lang === "en" ? "05:00" : "05.00" }) } : null);
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
    if (!email.trim() || !password) { setWrong(!email.trim() ? null : t("peserta.login.enterPassword")); return; }
    setBusy(true); setWrong(null); setProblem(null);
    try {
      const { data } = await mwRequest<{ askNewPassword: boolean }>(praWamApi.login, { method: "POST", json: { email: email.trim(), password } });
      const target = afterSignIn(next, { askNewPassword: !!data?.askNewPassword, onboarded: onboarded() });
      router.refresh();
      router.replace(target);
    } catch (error) {
      setBusy(false);
      if (error instanceof MwRequestError && error.offline) { setProblem({ tone: "offline", text: t("err.offline") }); return; }
      if (error instanceof MwRequestError && error.status === 401) { setWrong(known(error.message)); return; }
      if (error instanceof MwRequestError && error.status === 429) {
        const until = Date.now() + LOCK_MINUTES * 60_000;
        setLockedUntil(until);
        setProblem({ tone: "error", text: t("peserta.login.locked", { time: hhmm(new Date(until).toISOString(), lang) }) });
        return;
      }
      if (error instanceof MwRequestError && error.fieldErrors) { setWrong(known(Object.values(error.fieldErrors)[0]?.[0] ?? error.message)); return; }
      setProblem({ tone: "error", text: failText(error) });
    }
  }

  const shownProblem = problem ?? (offline ? { tone: "offline" as const, text: t("err.offline") } : null);
  const eye = <button type="button" className={css.eye} onClick={() => setShow(!show)} aria-pressed={show} aria-label={show ? t("peserta.login.hide") : t("peserta.login.show")}>
    {show ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
  </button>;
  return <main className={look.login}>
    <PegasusArt flow className={look.loginPeg} />
    <div className={look.panel}>
      <h1 className={look.title}>{t("peserta.login.welcome")} <span className={look.titleEvent}>{eventName}</span></h1>
      {shownProblem && <Banner tone={shownProblem.tone} icon={shownProblem.tone === "offline" ? <CloudOff /> : undefined}>{shownProblem.text}</Banner>}
      <form className={look.fields} onSubmit={submit} noValidate>
        <TextField label={t("peserta.login.email")} type="text" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} icon={UserRound}
          value={email} onChange={event => setEmail(event.target.value)} required />
        <TextField label={t("peserta.login.password")} type={show ? "text" : "password"} autoComplete="current-password" value={password} icon={LockKeyhole}
          onChange={event => setPassword(event.target.value)} error={wrong ?? undefined} suffix={eye} required />
        <button type="submit" className={look.goldButton} disabled={busy || !!lockedUntil}>{t("peserta.login.title")}<ChevronRight aria-hidden /></button>
      </form>
      <button type="button" className={look.fine} onClick={() => setForgot(true)} aria-haspopup="dialog">{t("peserta.login.forgotLine")}</button>
    </div>
    <LoadingDialog open={busy} title={t("peserta.login.signingIn")} />
    <ForgotSheet open={forgot} onClose={() => setForgot(false)} email={email} onSent={() => { setForgot(false); toast.show({ text: t("peserta.login.requestSent"), tone: "success" }); }} />
  </main>;
}

/** "Minta reset password" (O02__status#lupa): the admin resets it to the first password and tells the person. */
function ForgotSheet({ open, onClose, email, onSent }: { open: boolean; onClose: () => void; email: string; onSent: () => void }) {
  const t = useT();
  const known = useKnown();
  const [value, setValue] = useState(email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { if (open) { setValue(email); setError(null); setNote(null); } }, [open, email]); // eslint-disable-line react-hooks/set-state-in-effect -- a fresh form each time it opens

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!value.trim()) { setError(t("peserta.login.enterIdentity")); return; }
    setBusy(true); setError(null); setNote(null);
    try {
      const { data, message } = await mwRequest<{ sent: boolean }>(praWamApi.forgot, { method: "POST", json: { email: value.trim() } });
      setBusy(false);
      if (data?.sent) onSent(); else setNote(known(message));
    } catch (problem) {
      setBusy(false);
      setError(problem instanceof MwRequestError && problem.fieldErrors ? known(Object.values(problem.fieldErrors)[0]?.[0] ?? problem.message) : failText(problem));
    }
  }

  return <Sheet open={open} onClose={onClose} title={t("peserta.login.resetTitle")} locked={busy}>
    <form className={css.form} onSubmit={send} noValidate>
      <p className={css.textMuted}>{t("peserta.login.resetNote")}</p>
      <TextField label={t("peserta.login.identity")} type="text" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
        value={value} onChange={event => setValue(event.target.value)} error={error ?? undefined} />
      {note && <Banner tone="info">{note}</Banner>}
      <Button type="submit" block loading={busy} loadingLabel={t("peserta.login.sending")}>{t("peserta.login.send")}</Button>
    </form>
  </Sheet>;
}
