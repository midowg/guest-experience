"use client";

import { useEffect, useRef, useState } from "react";
import { Crown, LogOut } from "lucide-react";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { reloadTo } from "@/components/admin/shared/navigate";
import { SUPER_ADMIN_HOME } from "@/lib/routes";
import css from "./account-menu.module.css";

/**
 * Who is signed in, as one small round button on Beranda (22 Nov 2026: the admin's top bar is gone).
 * It opens Super admin (for the super admin) and Keluar.
 */
export function AccountMenu({ name, role }: { name: string; role: "admin" | "super" }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  async function logout() {
    setPending(true); setError("");
    try { await adminRequest("/api/auth/logout", { method: "POST" }); reloadTo("/admin/login"); }
    catch (err) { setError(errorMessage(err)); setPending(false); }
  }
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase() || "A";
  return <div ref={root} className={css.root}>
    <button type="button" className={css.trigger} aria-expanded={open} aria-haspopup="menu" aria-label={`Akun: ${name}`} onClick={() => setOpen(!open)}>{initials}</button>
    {open && <div className={css.menu} role="menu" aria-label="Akun">
      <p className={css.who}><strong>{name}</strong><span>{role === "super" ? "Super admin" : "Admin"}</span></p>
      {role === "super" && <a role="menuitem" href={SUPER_ADMIN_HOME}><Crown size={16} aria-hidden="true" /> Super admin</a>}
      <button type="button" role="menuitem" disabled={pending} onClick={logout}><LogOut size={16} aria-hidden="true" /> {pending ? "Keluar…" : "Keluar"}</button>
      {error && <p role="alert" className={css.error}>{error}</p>}
    </div>}
  </div>;
}
