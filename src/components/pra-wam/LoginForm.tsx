"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { PRA_WAM_PATH, praWamApi, praWamPath } from "@/lib/routes";
import { errorText, praWamRequest } from "./api";
import styles from "./pra-wam.module.css";

/** One sign-in for everyone (Penpot "A1 · Masuk"): what follows depends on the person's role. */
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
    <div className={styles.loginHead}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a small static mark */}
      <img className={styles.loginMark} src={`${PRA_WAM_PATH}/icon-192.png`} alt="Werkudara" />
      <h1>WAM</h1>
      <p>Satu aplikasi untuk setiap langkah menuju WAM 2027</p>
    </div>
    {error && <Notice tone="error">{error}</Notice>}
    <div>
      <label className={styles.label} htmlFor="email">Email</label>
      <input id="email" className="input" type="email" autoComplete="username" inputMode="email" placeholder="nama@werkudara.com" value={email} onChange={e => setEmail(e.target.value)} required />
    </div>
    <div>
      <label className={styles.label} htmlFor="password">Password</label>
      <div className={styles.passwordRow}>
        <input id="password" className="input" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
        <button type="button" className={styles.eye} onClick={() => setShow(!show)} aria-pressed={show} aria-label={show ? "Sembunyikan password" : "Lihat password"}>{show ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}</button>
      </div>
    </div>
    <Button type="submit" disabled={busy || !email || !password}>{busy ? "Memeriksa…" : "Masuk"}</Button>
    <p className={styles.loginNote}><a href={praWamPath.forgot}>Lupa password?</a></p>
    <p className={styles.loginNote}>Journey by Werkudara</p>
  </form>;
}
