"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Eye, EyeOff, LayoutTemplate, Users } from "lucide-react";
import { Notice } from "@/components/ui";
import { Card, FilterChips, Pill, SearchField, StatCard, StatRow } from "@/components/console";
import { eventTemplates, type EventTemplate, type TemplateKey } from "@/lib/event-templates";
import { themeDefinition } from "@/lib/themes";
import { formatDate, formatDateTime } from "@/lib/format";
import type { EventKind, EventRecord, SectionKey } from "@/lib/types";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { TemplateMiniature } from "@/components/admin/events/TemplateMiniature";
import { adminEventPath } from "@/lib/routes";
import css from "./templates-events.module.css";

export type SuperEventRow = Pick<EventRecord, "id" | "title" | "slug" | "status" | "starts_at" | "timezone" | "event_kind" | "audience" | "updated_at">;

/** The kinds of event, each with the templates that make one; the order of the page. */
const kinds: { kind: EventKind; label: string; blurb: string }[] = [
  { kind: "kunjungan", label: "Welcome", blurb: "Kunjungan tamu dan mitra ke kantor Werkudara, di alamat /welcome/nama-tamu." },
  { kind: "acara", label: "Acara", blurb: "Undangan acara dengan konfirmasi kehadiran: gala dinner, seminar, rapat tahunan, tradisi." },
  { kind: "program", label: "Program & trip", blurb: "Acara beberapa hari: pelatihan dan perjalanan bersama klien." },
  { kind: "handbook", label: "Handbook", blurb: "Buku panduan perjalanan: transportasi, hotel, jadwal per hari, dan aturan." },
  { kind: "csr", label: "Friday Sharing", blurb: "Halaman donasi kegiatan berbagi, terbuka untuk umum di /friday-sharing." },
  { kind: "eguide", label: "E-Guide", blurb: "Panduan destinasi untuk dibaca: tempat, budaya, kuliner, dan tips." },
  { kind: "panduan", label: "Panduan lokasi", blurb: "Panduan umum menuju lokasi, terbuka untuk umum di /your-visit." },
  { kind: "kartu", label: "Kartu & poster", blurb: "Kartu yang diisi peserta sendiri lalu diunduh: poster, ucapan, ID card, sertifikat." },
];
const sectionNames: Partial<Record<SectionKey, string>> = {
  about: "Tentang", experience: "Pengalaman", transport: "Transportasi", stay: "Hotel", agenda: "Rundown", location: "Lokasi & rute", prepare: "Persiapan",
  guidelines: "Do & don't", team: "Kenali tim", rsvp: "Konfirmasi", contact: "Kontak PIC", contacts: "Kontak bantuan", feedback: "Survei",
};
const statusLabels = { draft: "Draf", published: "Terbit", archived: "Arsip" } as const;
const statusTones = { draft: "neutral", published: "ok", archived: "brass" } as const;

/**
 * Templat & acara (super admin): one card per kind of event. Each holds the templates that make
 * that kind, switched on or off for regular admins' "Buat acara", and the events of that kind,
 * each shown to or hidden from regular admins. Both switches save at once; guests' pages never change.
 */
export function TemplatesAndEvents({ events, initialEnabled, templatesMigrated, initialHidden, visibilityMigrated }: {
  events: SuperEventRow[]; initialEnabled: TemplateKey[]; templatesMigrated: boolean; initialHidden: string[]; visibilityMigrated: boolean;
}) {
  const [enabled, setEnabled] = useState(() => new Set(initialEnabled));
  const [hidden, setHidden] = useState(() => new Set(initialHidden));
  const [kind, setKind] = useState<EventKind | "all">("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const term = query.trim().toLowerCase();
  const matches = (event: SuperEventRow) => !term || event.title.toLowerCase().includes(term) || event.slug.includes(term);
  const groups = useMemo(() => kinds.map(group => ({
    ...group,
    templates: eventTemplates.filter(template => template.kind === group.kind),
    events: events.filter(event => event.event_kind === group.kind).sort((a, b) => (b.starts_at ?? "").localeCompare(a.starts_at ?? "")),
  })), [events]);
  const shownGroups = groups.filter(group => (kind === "all" || group.kind === kind)
    && (!term || group.events.some(matches) || group.templates.some(template => template.label.toLowerCase().includes(term))));

  async function setTemplate(template: EventTemplate, on: boolean) {
    if (busy) return;
    const next = new Set(enabled);
    if (on) next.add(template.key); else next.delete(template.key);
    setBusy(true); setError(""); setMessage(""); setEnabled(next);
    try {
      const result = await adminRequest<{ enabled: TemplateKey[] }>("/api/admin/templates", { method: "PUT", body: JSON.stringify({ enabled: [...next] }) });
      setEnabled(new Set(result.data?.enabled ?? [...next]));
      setMessage(`${template.label} ${on ? "tampil" : "disembunyikan"} di Buat acara. ${result.message}`);
    } catch (err) { setEnabled(enabled); setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  async function setVisible(ids: string[], hide: boolean) {
    if (busy || !ids.length) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await adminRequest<{ ids: string[]; hidden: boolean }>("/api/admin/visibility", { method: "PUT", body: JSON.stringify({ ids, hidden: hide }) });
      setHidden(current => { const next = new Set(current); for (const id of ids) { if (hide) next.add(id); else next.delete(id); } return next; });
      setMessage(result.message);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }

  const published = events.filter(event => event.status === "published").length;
  return <div className={css.page} aria-busy={busy}>
    {!templatesMigrated && <Notice tone="warning">Pilihan templat menunggu migrasi <code>202610200007_admin_templates.sql</code>. Sampai itu, admin biasa melihat Welcome dan Trip klien.</Notice>}
    {!visibilityMigrated && <Notice tone="warning">Menyembunyikan acara menunggu migrasi <code>202610200005_admin_roles.sql</code>.</Notice>}

    <StatRow label="Ringkasan">
      <StatCard label="Templat di Buat acara" value={`${enabled.size}/${eventTemplates.length}`} note="yang bisa dipilih admin biasa" icon={<LayoutTemplate size={18} />} />
      <StatCard label="Acara" value={events.length} note={`${published} terbit`} icon={<CalendarDays size={18} />} />
      <StatCard label="Terlihat oleh admin" value={events.length - hidden.size} icon={<Eye size={18} />} />
      <StatCard label="Disembunyikan" value={hidden.size} note="hanya super admin yang melihat" icon={<EyeOff size={18} />} tone={hidden.size ? "warn" : undefined} />
    </StatRow>

    <div className={css.tools}>
      <SearchField label="Cari templat atau acara" placeholder="Cari templat atau judul acara" value={query} onChange={setQuery} />
      <FilterChips label="Jenis" value={kind} onChange={setKind} chips={[
        { value: "all", label: "Semua", count: events.length },
        ...groups.map(group => ({ value: group.kind, label: group.label, count: group.events.length })),
      ]} />
    </div>
    {error && <Notice tone="error">{error}</Notice>}
    {message && <p role="status" className={css.status}>{message}</p>}

    {shownGroups.length === 0 && <p className="muted">Tidak ada templat atau acara yang cocok.</p>}
    {shownGroups.map(group => {
      const list = group.events.filter(matches);
      const hiddenHere = group.events.filter(event => hidden.has(event.id)).length;
      return <Card key={group.kind} id={`kind-${group.kind}`} title={group.label}>
        <p className={css.blurb}>{group.blurb}</p>

        <ul className={css.templates} aria-label={`Templat ${group.label}`}>{group.templates.map(template => {
          const on = enabled.has(template.key);
          const theme = themeDefinition(template.theme);
          return <li key={template.key} className={css.template} data-off={on ? undefined : ""}>
            <div className={css.mini}><TemplateMiniature template={template} /></div>
            <div className={css.templateBody}>
              <div className={css.templateHead}>
                <strong>{template.label}</strong>
                <label className={css.switch}>
                  <input type="checkbox" role="switch" checked={on} disabled={!templatesMigrated || busy} onChange={change => void setTemplate(template, change.target.checked)} aria-label={`${template.label} tampil di Buat acara`} />
                  <span>{on ? "Tampil di Buat acara" : "Disembunyikan"}</span>
                </label>
              </div>
              <p className={css.description}>{template.description}</p>
              <div className={css.pills}>
                <Pill tone={template.audience === "internal" ? "purple" : "blue"}><Users size={12} aria-hidden="true" /> {template.audience === "internal" ? "Internal" : "Tamu luar"}</Pill>
                <Pill tone="neutral">Tema {theme.name}</Pill>
                {template.modules.length > 0 && <Pill tone="neutral">{template.modules.length} bagian</Pill>}
              </div>
              {template.modules.length > 0 && <p className={css.modules}>{template.modules.map(key => sectionNames[key] ?? key).join(" · ")}</p>}
            </div>
          </li>;
        })}</ul>

        <details className={css.events} open={!!term || kind !== "all" || undefined}>
          <summary>
            <span><strong>{group.events.length} acara</strong>{hiddenHere > 0 && <> · {hiddenHere} disembunyikan</>}</span>
            {group.events.length > 0 && visibilityMigrated && <span className={css.bulk}>
              <button type="button" disabled={busy || hiddenHere === group.events.length} onClick={click => { click.preventDefault(); void setVisible(group.events.map(event => event.id), true); }}><EyeOff size={14} aria-hidden="true" /> Sembunyikan semua</button>
              <button type="button" disabled={busy || hiddenHere === 0} onClick={click => { click.preventDefault(); void setVisible(group.events.map(event => event.id), false); }}><Eye size={14} aria-hidden="true" /> Tampilkan semua</button>
            </span>}
          </summary>
          {list.length === 0 ? <p className="muted">{group.events.length ? "Tidak ada acara yang cocok dengan pencarian." : "Belum ada acara jenis ini."}</p>
            : <ul className={css.eventList}>{list.map(event => {
              const isHidden = hidden.has(event.id);
              return <li key={event.id} className={css.event} data-hidden={isHidden || undefined}>
                <div className={css.eventText}>
                  <a href={adminEventPath(event)} className={css.eventTitle}>{event.title}</a>
                  <span className={css.eventMeta}>
                    <Pill tone={statusTones[event.status]}>{statusLabels[event.status]}</Pill>
                    <span><CalendarDays size={13} aria-hidden="true" /> {event.starts_at ? formatDate(event.starts_at, event.timezone) : "Tanggal belum diisi"}</span>
                    <span>disimpan {formatDateTime(event.updated_at)}</span>
                  </span>
                </div>
                <label className={css.switch}>
                  <input type="checkbox" role="switch" checked={!isHidden} disabled={busy || !visibilityMigrated} onChange={() => void setVisible([event.id], !isHidden)} aria-label={`Terlihat oleh admin: ${event.title}`} />
                  <span>{isHidden ? "Disembunyikan" : "Terlihat"}</span>
                </label>
              </li>;
            })}</ul>}
        </details>
      </Card>;
    })}
  </div>;
}
