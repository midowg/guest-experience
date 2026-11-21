"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Copy, EyeOff, MoreHorizontal, Pencil, Plus, Search, Settings2, Star, StarOff, Trash2, X } from "lucide-react";
import { Notice } from "@/components/ui";
import type { EventKind, EventPhase, EventRecord, StaffMember } from "@/lib/types";
import { formatDate, formatTime } from "@/lib/format";
import { tzLabel } from "@/lib/timezones";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { CreateEventDialog } from "@/components/admin/events/CreateEventDialog";
import { DeleteEvent } from "@/components/admin/events/DeleteEvent";
import type { AdminModule } from "@/lib/admin-modules";
import type { TemplateKey } from "@/lib/event-templates";
import styles from "@/components/admin/admin.module.css";
import css from "./event-home.module.css";
import { adminEventPath, adminEventsApi, eventPath, PLACE_GUIDE_PATH } from "@/lib/routes";
import type { StandaloneApp } from "@/lib/server/standalone-apps";

/*
 * The admin's home, "Ringkas" (21 Nov 2026): the apps as a row of their own logos (the card opens the
 * app's admin, the arrow opens the app itself), then the events as one dense list, each with its main
 * photo: the row opens the editor, "Buka" the guest page, "⋯" the rarer actions.
 */

/** Each app's own logo (its launcher icon) when it has one; else its mark on its colour. */
const appLooks: Record<StandaloneApp["key"], { logo?: string; mark: string; tone: string }> = {
  wam: { logo: "/wam/icon-192.png", mark: "W", tone: "#1f4fd1" },
  wam_acara: { logo: "/wam/pegasus-jaringan-terang.svg", mark: "26", tone: "#0b1f4d" },
  hr: { logo: "/people/icon-192.png", mark: "P", tone: "#2f6feb" },
  booking: { mark: "B", tone: "#0d9488" },
  tv: { mark: "TV", tone: "#ea580c" },
  wellbeing: { logo: "/wlm/icon-192.png", mark: "WLM", tone: "#e0457b" },
};
const kinds: Record<EventKind, string> = { kunjungan: "Welcome", acara: "Acara", program: "Program", handbook: "Handbook", kartu: "Kartu", eguide: "E-Guide", csr: "Friday Sharing", panduan: "Panduan lokasi" };
/** A colour per kind, behind an event that has no photo yet. */
const kindTones: Record<EventKind, string> = { kunjungan: "#0d9488", acara: "#1f4fd1", program: "#0369a1", handbook: "#0284c7", kartu: "#b45309", eguide: "#15803d", csr: "#e0457b", panduan: "#475569" };

type Filter = "all" | "live" | "draft" | "archived";
/** Where an event stands, in one word, and the tone of its pill. */
function stage(event: EventRecord, phase: EventPhase | undefined): { label: string; tone: "ok" | "day" | "done" | "draft" | "muted" } {
  if (event.status === "draft") return { label: "Draf", tone: "draft" };
  if (event.status === "archived") return { label: "Arsip", tone: "muted" };
  if (event.event_kind === "panduan") return { label: "Tayang", tone: "ok" };
  if (phase === "day") return { label: "Hari H", tone: "day" };
  if (phase === "after") return { label: "Selesai", tone: "done" };
  return { label: "Akan datang", tone: "ok" };
}
const guestLabel = (event: EventRecord) => event.event_kind === "eguide" ? "E-Guide" : event.event_kind === "panduan" ? "panduan" : event.event_kind === "kunjungan" ? "halaman tamu" : "undangan";
const initials = (title: string) => title.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase();

/** An event's main photo, small; its kind's colour and initials when it has none. */
function Thumb({ event, className }: { event: EventRecord; className: string }) {
  const kind = event.event_kind ?? "acara";
  const small = event.hero?.srcset?.length ? [...event.hero.srcset].sort((a, b) => a.width - b.width).find(source => source.width >= 160)?.url ?? event.hero.url : event.hero?.url;
  return <span className={className} style={{ "--tone": kindTones[kind] } as CSSProperties} aria-hidden="true">
    {small ? <img src={small} alt="" loading="lazy" decoding="async" /> : <b>{initials(event.title)}</b>}
  </span>;
}

/**
 * The admin's home: apps, then events. `superAdmin` is set only for a super admin session: hidden
 * events then carry a label.
 */
export function EventList({ events, featuredId, phases = {}, superAdmin, disabledModules = [], templates, staff = [], apps = [], canCreate = true, account }: { account?: ReactNode; canCreate?: boolean; events: EventRecord[]; featuredId: string | null; phases?: Record<string, EventPhase>; superAdmin?: { hiddenIds: string[]; migrated: boolean }; disabledModules?: AdminModule[]; templates?: TemplateKey[]; staff?: StaffMember[]; apps?: StandaloneApp[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [featured, setFeatured] = useState(featuredId);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  // "Hapus" in a row's ⋯ menu opens the same typed confirmation as the editor's Hapus acara.
  const [deleting, setDeleting] = useState<EventRecord | null>(null);
  useEffect(() => {
    if (!deleting) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDeleting(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [deleting]);
  const hidden = new Set(superAdmin?.hiddenIds ?? []);
  // A row menu closes on a tap elsewhere or on Escape, like any other menu.
  useEffect(() => {
    const close = (target: EventTarget | null) => document.querySelectorAll<HTMLDetailsElement>("details[data-card-menu][open]").forEach(menu => { if (!(target instanceof Node && menu.contains(target))) menu.open = false; });
    const onClick = (e: MouseEvent) => close(e.target);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(null); };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("keydown", onKey); };
  }, []);

  async function setHomepage(event: EventRecord | null) {
    if (busy) return;
    const current = events.find(item => item.id === featured);
    const question = event
      ? current ? `Tayangkan “${event.title}” di halaman utama menggantikan “${current.title}”? Tautan acara lama tetap aktif.` : `Tayangkan “${event.title}” di halaman utama?`
      : `Turunkan “${current?.title ?? "acara"}” dari halaman utama? Tautan acaranya tetap aktif.`;
    if (!window.confirm(question)) return;
    setBusy(event?.id ?? featured); setError(""); setMessage("");
    try {
      const result = await adminRequest<{ eventId: string | null }>("/api/admin/featured", { method: "PUT", body: JSON.stringify({ eventId: event?.id ?? null }) });
      setFeatured(event?.id ?? null); setMessage(result.message); router.refresh();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(null); }
  }
  async function duplicate(duplicateId: string) {
    if (busy) return;
    setBusy(duplicateId); setError(""); setMessage("");
    try {
      const result = await adminRequest<EventRecord>(adminEventsApi, { method: "POST", body: JSON.stringify({ duplicateId }) });
      if (!result.data) throw new Error("Missing event");
      router.push(adminEventPath(result.data)); router.refresh();
    } catch (err) { setError(errorMessage(err)); setBusy(null); }
  }

  // Panduan lokasi has its own place: its fixed address, beside the standalone apps (10 Nov 2026).
  const guides = events.filter(event => event.event_kind === "panduan");
  const listed = events.filter(event => event.event_kind !== "panduan");
  // On air first (today, then the coming ones by date, then the finished ones), then drafts, then the archive.
  const ordered = useMemo(() => {
    const time = (event: EventRecord) => event.starts_at ? Date.parse(event.starts_at) : Infinity;
    const phaseOrder: Record<EventPhase, number> = { day: 0, before: 1, after: 2 };
    const onAir = listed.filter(event => event.status === "published").sort((a, b) => {
      const pa = phaseOrder[phases[a.id] ?? "before"], pb = phaseOrder[phases[b.id] ?? "before"];
      if (pa !== pb) return pa - pb;
      return pa === 2 ? time(b) - time(a) : time(a) - time(b);
    });
    return [...onAir, ...listed.filter(event => event.status === "draft"), ...listed.filter(event => event.status === "archived")];
  }, [listed, phases]);
  const counts = { all: listed.length, live: listed.filter(e => e.status === "published").length, draft: listed.filter(e => e.status === "draft").length, archived: listed.filter(e => e.status === "archived").length };
  const term = query.trim().toLowerCase();
  const matches = (text: string) => !term || text.toLowerCase().includes(term);
  const shownEvents = ordered.filter(event => (filter === "all" ? event.status !== "archived" : filter === "live" ? event.status === "published" : event.status === filter) && matches(event.title));
  const shownApps = apps.filter(app => matches(app.name));
  const shownGuides = guides.filter(guide => matches(guide.title));

  const when = (event: EventRecord) => event.starts_at ? `${formatDate(event.starts_at, event.timezone)} · ${formatTime(event.starts_at, event.timezone)} ${tzLabel(event.timezone)}` : "Tanggal belum diisi";

  const appChip = (app: StandaloneApp) => {
    const look = appLooks[app.key];
    return <li key={app.key} className={css.app}>
      <span className={css.appIcon} style={{ "--tone": look.tone } as CSSProperties} aria-hidden="true">
        {look.logo ? <img src={look.logo} alt="" /> : <b data-long={look.mark.length > 2 || undefined}>{look.mark}</b>}
      </span>
      <span className={css.appText}>
        <a href={app.manage.href} className={css.appMain} aria-label={`${app.manage.label}: ${app.name}`}>{app.name}</a>
        {app.waiting ? <a href={app.waiting.href} className={css.waiting}>{app.waiting.label}</a> : <small>{app.status}</small>}
      </span>
      {app.open && <a href={app.open.href} target="_blank" rel="noopener noreferrer" className={css.open} aria-label={`${app.open.label} ${app.name} (tab baru)`} title={app.open.label}><ArrowUpRight size={16} aria-hidden="true" /></a>}
    </li>;
  };
  const guideChip = (guide: EventRecord) => <li key={guide.id} className={css.app}>
    <Thumb event={guide} className={css.appPhoto} />
    <span className={css.appText}>
      <a href={adminEventPath(guide)} className={css.appMain} aria-label={`Kelola ${guide.title}`}>{guide.title}</a>
      <small>{guide.status === "published" ? PLACE_GUIDE_PATH : "Draf"}</small>
    </span>
    {guide.status === "published" && <a href={eventPath(guide)} target="_blank" rel="noopener noreferrer" className={css.open} aria-label={`Lihat panduan ${guide.title} (tab baru)`} title="Lihat panduan"><ArrowUpRight size={16} aria-hidden="true" /></a>}
  </li>;

  const row = (event: EventRecord) => {
    const where = stage(event, phases[event.id]);
    const live = event.id === featured && event.status === "published";
    return <li key={event.id} className={css.row}>
      <Thumb event={event} className={css.thumb} />
      <span className={css.rowText}>
        <a href={adminEventPath(event)} className={css.rowLink}>{event.title}</a>
        <small>
          {kinds[event.event_kind ?? "acara"]}
          <span className={css.stageInline}>· {where.label}</span>
          {live && <span className={css.tag}><Star size={11} aria-hidden="true" /> Di halaman utama</span>}
          {hidden.has(event.id) && <span className={css.tag}><EyeOff size={11} aria-hidden="true" /> Tersembunyi</span>}
        </small>
      </span>
      <span className={css.when}>{when(event)}</span>
      <span className={css.pill} data-tone={where.tone}>{where.label}</span>
      <span className={css.actions}>
        {event.status === "published"
          ? <a href={eventPath(event)} target="_blank" rel="noopener noreferrer" className={css.pageBtn} aria-label={`Buka ${guestLabel(event)} ${event.title} (tab baru)`}><ArrowUpRight size={15} aria-hidden="true" /><span>Buka</span></a>
          : <a href={adminEventPath(event)} className={css.pageBtn} aria-label={`Edit dan pratinjau ${event.title}`}><Pencil size={14} aria-hidden="true" /><span>Edit</span></a>}
        <details className={css.menu} data-card-menu>
          <summary aria-label={`Aksi lain untuk ${event.title}`}><MoreHorizontal size={18} aria-hidden="true" /></summary>
          <div className={`${styles.cardMenuList} ${css.menuList}`} role="group" aria-label={`Aksi lain untuk ${event.title}`}>
            {canCreate && <button type="button" disabled={!!busy} onClick={() => duplicate(event.id)}><Copy size={16} aria-hidden="true" /> {busy === event.id ? "Menyalin…" : "Duplikasi"}</button>}
            {/* An event shown on the front page before it stopped featuring any can still be taken down. */}
            {live && <button type="button" disabled={!!busy} onClick={() => setHomepage(null)}><StarOff size={16} aria-hidden="true" /> Turunkan dari halaman utama</button>}
            <button type="button" className={styles.cardMenuDanger} disabled={!!busy} onClick={click => { click.currentTarget.closest("details")?.removeAttribute("open"); setDeleting(event); }}><Trash2 size={16} aria-hidden="true" /> Hapus</button>
          </div>
        </details>
      </span>
    </li>;
  };

  const filters: { key: Filter; label: string }[] = [{ key: "all", label: "Semua" }, { key: "live", label: "Tayang" }, { key: "draft", label: "Draf" }, { key: "archived", label: "Arsip" }];
  return <div className={css.home} aria-busy={!!busy}>
    <header className={css.top}>
      <h1>Beranda</h1>
      <div className={css.topTools}>
        <label className={css.search}><Search size={16} aria-hidden="true" /><input type="search" value={query} onChange={change => setQuery(change.target.value)} placeholder="Cari acara atau aplikasi" aria-label="Cari acara atau aplikasi" /></label>
        {account}
      </div>
    </header>

    {deleting && <div className={styles.panelLayer}>
      <div className={styles.panelBackdrop} onClick={() => setDeleting(null)} aria-hidden="true" />
      <div className={styles.confirmDialog} role="dialog" aria-modal="true" aria-labelledby="delete-title">
        <header className={styles.wizardHeader}>
          <div><p className={styles.wizardStep}>Hapus acara</p><h2 id="delete-title">{deleting.title}</h2></div>
          <button type="button" className={styles.panelClose} onClick={() => setDeleting(null)} aria-label="Tutup"><X size={18} aria-hidden="true" /></button>
        </header>
        <div className={styles.confirmBody}><DeleteEvent event={deleting} isFeatured={deleting.id === featured} bare startOpen onCancel={() => setDeleting(null)} /></div>
      </div>
    </div>}
    {creating && <CreateEventDialog events={events} disabledModules={disabledModules} templates={templates} canStartBlank={!!superAdmin} staff={staff} onClose={() => setCreating(false)} />}

    {(apps.length > 0 || guides.length > 0) && <section className={css.block} aria-labelledby="apps-title">
      <div className={css.head}>
        <h2 id="apps-title" className={css.h2}>Aplikasi <span>{apps.length + guides.length}</span></h2>
        <p className={css.hint}><Settings2 size={14} aria-hidden="true" /> Klik untuk mengelola · <ArrowUpRight size={14} aria-hidden="true" /> buka aplikasinya</p>
      </div>
      {shownApps.length + shownGuides.length > 0
        ? <ul className={css.apps}>{shownApps.map(appChip)}{shownGuides.map(guideChip)}</ul>
        : <p className={css.none}>Tidak ada aplikasi yang cocok.</p>}
    </section>}

    <section className={css.block} aria-labelledby="events-title">
      <div className={css.head}>
        <div className={css.headLeft}>
          <h2 id="events-title" className={css.h2}>Acara <span>{listed.length}</span></h2>
          {listed.length > 0 && <div className={css.chips} role="group" aria-label="Saring acara">{filters.map(item =>
            <button key={item.key} type="button" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>{item.label} <span>{counts[item.key]}</span></button>)}</div>}
        </div>
        {canCreate && <button type="button" className={css.create} disabled={!!busy} onClick={() => setCreating(true)}><Plus size={18} aria-hidden="true" /> Buat acara</button>}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <p role="status" className={styles.guestMessage}>{message}</p>}
      {!listed.length ? <div className={styles.emptyList}>
        <p>{canCreate ? "Belum ada acara." : "Belum ada acara yang bisa Anda buka. Minta super admin memberi akses."}</p>
        {canCreate && <button type="button" className={css.create} onClick={() => setCreating(true)}><Plus size={18} aria-hidden="true" /> Buat acara pertama</button>}
      </div> : shownEvents.length === 0
        ? <p className={css.none}>{term ? "Tidak ada acara yang cocok dengan pencarian." : filter === "archived" ? "Belum ada acara di arsip." : "Tidak ada acara di sini."}</p>
        : <ul className={css.rows} aria-label="Daftar acara">{shownEvents.map(row)}</ul>}
      {filter === "all" && !term && counts.archived > 0 && <button type="button" className={css.more} onClick={() => setFilter("archived")}>Lihat {counts.archived} acara di arsip</button>}
    </section>
  </div>;
}
