"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { adminModules, type AdminModule } from "@/lib/admin-modules";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import styles from "@/components/admin/admin.module.css";

const groups = [...new Set(adminModules.map(module => module.group))];

/** Super admin: which event modules regular admins may switch on. */
export function ModuleSettings({ initialDisabled, migrated }: { initialDisabled: AdminModule[]; migrated: boolean }) {
  const [saved, setSaved] = useState(() => new Set(initialDisabled));
  const [disabled, setDisabled] = useState(() => new Set(initialDisabled));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dirty = disabled.size !== saved.size || [...disabled].some(key => !saved.has(key));
  function toggle(key: AdminModule) {
    setDisabled(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
    setMessage(""); setError("");
  }
  async function save() {
    if (busy || !dirty) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await adminRequest<{ disabled: AdminModule[] }>("/api/admin/modules", { method: "PUT", body: JSON.stringify({ disabled: [...disabled] }) });
      const next = new Set(result.data?.disabled ?? []);
      setSaved(next); setDisabled(next); setMessage(result.message);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <section className={styles.moduleSettings} aria-labelledby="modules-title">
    <h2 id="modules-title" className={styles.superSectionTitle}>Modul untuk admin biasa</h2>
    <p className={styles.lead}>Matikan modul yang tidak boleh dipakai admin biasa saat membuat atau mengubah acara. Modul yang dimatikan tidak muncul di editor maupun survei Buat acara. Acara lama yang sudah memakainya tetap utuh: admin masih bisa mengubah atau mematikannya, tetapi tidak bisa menyalakannya lagi. Halaman tamu tidak berubah, dan super admin tetap bisa memakai semua modul.</p>
    {!migrated && <Notice tone="warning">Pengaturan modul menunggu migrasi <code>202610200006_admin_modules.sql</code>.</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {message && <p role="status" className={styles.guestMessage}>{message}</p>}
    <div className={styles.moduleGroups}>
      {groups.map(group => <fieldset key={group} className={styles.moduleGroup}>
        <legend>{group}</legend>
        {adminModules.filter(module => module.group === group).map(module => <label key={module.key} className={styles.moduleRow}>
          <span className={styles.moduleText}><strong>{module.label}</strong><span>{module.description}</span></span>
          <span className={styles.superSwitch}>
            <input type="checkbox" role="switch" checked={!disabled.has(module.key)} disabled={!migrated || busy} onChange={() => toggle(module.key)} aria-label={`${module.label} boleh dipakai admin`} />
            <span>{disabled.has(module.key) ? "Mati" : "Boleh"}</span>
          </span>
        </label>)}
      </fieldset>)}
    </div>
    <div className={styles.moduleFooter}>
      <span className="muted">{disabled.size ? `${disabled.size} modul dimatikan untuk admin biasa` : "Semua modul boleh dipakai"}{dirty ? " · belum disimpan" : ""}</span>
      <Button type="button" disabled={!migrated || busy || !dirty} onClick={() => void save()}><Save size={16} aria-hidden="true" /> {busy ? "Menyimpan…" : "Simpan pengaturan modul"}</Button>
    </div>
  </section>;
}
