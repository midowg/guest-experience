"use client";

import { useState } from "react";
import { Button, Field, Notice } from "@/components/ui";
import { praWamApi, praWamPath } from "@/lib/routes";
import { errorText, praWamRequest } from "./api";
import styles from "./pra-wam.module.css";

/** One sign-in for everyone: the work email and password. What follows depends on the person's role. */
export function LoginForm({ next }: { next: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const result = await praWamRequest<{ mustChangePassword: boolean }>(praWamApi.login, { method: "POST", json: { email, password } });
      // The shared first password: offer a new one first; it can be skipped.
      window.location.assign(result.data?.mustChangePassword ? praWamPath.newPassword(next ?? undefined) : next ?? praWamPath.home);
    } catch (problem) { setError(errorText(problem)); setBusy(false); }
  }

  return <form className={styles.loginCard} onSubmit={submit} noValidate>
    {/* eslint-disable-next-line @next/next/no-img-element -- a small static mark */}
    <img className={styles.loginMark} src="/werkudara-mark.png" alt="Werkudara" />
    <div>
      <p className={styles.kicker}>Menuju WAM 2027</p>
      <h1>Pra WAM</h1>
      <p className={styles.hint}>Satu aplikasi untuk setiap langkah menuju WAM 2027.</p>
    </div>
    {error && <Notice tone="error">{error}</Notice>}
    <Field name="email" label="Email kantor">
      <input id="email" className="input" type="email" autoComplete="username" inputMode="email" placeholder="nama@werkudara.com" value={email} onChange={e => setEmail(e.target.value)} required />
    </Field>
    <Field name="password" label="Password">
      <div className="row" style={{ flexWrap: "nowrap", gap: "var(--space-2)" }}>
        <input id="password" className="input" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
        <Button type="button" variant="quiet" onClick={() => setShow(!show)} aria-pressed={show}>{show ? "Sembunyikan" : "Lihat"}</Button>
      </div>
    </Field>
    <Button type="submit" disabled={busy || !email || !password}>{busy ? "Memeriksa…" : "Masuk"}</Button>
    <p className={styles.loginNote}>Lupa password? Hubungi admin Pra WAM untuk mengatur ulang.</p>
  </form>;
}
