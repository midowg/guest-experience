import type { CSSProperties } from "react";
import { ArrowLeft, ArrowUpRight, ClipboardCheck, HandHeart, Images, Mail, MessageSquare, Pencil, ScanLine, Split, UtensilsCrossed, type LucideIcon } from "lucide-react";
import type { EventKind, EventRecord } from "@/lib/types";
import { currentPhase } from "@/lib/event-phase";
import { formatDateTime } from "@/lib/format";
import { ADMIN_HOME, type AdminTab } from "@/lib/routes";
import css from "./event-header.module.css";

/*
 * One head for every page of an event (21 Nov 2026, with the admin's "Ringkas" home): back to
 * Beranda, the event's main photo small, its title, kind, where it stands and when it was saved,
 * the way to the guest page, and the event's pages side by side as tabs.
 */
export type EventTab = { tab: AdminTab; label: string; href: string; badge?: string };

const icons: Partial<Record<AdminTab, LucideIcon>> = {
  edit: Pencil, invitations: Mail, responses: ClipboardCheck, checkin: ScanLine, beo: UtensilsCrossed, gallery: Images, feedback: MessageSquare, donations: HandHeart, "donations-split": Split,
};
const kinds: Record<EventKind, string> = { kunjungan: "Welcome", acara: "Acara", program: "Program", handbook: "Handbook", kartu: "Kartu", eguide: "E-Guide", csr: "Friday Sharing", panduan: "Panduan lokasi" };
const kindTones: Record<EventKind, string> = { kunjungan: "#0d9488", acara: "#1f4fd1", program: "#0369a1", handbook: "#0284c7", kartu: "#b45309", eguide: "#15803d", csr: "#e0457b", panduan: "#475569" };

function stage(event: EventRecord): { label: string; tone: string } {
  if (event.status === "draft") return { label: "Draf", tone: "draft" };
  if (event.status === "archived") return { label: "Arsip", tone: "muted" };
  if (event.event_kind === "panduan") return { label: "Tayang", tone: "ok" };
  const phase = currentPhase(event);
  return phase === "day" ? { label: "Hari H", tone: "day" } : phase === "after" ? { label: "Selesai", tone: "done" } : { label: "Akan datang", tone: "ok" };
}

export function EventHeader({ event, tabs, current, publicHref, publicLabel }: { event: EventRecord; tabs: EventTab[]; current: AdminTab; publicHref?: string; publicLabel: string }) {
  const kind = event.event_kind ?? "acara";
  const where = stage(event);
  const photo = event.hero?.srcset?.length ? [...event.hero.srcset].sort((a, b) => a.width - b.width).find(source => source.width >= 240)?.url ?? event.hero.url : event.hero?.url;
  const initials = event.title.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  return <header className={css.head}>
    <a href={ADMIN_HOME} className={css.back}><ArrowLeft size={16} aria-hidden="true" /> Beranda</a>
    <div className={css.main}>
      <span className={css.photo} style={{ "--tone": kindTones[kind] } as CSSProperties} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo ? <img src={photo} alt="" /> : <b>{initials}</b>}
      </span>
      <div className={css.text}>
        <h1>{event.title}</h1>
        <p className={css.meta}>
          <span>{kinds[kind]}</span>
          <span className={css.pill} data-tone={where.tone}>{where.label}</span>
          <span>Disimpan {formatDateTime(event.updated_at)}</span>
        </p>
      </div>
      {publicHref
        ? <a href={publicHref} target="_blank" rel="noopener noreferrer" className={css.open}><ArrowUpRight size={16} aria-hidden="true" /> {publicLabel}<span className="sr-only"> (tab baru)</span></a>
        : <span className={css.unpublished}>Belum terbit</span>}
    </div>
    {tabs.length > 1 && <nav className={css.tabs} aria-label="Halaman acara">
      <ul>{tabs.map(page => {
        const Icon = icons[page.tab] ?? Pencil;
        return <li key={page.tab}><a href={page.href} aria-current={page.tab === current ? "page" : undefined}>
          <Icon size={16} aria-hidden="true" /> {page.label}{page.badge && <span className={css.badge}>{page.badge}</span>}
        </a></li>;
      })}</ul>
    </nav>}
  </header>;
}
