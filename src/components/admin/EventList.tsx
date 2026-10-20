"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink, Notice } from "@/components/ui";
import { Archive, Building2, CalendarDays, CalendarCheck, EyeOff, Globe, Hourglass, Images, Pencil } from "lucide-react";
import type { EventPhase, EventRecord, EventStatus } from "@/lib/types";
import { themeDefinition } from "@/lib/themes";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { tzLabel } from "@/lib/timezones";
import { adminRequest, errorMessage } from "./api";
import { CreateEventDialog } from "./CreateEventDialog";
import type { AdminModule } from "@/lib/admin-modules";
import styles from "./admin.module.css";

const statuses: Record<EventStatus, string> = { draft: "Draft", published: "Publik via tautan", archived: "Diarsipkan" };
const kinds = { kunjungan: "Kunjungan", acara: "Acara", program: "Program" } as const;
/** Where an event stands, in the stage colours of the editor menu. */
function stageBadge(event: EventRecord, phase: EventPhase | undefined) {
  if (event.status === "draft") return { label: "Draf", stage: "settings", Icon: Pencil };
  if (event.status === "archived") return { label: "Arsip", stage: "settings", Icon: Archive };
  if (phase === "day") return { label: "Hari H", stage: "day", Icon: CalendarCheck };
  if (phase === "after") return { label: "Sesudah acara", stage: "after", Icon: Images };
  return { label: "Sebelum acara", stage: "guest", Icon: Hourglass };
}
/** `superAdmin` is set only for a super admin session: hidden events then carry a label. */
export function EventList({ events, featuredId, phases = {}, superAdmin, disabledModules = [] }: { events: EventRecord[]; featuredId: string | null; phases?: Record<string, EventPhase>; superAdmin?: { hiddenIds: string[]; migrated: boolean }; disabledModules?: AdminModule[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [featured, setFeatured] = useState(featuredId);
  const [creating, setCreating] = useState(false);
  const hidden = new Set(superAdmin?.hiddenIds ?? []);
  async function feature(event: EventRecord) {
    if (busy || event.status !== "published" || featured === event.id) return;
    const current = events.find(item => item.id === featured);
    if (!window.confirm(current ? `Tayangkan “${event.title}” di halaman utama menggantikan “${current.title}”? Tautan acara lama tetap aktif.` : `Tayangkan “${event.title}” di halaman utama?`)) return;
    setBusy(event.id); setError("");
    try {
      await adminRequest<{ eventId: string }>("/api/admin/featured", { method: "PUT", body: JSON.stringify({ eventId: event.id }) });
      setFeatured(event.id); router.refresh();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(null); }
  }
  async function duplicate(duplicateId: string) {
    if (busy) return;
    setBusy(duplicateId); setError("");
    try {
      const result = await adminRequest<EventRecord>("/api/admin/events", { method: "POST", body: JSON.stringify({ duplicateId }) });
      if (!result.data) throw new Error("Missing event");
      router.push(`/admin/events/${result.data.id}`); router.refresh();
    } catch (err) { setError(errorMessage(err)); setBusy(null); }
  }
  return <div className="stack" aria-busy={!!busy}>
    <div className={styles.itemHeader}><p>{events.length} acara. Duplikasi hanya menyalin konten sebagai draft, bukan jawaban tamu.</p><Button type="button" disabled={!!busy} onClick={() => setCreating(true)}>Buat acara</Button></div>
    {creating && <CreateEventDialog events={events} disabledModules={disabledModules} onClose={() => setCreating(false)} />}
    {superAdmin && <Notice>{hidden.size ? `${hidden.size} acara disembunyikan dari admin biasa. ` : ""}Atur acara yang terlihat oleh admin biasa di <a href="/admin/super">Dashboard super admin</a>.</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {!events.length ? <Notice>Belum ada acara. Buat draft pertama untuk meninjau dan menyunting konten sebelum publikasi.</Notice> : <ul className={styles.eventList}>
      {events.map(event => {
        const badge = stageBadge(event, phases[event.id]);
        const theme = themeDefinition(event.theme?.key ?? "werkudara");
        return <li key={event.id} className={`${styles.eventCard} ${styles[`stage_${badge.stage}`]}`}>
        <div className={styles.cardBadges}>
          <span className={styles.stageBadge}><badge.Icon size={14} aria-hidden="true" /> {badge.label}</span>
          {hidden.has(event.id) && <span className={`${styles.status} ${styles.statusHidden}`}><EyeOff size={13} aria-hidden="true" /> Tersembunyi dari admin</span>}
          {event.id === featured && event.status === "published" ? <span className={`${styles.status} ${styles.statusLive}`}><span className={styles.statusDot} aria-hidden="true" />Tayang di halaman utama</span> : <span className={styles.status}>{statuses[event.status]}</span>}
        </div>
        <h2>{event.title}</h2>
        <p className={styles.eventWhen}><CalendarDays size={16} aria-hidden="true" /> {formatDate(event.starts_at, event.timezone)} · {formatTime(event.starts_at, event.timezone)} {tzLabel(event.timezone)}</p>
        <p className={styles.eventChips}>
          <span>{kinds[event.event_kind ?? "acara"]}</span>
          <span>{event.audience === "internal" ? <Building2 size={13} aria-hidden="true" /> : <Globe size={13} aria-hidden="true" />} {event.audience === "internal" ? "Internal" : "Eksternal"}</span>
          <span><span className={styles.themeDot} style={{ background: theme.tokens.hero }} aria-hidden="true" /> {theme.name}</span>
        </p>
        <p className={styles.eventSlug}>/e/{event.slug}</p>
        {/* Housekeeping dates sit below a rule: useful for choosing between events, but
            never competing with the event's own date. */}
        <dl className={styles.eventMeta}>
          <div><dt>Dibuat</dt><dd>{formatDate(event.created_at)}</dd></div>
          <div><dt>Terakhir disimpan</dt><dd>{formatDateTime(event.updated_at)}</dd></div>
        </dl>
        <div className={styles.actions}><ButtonLink href={`/admin/events/${event.id}`}>Kelola acara</ButtonLink>{event.status === "published" && event.id !== featured && <Button type="button" variant="secondary" disabled={!!busy} onClick={() => feature(event)}>{busy === event.id ? "Menayangkan…" : "Tayangkan"}</Button>}<Button type="button" variant="secondary" disabled={!!busy} onClick={() => duplicate(event.id)}>{busy === event.id ? "Menduplikasi…" : "Duplikasi ke draft"}</Button></div>
      </li>;
      })}
    </ul>}
  </div>;
}
