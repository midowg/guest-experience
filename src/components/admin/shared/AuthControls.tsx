"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogIn, LogOut } from "lucide-react";
import { Button, Field, Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import styles from "@/components/admin/admin.module.css";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      const result = await adminRequest<{ role: "admin" | "super" }>("/api/auth/login", { method: "POST", body: JSON.stringify({ password: data.get("password") }) });
      // A super admin lands on their own dashboard unless they were heading somewhere specific.
      router.replace(result.data?.role === "super" && next === "/admin" ? "/admin/super" : next); router.refresh();
    } catch (err) { setError(errorMessage(err)); setPending(false); }
  }
  return <form onSubmit={submit} className={styles.loginForm} aria-busy={pending}>
    {error && <Notice tone="error">{error}</Notice>}
    <Field label="Password admin" name="password">
      <span className={styles.passwordRow}>
        <input className="input" id="password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" required maxLength={200} disabled={pending} autoFocus />
        <button type="button" className={styles.passwordToggle} onClick={() => setVisible(value => !value)} aria-pressed={visible} aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}>
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </span>
    </Field>
    <Button type="submit" disabled={pending}><LogIn size={17} aria-hidden="true" /> {pending ? "Memeriksa…" : "Masuk"}</Button>
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
  return <>
    <button type="button" className={styles.headerLink} disabled={pending} onClick={logout}><LogOut size={16} aria-hidden="true" /> {pending ? "Keluar…" : "Keluar"}</button>
    {error && <span role="alert" className={styles.headerError}>{error}</span>}
  </>;
}
