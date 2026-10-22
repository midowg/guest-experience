"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { eventTemplates, type TemplateKey } from "@/lib/event-templates";
import { themeDefinition } from "@/lib/themes";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { TemplateMiniature } from "@/components/admin/events/TemplateMiniature";
import styles from "@/components/admin/admin.module.css";

/** Super admin: which ready-made templates regular admins see in "Buat acara". */
export function TemplateSettings({ initialEnabled, migrated }: { initialEnabled: TemplateKey[]; migrated: boolean }) {
  const [saved, setSaved] = useState(() => new Set(initialEnabled));
  const [enabled, setEnabled] = useState(() => new Set(initialEnabled));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dirty = enabled.size !== saved.size || [...enabled].some(key => !saved.has(key));
  function toggle(key: TemplateKey) {
    setEnabled(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
    setMessage(""); setError("");
  }
  async function save() {
    if (busy || !dirty) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await adminRequest<{ enabled: TemplateKey[] }>("/api/admin/templates", { method: "PUT", body: JSON.stringify({ enabled: [...enabled] }) });
      const next = new Set(result.data?.enabled ?? []);
      setSaved(next); setEnabled(next); setMessage(result.message);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <section className={styles.moduleSettings} aria-labelledby="templates-title">
    <h2 id="templates-title" className={styles.superSectionTitle}>Templat Buat acara</h2>
    <p className={styles.lead}>Pilih templat yang muncul saat admin biasa menekan <strong>Buat acara</strong>. Tampilan setiap acara ikut templatnya, jadi admin cukup memilih templat. Super admin selalu melihat semua templat.</p>
    {!migrated && <Notice tone="warning">Pengaturan ini menunggu migrasi <code>202610200007_admin_templates.sql</code>. Sampai itu, admin biasa melihat Kunjungan klien dan Trip klien.</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {message && <p role="status" className={styles.guestMessage}>{message}</p>}
    <ul className={styles.templateGallery}>
      {eventTemplates.map(template => <li key={template.key}>
        <label className={`${styles.templateChoice} ${enabled.has(template.key) ? "" : styles.templateOff}`.trimEnd()}>
          <TemplateMiniature template={template} />
          <span className={styles.templateChoiceText}>
            <strong>{template.label}</strong>
            <span>{template.audience === "internal" ? "Internal" : "Untuk tamu luar"} · tampilan {themeDefinition(template.theme).name}</span>
          </span>
          <span className={styles.superSwitch}>
            <input type="checkbox" role="switch" checked={enabled.has(template.key)} disabled={!migrated || busy} onChange={() => toggle(template.key)} aria-label={`${template.label} tampil untuk admin`} />
            <span>{enabled.has(template.key) ? "Tampil" : "Disembunyikan"}</span>
          </span>
        </label>
      </li>)}
    </ul>
    <div className={styles.moduleFooter}>
      <span className="muted">{enabled.size} dari {eventTemplates.length} templat tampil untuk admin biasa{dirty ? " · belum disimpan" : ""}</span>
      <Button type="button" disabled={!migrated || busy || !dirty} onClick={() => void save()}><Save size={16} aria-hidden="true" /> {busy ? "Menyimpan…" : "Simpan pengaturan templat"}</Button>
    </div>
  </section>;
}
