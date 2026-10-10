"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "./api";
import styles from "./admin.module.css";

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      await adminRequest("/api/auth/login", { method: "POST", body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) });
      router.replace("/admin"); router.refresh();
    } catch (err) { setError(errorMessage(err)); setPending(false); }
  }
  return <form onSubmit={submit} className={styles.form} aria-busy={pending}>
    {error && <Notice tone="error">{error}</Notice>}
    <Field label="Email admin" name="email"><input className="input" id="email" name="email" type="email" autoComplete="username" required maxLength={254} disabled={pending} /></Field>
    <Field label="Kata sandi" name="password"><input className="input" id="password" name="password" type="password" autoComplete="current-password" required disabled={pending} /></Field>
    <Button type="submit" disabled={pending}>{pending ? "Memeriksa akses…" : "Masuk"}</Button>
    <p className="muted">Akses hanya untuk akun yang terdaftar sebagai admin. Tidak ada pendaftaran admin publik.</p>
  </form>;
}

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setPending(true); setError("");
    try { await adminRequest("/api/auth/logout", { method: "POST" }); router.replace("/admin/login"); router.refresh(); }
    catch (err) { setError(errorMessage(err)); setPending(false); }
  }
  return <div className="stack"><Button type="button" variant="quiet" disabled={pending} onClick={logout}>{pending ? "Keluar…" : "Keluar"}</Button>{error && <Notice tone="error">{error}</Notice>}</div>;
}
