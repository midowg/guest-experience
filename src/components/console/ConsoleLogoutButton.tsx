"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import css from "./console.module.css";

/**
 * "Keluar" as a sidebar row (ConsoleShell's `footer`): POST to `endpoint`, then a full load of
 * `redirectTo`, so the next page is rendered without the old session.
 */
export function ConsoleLogoutButton({ endpoint, redirectTo, label = "Keluar" }: { endpoint: string; redirectTo: string; label?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setPending(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      window.location.replace(redirectTo);
    } catch {
      setError("Belum bisa keluar. Periksa jaringan lalu coba lagi.");
      setPending(false);
    }
  }
  return <>
    <button type="button" className={css.item} onClick={logout} disabled={pending} title={label}>
      <span className={css.itemIcon} aria-hidden="true"><LogOut size={20} /></span>
      <span className={css.itemLabel}>{pending ? "Keluar…" : label}</span>
    </button>
    {error && <p role="alert" className={css.sideError}>{error}</p>}
  </>;
}
