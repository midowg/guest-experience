"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, CalendarCheck, CalendarDays, Copy, ExternalLink, EyeOff, Hourglass, Images, MoreHorizontal, Pencil, Plus, Star, StarOff, Globe, MapPinned, Trash2, X } from "lucide-react";
import { Button, ButtonLink, Notice } from "@/components/ui";
import type { EventPhase, EventRecord, StaffMember } from "@/lib/types";
import { formatDate, formatTime } from "@/lib/format";
import { tzLabel } from "@/lib/timezones";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { CreateEventDialog } from "@/components/admin/events/CreateEventDialog";
import { DeleteEvent } from "@/components/admin/events/DeleteEvent";
import type { AdminModule } from "@/lib/admin-modules";
import type { TemplateKey } from "@/lib/event-templates";
import styles from "@/components/admin/admin.module.css";
import { adminEventPath, adminEventsApi, eventPath, PLACE_GUIDE_PATH } from "@/lib/routes";

const kinds = { kunjungan: "Welcome", acara: "Acara", program: "Program", kartu: "Kartu", eguide: "E-Guide", csr: "Friday Sharing (CSR)", panduan: "Panduan lokasi" } as const;
/** One word for where an event stands, in the stage colours of the editor. */
function stageBadge(event: EventRecord, phase: EventPhase | undefined) {
  if (event.status === "draft") return { label: "Draf", stage: "settings", Icon: Pencil };
  if (event.status === "archived") return { label: "Arsip", stage: "settings", Icon: Archive };
  // A Panduan lokasi has no date to wait for: once published it is simply on.
  if (event.event_kind === "panduan") return { label: "Tayang", stage: "guest", Icon: Globe };
  if (phase === "day") return { label: "Hari H", stage: "day", Icon: CalendarCheck };
  if (phase === "after") return { label: "Selesai", stage: "after", Icon: Images };
  return { label: "Akan datang", stage: "guest", Icon: Hourglass };
}

/**
 * The event list kept to what an admin scans for: status, title, date. Everything else lives in
 * the editor, and the rarer actions sit in each card's "⋯" menu (meeting of 20 Oct).
 * `superAdmin` is set only for a super admin session: hidden events then carry a label.
 */
export function EventList({ events, featuredId, phases = {}, superAdmin, disabledModules = [], templates, staff = [] }: { events: EventRecord[]; featuredId: string | null; phases?: Record<string, EventPhase>; superAdmin?: { hiddenIds: string[]; migrated: boolean }; disabledModules?: AdminModule[]; templates?: TemplateKey[]; staff?: StaffMember[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [featured, setFeatured] = useState(featuredId);
  const [creating, setCreating] = useState(false);
  // "Hapus" in a card's ⋯ menu opens the same typed confirmation as the editor's Hapus acara.
  const [deleting, setDeleting] = useState<EventRecord | null>(null);
  useEffect(() => {
    if (!deleting) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDeleting(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [deleting]);
  const hidden = new Set(superAdmin?.hiddenIds ?? []);
  // A card menu closes on a tap elsewhere or on Escape, like any other menu.
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

  // Panduan lokasi has its own place: its fixed address, apart from the events (Rapat Panitia, visits…).
  const guides = events.filter(event => event.event_kind === "panduan");
  const listed = events.filter(event => event.event_kind !== "panduan");
  // The events by where they stand: on air first (today, then the coming ones by date, then the
  // finished ones), then drafts, then the archive, folded away.
  const time = (event: EventRecord) => event.starts_at ? Date.parse(event.starts_at) : Infinity;
  const phaseOrder: Record<EventPhase, number> = { day: 0, before: 1, after: 2 };
  const onAir = listed.filter(event => event.status === "published").sort((a, b) => {
    const pa = phaseOrder[phases[a.id] ?? "before"], pb = phaseOrder[phases[b.id] ?? "before"];
    if (pa !== pb) return pa - pb;
    return pa === 2 ? time(b) - time(a) : time(a) - time(b);
  });
  const drafts = listed.filter(event => event.status === "draft");
  const archived = listed.filter(event => event.status === "archived");
  const group = (id: string, title: string, items: EventRecord[], hint: string) => items.length > 0 && <section className="stack" aria-labelledby={id}>
    <h2 id={id} className={styles.groupTitle}>{title} <span>{items.length}</span></h2>
    <p className="field-hint">{hint}</p>
    <ul className={styles.eventList}>{items.map(card)}</ul>
  </section>;
  const card = (event: EventRecord) => {
    const badge = stageBadge(event, phases[event.id]);
    const live = event.id === featured && event.status === "published";
    return <li key={event.id} className={`${styles.eventCard} ${styles[`stage_${badge.stage}`]}`}>
      <div className={styles.cardBadges}>
        <span className={styles.stageBadge}><badge.Icon size={14} aria-hidden="true" /> {badge.label}</span>
        {live && <span className={styles.liveBadge}><Star size={12} aria-hidden="true" /> Di halaman utama</span>}
        {hidden.has(event.id) && <span className={styles.liveBadge}><EyeOff size={12} aria-hidden="true" /> Tersembunyi</span>}
      </div>
      <h2><a href={adminEventPath(event)} className={styles.cardLink}>{event.title}</a></h2>
      <p className={styles.eventWhen}>{event.event_kind === "panduan" ? <><Globe size={16} aria-hidden="true" /> {PLACE_GUIDE_PATH}</> : <><CalendarDays size={16} aria-hidden="true" /> {event.starts_at ? `${formatDate(event.starts_at, event.timezone)} · ${formatTime(event.starts_at, event.timezone)} ${tzLabel(event.timezone)}` : "Tanggal belum diisi"}</>}</p>
      <p className={styles.eventKind}>{kinds[event.event_kind ?? "acara"]}</p>
      <div className={styles.cardFooter}>
        <ButtonLink href={adminEventPath(event)}>Buka</ButtonLink>
        <details className={styles.cardMenu} data-card-menu>
          <summary aria-label={`Aksi lain untuk ${event.title}`}><MoreHorizontal size={18} aria-hidden="true" /></summary>
          <div className={styles.cardMenuList} role="group" aria-label={`Aksi lain untuk ${event.title}`}>
            {event.status === "published" && <a href={eventPath(event)} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" /> {event.event_kind === "eguide" ? "Lihat E-Guide" : event.event_kind === "panduan" ? "Lihat panduan" : event.event_kind === "kunjungan" ? "Lihat halaman tamu" : "Lihat undangan"}<span className="sr-only"> (tab baru)</span></a>}
            <button type="button" disabled={!!busy} onClick={() => duplicate(event.id)}><Copy size={16} aria-hidden="true" /> {busy === event.id ? "Menyalin…" : "Duplikasi"}</button>
            {/* An event shown on the front page before it stopped featuring any can still be taken down. */}
            {live && <button type="button" disabled={!!busy} onClick={() => setHomepage(null)}><StarOff size={16} aria-hidden="true" /> Turunkan dari halaman utama</button>}
            <button type="button" className={styles.cardMenuDanger} disabled={!!busy} onClick={click => { click.currentTarget.closest("details")?.removeAttribute("open"); setDeleting(event); }}><Trash2 size={16} aria-hidden="true" /> Hapus</button>
          </div>
        </details>
      </div>
    </li>;
  };

  return <div className="stack" aria-busy={!!busy}>
    <div className={styles.listHeader}>
      <h1 className={styles.listTitle}>Acara <span>{listed.length}</span></h1>
      <Button type="button" disabled={!!busy} onClick={() => setCreating(true)}><Plus size={18} aria-hidden="true" /> Buat acara</Button>
    </div>
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
    {error && <Notice tone="error">{error}</Notice>}
    {message && <p role="status" className={styles.guestMessage}>{message}</p>}
    {!listed.length ? <div className={styles.emptyList}>
      <p>Belum ada acara.</p>
      <Button type="button" onClick={() => setCreating(true)}><Plus size={18} aria-hidden="true" /> Buat acara pertama</Button>
    </div> : <>
      {group("group-live", "Tayang", onAir, "Sudah terbit dan bisa dibuka tamu lewat tautannya: hari ini dulu, lalu yang akan datang, lalu yang sudah selesai.")}
      {group("group-draft", "Draf", drafts, "Belum terbit. Tamu belum bisa membukanya.")}
      {archived.length > 0 && <details className={styles.groupArchive}>
        <summary><span className={styles.groupTitle}>Arsip <span>{archived.length}</span></span></summary>
        <p className="field-hint">Acara yang disimpan untuk catatan. Tamu tidak bisa membukanya lagi.</p>
        <ul className={styles.eventList}>{archived.map(card)}</ul>
      </details>}
    </>}
    {guides.length > 0 && <section className="stack" aria-labelledby="guides-title">
      <h2 id="guides-title" className={styles.listTitle}><MapPinned size={22} aria-hidden="true" /> Your Visit <span>{guides.length}</span></h2>
      <p className="field-hint">Panduan lokasi untuk umum, di alamat tetap <strong>{PLACE_GUIDE_PATH}</strong>. Terpisah dari acara dan kunjungan; yang tayang adalah panduan terbaru yang terbit.</p>
      <ul className={styles.eventList}>{guides.map(card)}</ul>
    </section>}
  </div>;
}
