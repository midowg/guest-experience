"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, RotateCcw, Save } from "lucide-react";
import { Notice } from "@/components/ui";
import { Card, ConsoleButton } from "@/components/console";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { HOME_MENU_MIGRATION, defaultHomeMenu, homeAppLabels, homeMenuSchema, type HomeMenuItem } from "@/lib/home-menu";
import { HOME_STYLE_API } from "@/lib/routes";
import css from "./home-style.module.css";

const same = (a: HomeMenuItem[], b: HomeMenuItem[]) => JSON.stringify(a) === JSON.stringify(b);
const fieldsOf = { name: "Nama", what: "Keterangan", account: "Akun", description: "Deskripsi" } as const;

/**
 * Super admin → Halaman utama → Menu aplikasi: which apps the front page shows, in what order, with
 * what name, line, description and colour. The apps and their addresses are fixed; saved together.
 */
export function HomeMenuSettings({ initial, migrated }: { initial: HomeMenuItem[]; migrated: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [menu, setMenu] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dirty = !same(menu, saved);
  const check = homeMenuSchema.safeParse(menu);
  const problem = check.success ? "" : check.error.issues[0]?.message ?? "Periksa isian.";

  function change(index: number, patch: Partial<HomeMenuItem>) {
    setMenu(current => current.map((item, at) => at === index ? { ...item, ...patch } : item));
    setMessage(""); setError("");
  }
  function move(index: number, by: -1 | 1) {
    setMenu(current => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item);
      return next;
    });
    setMessage(""); setError("");
  }
  async function save() {
    if (busy || !dirty || problem) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await adminRequest<{ menu: HomeMenuItem[] }>(HOME_STYLE_API, { method: "PUT", body: JSON.stringify({ menu }) });
      const next = result.data?.menu ?? menu;
      setSaved(next); setMenu(next); setMessage(result.message);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }

  return <Card title="Menu aplikasi" id="home-menu">
    <p className={css.lead}>Aplikasi yang tampil di halaman utama, urutannya, dan tulisannya. Alamat dan logo tiap aplikasi tetap, jadi menu ini tidak bisa membuka halaman lain.</p>
    {!migrated && <Notice tone="warning">Menu menunggu migrasi <code>{HOME_MENU_MIGRATION}</code>. Sampai itu, halaman utama memakai menu bawaan.</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {message && <p role="status" className={css.status}>{message}</p>}

    <ol className={css.menu}>{menu.map((item, index) => <li key={item.app} className={css.menuItem} data-off={item.shown ? undefined : ""} style={{ "--tone": item.tone } as React.CSSProperties}>
      <div className={css.menuHead}>
        <span className={css.order} aria-hidden="true">{index + 1}</span>
        <span className={css.menuTitle}><strong>{item.name || "Tanpa nama"}</strong><small>{homeAppLabels[item.app]}</small></span>
        <span className={css.menuTools}>
          <button type="button" className={css.iconButton} onClick={() => move(index, -1)} disabled={!migrated || index === 0} aria-label={`Naikkan ${item.name}`}><ArrowUp size={16} /></button>
          <button type="button" className={css.iconButton} onClick={() => move(index, 1)} disabled={!migrated || index === menu.length - 1} aria-label={`Turunkan ${item.name}`}><ArrowDown size={16} /></button>
          <label className={css.switch}>
            <input type="checkbox" role="switch" checked={item.shown} disabled={!migrated} onChange={change_ => change(index, { shown: change_.target.checked })} aria-label={`${item.name} tampil di halaman utama`} />
            <span>{item.shown ? "Tampil" : "Disembunyikan"}</span>
          </label>
        </span>
      </div>
      <div className={css.menuFields}>
        {(["name", "what", "account"] as const).map(field => <label key={field} className={css.field}>
          <span>{fieldsOf[field]}</span>
          <input value={item[field]} disabled={!migrated} maxLength={field === "what" ? 40 : field === "name" ? 30 : 24} onChange={event => change(index, { [field]: event.target.value })} />
        </label>)}
        <label className={css.field}>
          <span>Warna</span>
          <input type="color" value={item.tone} disabled={!migrated} onChange={event => change(index, { tone: event.target.value })} className={css.color} />
        </label>
        <label className={`${css.field} ${css.wide}`}>
          <span>{fieldsOf.description}</span>
          <textarea rows={2} value={item.description} disabled={!migrated} maxLength={160} onChange={event => change(index, { description: event.target.value })} />
        </label>
      </div>
    </li>)}</ol>

    {dirty && problem && <p className={css.problem} role="alert">{problem}</p>}
    <div className={css.actions}>
      <ConsoleButton variant="primary" icon={<Save size={16} />} onClick={() => void save()} disabled={!migrated || busy || !dirty || !!problem}>{busy ? "Menyimpan..." : "Simpan menu"}</ConsoleButton>
      <ConsoleButton icon={<RotateCcw size={16} />} onClick={() => { setMenu(defaultHomeMenu.map(item => ({ ...item }))); setMessage(""); }} disabled={!migrated || busy || same(menu, defaultHomeMenu)}>Kembalikan bawaan</ConsoleButton>
      {dirty && <span className={css.unsaved}>Ada perubahan yang belum disimpan.</span>}
    </div>
  </Card>;
}
