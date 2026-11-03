"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button, Field, Notice } from "@/components/ui";
import { passwordRules } from "@/lib/pra-wam/password";
import { praWamApi, praWamPath } from "@/lib/routes";
import { errorText, praWamRequest } from "./api";
import own from "./akun.module.css";
import styles from "./pra-wam.module.css";

/** Lupa password: one field, the work email. The link goes to the person's own inbox. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setNotice(null);
    try { setNotice({ tone: "success", text: (await praWamRequest(praWamApi.forgot, { method: "POST", json: { email } })).message }); }
    catch (problem) { setNotice({ tone: "error", text: errorText(problem) }); }
    finally { setBusy(false); }
  }
  return <form className={styles.loginCard} onSubmit={submit} noValidate>
    <div className={styles.loginHead}><h1>Lupa password</h1><p>Tulis email kantormu. Kami kirim tautan untuk membuat password baru ke email itu.</p></div>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <Field name="email" label="Email kantor">
      <input id="email" className="input" type="email" autoComplete="username" inputMode="email" placeholder="nama@werkudara.com" value={email} onChange={change => setEmail(change.target.value)} />
    </Field>
    <Button type="submit" disabled={busy || !email}>{busy ? "Mengirim…" : "Kirim tautan"}</Button>
    <p className={styles.loginNote}><a href={praWamPath.login()}>Kembali ke halaman masuk</a></p>
  </form>;
}

/**
 * The page the emailed link opens. Supabase puts the proof in the address after "#", which never
 * reaches the server by itself; it is read here, removed from the address bar, and sent once with
 * the new password.
 */
export function ResetPasswordForm() {
  const [token, setToken] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [form, setForm] = useState({ next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get("access_token");
    // Reading the link once, when the page opens; the address bar is cleaned so the token is not shared by accident.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (accessToken && hash.get("type") === "recovery") setToken(accessToken);
    else setLinkError(hash.get("error_description") ?? "Tautan tidak lengkap atau sudah dipakai.");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const matches = form.confirm.length > 0 && form.confirm === form.next;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setBusy(true); setError(null);
    try {
      await praWamRequest(praWamApi.resetPassword, { method: "POST", json: { accessToken: token, ...form } });
      window.location.assign(praWamPath.home);
    } catch (problem) { setError(errorText(problem)); setBusy(false); }
  }
  return <form className={styles.loginCard} onSubmit={submit} noValidate>
    <div className={styles.loginHead}><h1>Buat password baru</h1><p>WAM</p></div>
    {linkError ? <><Notice tone="error">{linkError} Minta tautan baru.</Notice><a className="button button--primary" href={praWamPath.forgot}>Minta tautan baru</a></> : <>
      {error && <Notice tone="error">{error}</Notice>}
      <Field name="next" label="Password baru">
        <input id="next" className="input" type="password" autoComplete="new-password" value={form.next} onChange={change => setForm({ ...form, next: change.target.value })} aria-describedby="aturan-password" />
      </Field>
      <ul id="aturan-password" className={styles.rules}>
        {passwordRules.map(rule => <li key={rule.id} data-ok={rule.test(form.next)} className={own.ruleIcon}>{rule.test(form.next) || !form.next ? <CheckCircle2 aria-hidden /> : <AlertTriangle aria-hidden />}{rule.label}</li>)}
      </ul>
      <Field name="confirm" label="Ulangi password baru">
        <input id="confirm" className="input" type="password" autoComplete="new-password" value={form.confirm} onChange={change => setForm({ ...form, confirm: change.target.value })} />
      </Field>
      <Button type="submit" disabled={busy || !token || !matches}>{busy ? "Menyimpan…" : "Simpan dan masuk"}</Button>
    </>}
  </form>;
}
