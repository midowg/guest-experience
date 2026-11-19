"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { KEY_PATTERN } from "@/lib/leadership-reset/form";
import { leadershipResetPath } from "@/lib/routes";
import { CMS_KEY, store } from "./api";
import css from "./reflection.module.css";

/** Opens the CMS this device already used; otherwise asks once for the CMS link (or its code). */
export function CmsEntry() {
  const [asking, setAsking] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const again = new URLSearchParams(window.location.search).has("ganti");
    if (again) store.remove(CMS_KEY);
    const known = again ? null : store.get(CMS_KEY);
    if (known && KEY_PATTERN.test(known)) window.location.replace(leadershipResetPath.cms(known));
    else queueMicrotask(() => setAsking(true));
  }, []);
  function open() {
    const key = value.trim().split(/[/?#]/).filter(Boolean).pop() ?? "";
    if (!KEY_PATTERN.test(key)) { setError("Tempel tautan CMS lengkap (…/refleksi/kelola/…) yang Anda terima."); return; }
    store.set(CMS_KEY, key);
    window.location.assign(leadershipResetPath.cms(key));
  }
  return <main className={css.page}>
    <div className={css.layout} style={{ maxWidth: 560 }}>
      <form className={css.card} onSubmit={event => { event.preventDefault(); open(); }} aria-busy={!asking}>
        <h1 className={css.sectionTitle}><KeyRound size={26} aria-hidden="true" /> CMS Refleksi Leader</h1>
        {asking ? <>
          <p className={css.muted}>Tempel tautan CMS sekali saja. Setelah itu perangkat ini langsung membuka CMS setiap kali Anda ke halaman ini.</p>
          <label className={css.field} data-error={error || undefined} style={{ marginTop: 16 }}>
            <span>Tautan CMS</span>
            <input value={value} onChange={event => { setValue(event.target.value); setError(""); }} placeholder="https://journey.werkudara.group/refleksi/kelola/…" autoFocus />
            {error && <small>{error}</small>}
          </label>
          <button type="submit" className={css.submit}>Buka CMS</button>
        </> : <p className={css.muted}>Membuka CMS…</p>}
      </form>
    </div>
  </main>;
}
