"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { PRA_WAM_PATH, praWamApi, praWamPath } from "@/lib/routes";
import { errorText, praWamRequest } from "./api";
import styles from "./pra-wam.module.css";

/** One sign-in for everyone (Penpot "A1 · Masuk"): what follows depends on the person's role. */
export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const result = await praWamRequest<{ mustChangePassword: boolean; askNewPassword: boolean }>(praWamApi.login, { method: "POST", json: { email, password } });
      // The shared first password: offer a new one once (it can be skipped); after that Profil
      // reminds and Pengaturan has the form, so a later sign-in goes straight in.
      router.refresh(); router.replace(result.data?.askNewPassword ? praWamPath.newPassword(next ?? undefined) : next ?? praWamPath.home);
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
      {/* An email or a nama panggilan (13 Nov 2026): interns and daily workers without an email use the latter. */}
      <label className={styles.label} htmlFor="email">Email atau nama panggilan</label>
      <input id="email" className="input" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="nama@werkudara.com atau dewi" value={email} onChange={e => setEmail(e.target.value)} required />
    </div>
    <div>
      <label className={styles.label} htmlFor="password">Password</label>
      <div className={styles.passwordRow}>
        <input id="password" className="input" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
        <button type="button" className={styles.eye} onClick={() => setShow(!show)} aria-pressed={show} aria-label={show ? "Sembunyikan password" : "Lihat password"}>{show ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}</button>
      </div>
      <div className={styles.forgotRow}><a href={praWamPath.forgot}>Lupa password?</a></div>
    </div>
    <Button type="submit" disabled={busy || !email || !password}>{busy ? "Memeriksa…" : "Masuk"}</Button>
    <p className={styles.loginNote}>Journey by Werkudara</p>
  </form>;
}
