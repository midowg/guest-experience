"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button, Field, Notice } from "@/components/ui";
import { passwordRules } from "@/lib/pra-wam/password";
import { RESET_NOTE_MAX } from "@/lib/pra-wam/reset-requests";
import { praWamApi, praWamPath } from "@/lib/routes";
import { errorText, PraWamApiError, praWamRequest } from "./api";
import own from "./akun.module.css";
import styles from "./pra-wam.module.css";

/**
 * Lupa password: a request to the admin WAM, who resets the account to the shared first password.
 * The answer is the same for every email, so the success state never says whether it exists.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; email?: string; note?: string } | null>(null);
  const [done, setDone] = useState<{ sent: boolean; message: string } | null>(null);
  const doneHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (done) doneHeading.current?.focus(); }, [done]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const result = await praWamRequest<{ sent: boolean }>(praWamApi.forgot, { method: "POST", json: { email, note } });
      setDone({ sent: result.data?.sent !== false, message: result.message });
    } catch (problem) {
      const fields = problem instanceof PraWamApiError ? problem.fieldErrors : undefined;
      setError({ text: errorText(problem), email: fields?.email?.[0], note: fields?.note?.[0] });
    } finally { setBusy(false); }
  }

  if (done) return <div className={styles.loginCard}>
    <div className={styles.loginHead}>
      {done.sent && <CheckCircle2 size={48} aria-hidden style={{ color: "var(--pw-success)" }} />}
      <h1 ref={doneHeading} tabIndex={-1}>{done.sent ? "Permintaan terkirim ke admin WAM" : "Hubungi admin WAM"}</h1>
      <p>{done.message}</p>
    </div>
    {done.sent && <ol className={styles.rules} style={{ listStyle: "decimal", paddingLeft: 20, fontSize: 15, color: "var(--pw-text)" }}>
      <li>Admin mengatur ulang password-mu ke password awal.</li>
      <li>Masuk dengan email kantor dan password awal.</li>
      <li>Buat password baru saat diminta.</li>
    </ol>}
    <p className={styles.hint}>Belum bisa masuk setelah beberapa waktu? Hubungi admin WAM langsung.</p>
    <a className="button button--primary" href={praWamPath.login()}>Kembali ke halaman masuk</a>
  </div>;

  return <form className={styles.loginCard} onSubmit={submit} noValidate>
    <div className={styles.loginHead}><h1>Lupa password</h1><p>Admin akan mengatur ulang password-mu ke password awal. Setelah itu masuk dengan password awal lalu buat password baru.</p></div>
    {error && <Notice tone="error">{error.text}</Notice>}
    <div>
      <label className={styles.label} htmlFor="email">Email kantor</label>
      <input id="email" className="input" type="email" autoComplete="username" inputMode="email" placeholder="nama@werkudara.com" value={email} maxLength={200} required
        aria-invalid={error?.email ? true : undefined} aria-describedby={error?.email ? "email-error" : undefined} onChange={change => setEmail(change.target.value)} />
      {error?.email && <p id="email-error" className="field-error">{error.email}</p>}
    </div>
    <div>
      <label className={styles.label} htmlFor="note">Catatan untuk admin (opsional)</label>
      <textarea id="note" className="textarea" rows={3} maxLength={RESET_NOTE_MAX} value={note} placeholder="Misalnya: sudah coba beberapa kali dan lupa password baru"
        aria-invalid={error?.note ? true : undefined} aria-describedby={error?.note ? "note-hint note-error" : "note-hint"} onChange={change => setNote(change.target.value)} />
      <p id="note-hint" className={styles.hint}>{note.length}/{RESET_NOTE_MAX} karakter</p>
      {error?.note && <p id="note-error" className="field-error">{error.note}</p>}
    </div>
    <Button type="submit" disabled={busy || !email.trim()}>{busy ? "Mengirim…" : "Minta reset ke admin"}</Button>
    <p className={styles.loginNote}><a href={praWamPath.login()} style={{ display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 4px" }}>Kembali ke halaman masuk</a></p>
  </form>;
}

/**
 * The page an emailed link opens (links sent before "Lupa password" became a request to the admin). Supabase puts the proof in the address after "#", which never
 * reaches the server by itself; it is read here, removed from the address bar, and sent once with
 * the new password.
 */
export function ResetPasswordForm() {
  const router = useRouter();
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
      router.replace(praWamPath.home);
    } catch (problem) { setError(errorText(problem)); setBusy(false); }
  }
  return <form className={styles.loginCard} onSubmit={submit} noValidate>
    <div className={styles.loginHead}><h1>Buat password baru</h1><p>WAM</p></div>
    {linkError ? <><Notice tone="error">{linkError} Minta reset ke admin WAM.</Notice><a className="button button--primary" href={praWamPath.forgot}>Minta reset ke admin</a></> : <>
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
