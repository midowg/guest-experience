"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Activity, CalendarCheck, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, Dumbbell, ExternalLink, FileSpreadsheet, ImageOff, Keyboard, Layers, LayoutGrid, List, MoreHorizontal, Pencil, Play, SlidersHorizontal, Trash2, Undo2, X } from "lucide-react";
import { Avatar, buttonClass, ConsoleButton, PageHeader, Pill, SearchField, useStoredValue } from "@/components/console";
import { errorMessage } from "@/components/admin/shared/api";
import { SkeletonRows } from "@/components/app-shell/Panel";
import { revalidate, setResource, useResource } from "@/components/app-shell/resource";
import { useToast } from "@/components/app-shell/Toast";
import { wellbeingAdminApi } from "@/lib/routes";
import { isVideoProof, rejectReasons, wibToday, type ReviewInput } from "@/lib/wellbeing/rules";
import type { WbActivity, WbActivityPage, WbCheckResult } from "@/lib/wellbeing/types";
import { dayLabel, points, send, wb, type ActivityQuery } from "./api";
import { DimensionPill, Empty, LoadError, Refreshing, WaitingMigration } from "./parts";
import { useWbActions } from "./WellbeingAdmin";
import css from "./wellbeing-admin.module.css";

/*
 * Periksa (16 Nov 2026): every activity already counts; here an admin looks at the proof. Oke marks
 * it checked, Ubah poin sets other points, Tolak counts nothing; the employee reads the reason.
 * Each action happens at once with Urungkan in the toast.
 *
 * Many at once (17 Nov 2026): tick (or X, or Pilih semua), then Konfirmasi marks every ticked one
 * that is not yet checked as checked (Urungkan sets them back), and Unduh Excel exports the ticked ones.
 *
 * Tampilan (18 Nov 2026): Kartu (a grid, every card the same build: the proof photo on the right,
 * points and buttons at the bottom) or Daftar (one row each, icon buttons), remembered on this
 * device. Status as tabs with their count, Jenis in a Filter menu. The keyboard shortcuts live
 * behind the Pintasan button (or ?), shown only where there is a keyboard and a mouse.
 */

type View = "kartu" | "daftar";
type Kind = ActivityQuery["kind"];
type Status = ActivityQuery["filter"];

const KINDS: readonly { value: Kind; label: string; icon: ReactNode }[] = [
  { value: "all", label: "Semua jenis", icon: <Layers size={18} aria-hidden="true" /> },
  { value: "daily", label: "Harian", icon: <CalendarCheck size={18} aria-hidden="true" /> },
  { value: "sport", label: "Olahraga", icon: <Dumbbell size={18} aria-hidden="true" /> },
  { value: "strava", label: "Strava", icon: <Activity size={18} aria-hidden="true" /> },
];

export const SHORTCUTS: readonly (readonly [string[], string])[] = [
  [["O"], "Oke, tandai sudah diperiksa"],
  [["U"], "Ubah poin"],
  [["T"], "Tolak"],
  [["X"], "Pilih atau batal pilih"],
  [["J", "↓"], "Aktivitas berikutnya"],
  [["K", "↑"], "Aktivitas sebelumnya"],
  [["?"], "Buka daftar pintasan ini"],
];

const stateOf = (item: WbActivity): ReviewInput => ({ status: item.status, points: item.points, reason: item.reason, checked: item.checked });
const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

export function ReviewView() {
  const [query, setQuery] = useState<ActivityQuery>({ filter: "unchecked", kind: "all", q: "" });
  const [search, setSearch] = useState("");
  useEffect(() => { const timer = setTimeout(() => setQuery(current => current.q === search ? current : { ...current, q: search }), 300); return () => clearTimeout(timer); }, [search]);
  const [view, setView] = useStoredValue<View>("console-view:wellbeing-periksa", "kartu", ["kartu", "daftar"]);
  const source = wb.activities(query);
  const page = useResource(source.key, source.fetch);
  const [more, setMore] = useState<{ key: string; items: WbActivity[]; next: string | null; loading: boolean }>({ key: "", items: [], next: null, loading: false });
  const toast = useToast();
  const { openExport } = useWbActions();
  const today = useMemo(() => wibToday(), []);
  const list = useRef<HTMLDivElement>(null);
  const shortcuts = useRef<HTMLDialogElement>(null);
  // Ticked items belong to one list: a new filter or search starts with none.
  const [picked, setPicked] = useState<{ key: string; ids: string[] }>({ key: "", ids: [] });
  const [confirming, setConfirming] = useState(false);

  // "?" anywhere on the page (not while typing) opens the shortcuts.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "?" || typing(event.target) || shortcuts.current?.open) return;
      event.preventDefault();
      shortcuts.current?.showModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const extra = more.key === source.key ? more : { key: source.key, items: [], next: page.data?.next ?? null, loading: false };
  const items = [...(page.data?.items ?? []), ...extra.items.filter(item => !(page.data?.items ?? []).some(first => first.id === item.id))];
  const next = extra.items.length ? extra.next : page.data?.next ?? null;
  const selected = picked.key === source.key ? picked.ids.filter(id => items.some(item => item.id === id)) : [];
  const toConfirm = items.filter(item => selected.includes(item.id) && !item.checked);
  const allPicked = items.length > 0 && selected.length === items.length;
  const toggle = (id: string) => setPicked({ key: source.key, ids: selected.includes(id) ? selected.filter(other => other !== id) : [...selected, id] });
  const pickAll = () => setPicked({ key: source.key, ids: allPicked ? [] : items.map(item => item.id) });

  function replace(updated: WbActivity) {
    const drop = (query.filter === "unchecked" && updated.checked) || (query.filter === "adjusted" && updated.status !== "adjusted") || (query.filter === "rejected" && updated.status !== "rejected");
    setResource<WbActivityPage>(source.key, current => current && { ...current, items: drop ? current.items.filter(item => item.id !== updated.id) : current.items.map(item => item.id === updated.id ? updated : item) });
    setMore(current => current.key === source.key ? { ...current, items: drop ? current.items.filter(item => item.id !== updated.id) : current.items.map(item => item.id === updated.id ? updated : item) } : current);
  }

  async function review(item: WbActivity, next: ReviewInput, silent = false) {
    const before = stateOf(item);
    try {
      const { data, message } = await send<WbActivity>(wellbeingAdminApi.activity(item.id), "PATCH", next);
      replace(data);
      revalidate("wb:overview"); revalidate("wb:people"); revalidate(`wb:person:${item.employeeId}`);
      if (!silent) toast({ message, tone: "ok", action: { label: "Urungkan", run: () => void undo(data, before) } });
    } catch (error) { toast({ message: errorMessage(error), tone: "bad" }); }
  }
  /** Hapus (25 Nov 2026): out of every list at once; no Urungkan (it is gone for good). */
  async function remove(item: WbActivity) {
    try {
      const { message } = await send(wellbeingAdminApi.activity(item.id), "DELETE");
      const gone = (list: WbActivity[]) => list.filter(other => other.id !== item.id);
      setResource<WbActivityPage>(source.key, current => current && { ...current, items: gone(current.items), unchecked: item.checked ? current.unchecked : Math.max(0, current.unchecked - 1) });
      setMore(current => current.key === source.key ? { ...current, items: gone(current.items) } : current);
      revalidate("wb:overview"); revalidate("wb:people"); revalidate(`wb:person:${item.employeeId}`);
      toast({ message, tone: "ok" });
    } catch (error) { toast({ message: errorMessage(error), tone: "bad" }); throw error; }
  }
  async function undo(item: WbActivity, previous: ReviewInput) {
    await review(item, previous, true);
    revalidate(source.key);
    toast({ message: "Dikembalikan seperti semula.", tone: "info" });
  }
  /** Konfirmasi: every ticked activity not yet checked becomes checked, at once; Urungkan sets exactly those back. */
  async function confirmPicked() {
    const ids = toConfirm.map(item => item.id);
    if (!ids.length || confirming) return;
    setConfirming(true);
    try {
      // The server takes 200 at a time; a bigger selection goes in parts, one answer for all.
      const done: string[] = [];
      for (let start = 0; start < ids.length; start += 200) done.push(...(await send<WbCheckResult>(wellbeingAdminApi.check, "POST", { ids: ids.slice(start, start + 200), checked: true })).data.changed);
      const message = done.length ? `${done.length} aktivitas ditandai sudah diperiksa.` : "Semua yang dipilih sudah diperiksa.";
      const changed = new Set(done);
      const mark = (item: WbActivity) => changed.has(item.id) ? { ...item, checked: true } : item;
      const keep = (item: WbActivity) => !(query.filter === "unchecked" && changed.has(item.id));
      setResource<WbActivityPage>(source.key, current => current && { ...current, items: current.items.filter(keep).map(mark), unchecked: Math.max(0, current.unchecked - changed.size) });
      setMore(current => current.key === source.key ? { ...current, items: current.items.filter(keep).map(mark) } : current);
      setPicked({ key: source.key, ids: [] });
      revalidate("wb:overview"); revalidate("wb:people");
      toast({ message, tone: "ok", action: done.length ? { label: "Urungkan", run: () => void undoConfirm(done) } : undefined });
    } catch (error) { toast({ message: errorMessage(error), tone: "bad" }); }
    finally { setConfirming(false); }
  }
  async function undoConfirm(ids: string[]) {
    try {
      for (let start = 0; start < ids.length; start += 200) await send<WbCheckResult>(wellbeingAdminApi.check, "POST", { ids: ids.slice(start, start + 200), checked: false });
      revalidate(source.key); revalidate("wb:overview"); revalidate("wb:people");
      toast({ message: "Dikembalikan ke belum diperiksa.", tone: "info" });
    } catch (error) { toast({ message: errorMessage(error), tone: "bad" }); }
  }

  async function loadMore() {
    if (!next) return;
    setMore({ ...extra, key: source.key, loading: true });
    try {
      const result = await wb.activities(query, next).fetch();
      setMore({ key: source.key, items: [...extra.items, ...result.items], next: result.next, loading: false });
    } catch (error) { setMore({ ...extra, key: source.key, loading: false }); toast({ message: errorMessage(error), tone: "bad" }); }
  }
  function move(from: HTMLElement, step: 1 | -1) {
    const cards = [...(list.current?.querySelectorAll<HTMLElement>("[data-card]") ?? [])];
    cards[cards.indexOf(from) + step]?.focus();
  }

  const unchecked = page.data?.unchecked;
  return <>
    <PageHeader title="Periksa" subtitle="Semua aktivitas sudah dihitung. Lihat buktinya; ubah poin atau tolak bila tidak sesuai."
      actions={<>
        <ConsoleButton className={css.keysButton} icon={<Keyboard size={18} aria-hidden="true" />} onClick={() => shortcuts.current?.showModal()} aria-keyshortcuts="?">Pintasan</ConsoleButton>
        <ConsoleButton icon={<FileSpreadsheet size={18} aria-hidden="true" />} onClick={() => openExport({ data: "activities", status: query.filter, kind: query.kind })}>Unduh Excel</ConsoleButton>
      </>} />
    <div className={css.reviewTools}>
      <StatusTabs value={query.filter} unchecked={unchecked} onChange={filter => setQuery(current => ({ ...current, filter }))} />
      <div className={css.reviewFind}>
        <SearchField label="Cari nama atau divisi" placeholder="Cari nama atau divisi" value={search} onChange={setSearch} />
        <KindMenu value={query.kind} onChange={kind => setQuery(current => ({ ...current, kind }))} />
        <ViewSwitch value={view} onChange={setView} />
      </div>
    </div>
    <Refreshing on={page.refreshing} />
    {page.data && !page.data.migrated && <WaitingMigration />}
    {page.error && !page.data ? <LoadError message={page.error} onRetry={() => void page.reload()} />
      : !page.data ? <SkeletonRows rows={6} />
      : !items.length ? <Empty title={query.filter === "unchecked" ? "Semua sudah diperiksa" : "Tidak ada aktivitas"}>
          {query.filter === "unchecked" ? "Aktivitas baru dari karyawan akan muncul di sini." : "Coba ubah saringan atau kata pencarian."}</Empty>
      : <>
          <div className={css.pickBar} data-active={selected.length > 0} role="region" aria-label="Pilihan">
            <label className={css.pickAll}><input type="checkbox" checked={allPicked} ref={element => { if (element) element.indeterminate = selected.length > 0 && !allPicked; }} onChange={pickAll} />
              {selected.length ? `${selected.length} dipilih` : `Pilih semua (${items.length})`}</label>
            {selected.length > 0 && <span className={css.pickActions}>
              <ConsoleButton onClick={() => setPicked({ key: source.key, ids: [] })}>Batal</ConsoleButton>
              <ConsoleButton icon={<FileSpreadsheet size={18} aria-hidden="true" />} onClick={() => openExport({ ids: selected })}>Unduh Excel</ConsoleButton>
              <ConsoleButton variant="primary" icon={<CheckCheck size={18} aria-hidden="true" />} disabled={!toConfirm.length || confirming} onClick={() => void confirmPicked()}
                title={toConfirm.length ? undefined : "Yang dipilih sudah diperiksa semua"}>{confirming ? "Menyimpan…" : `Konfirmasi ${toConfirm.length || ""}`.trim()}</ConsoleButton>
            </span>}
          </div>
          <div ref={list} className={view === "daftar" ? css.rows : css.cards} data-view={view}>
            {items.map(item => <ActivityItem key={item.id} layout={view} item={item} today={today} picked={selected.includes(item.id)} onPick={() => toggle(item.id)} onReview={next => review(item, next)} onDelete={() => remove(item)} onMove={move} />)}
          </div>
        </>}
    {next && <div className={css.more}><ConsoleButton onClick={() => void loadMore()} disabled={extra.loading}>{extra.loading ? "Memuat…" : "Muat lagi"}</ConsoleButton></div>}
    <ShortcutsDialog ref={shortcuts} />
  </>;
}

/** Status as tabs: the one shown is raised, Belum diperiksa carries its count. */
function StatusTabs({ value, unchecked, onChange }: { value: Status; unchecked?: number; onChange: (value: Status) => void }) {
  // On a phone "Belum diperiksa" shows as "Belum" (the rest stays for screen readers), so all four fit.
  const tabs: readonly { value: Status; label: string; more?: string; count?: number }[] = [
    { value: "unchecked", label: "Belum", more: " diperiksa", count: unchecked }, { value: "all", label: "Semua" },
    { value: "adjusted", label: "Diubah" }, { value: "rejected", label: "Ditolak" },
  ];
  return <div className={css.statusTabs} role="group" aria-label="Status">
    {tabs.map(tab => <button key={tab.value} type="button" className={css.statusTab} aria-pressed={tab.value === value} onClick={() => onChange(tab.value)}>
      <span>{tab.label}{tab.more && <span className={css.tabMore}>{tab.more}</span>}</span>{tab.count != null && <span className={css.statusCount} data-zero={tab.count === 0}>{tab.count}</span>}
    </button>)}
  </div>;
}

/**
 * Jenis in a menu behind one Filter button: the chosen kind is written on the button (with a dot
 * when it narrows the list). Arrow keys move in the menu, Esc or a click outside closes it.
 */
function KindMenu({ value, onChange }: { value: Kind; onChange: (value: Kind) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const current = KINDS.find(kind => kind.value === value) ?? KINDS[0];
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    box.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const options = [...(box.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const at = options.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); button.current?.focus(); }
    else if (event.key === "ArrowDown") { event.preventDefault(); options[(at + 1) % options.length]?.focus(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); options[(at - 1 + options.length) % options.length]?.focus(); }
    else if (event.key === "Tab") setOpen(false);
  }
  const choose = (kind: Kind) => { onChange(kind); setOpen(false); button.current?.focus(); };
  return <div className={css.menuBox} ref={box} onKeyDown={onKey}>
    <button ref={button} type="button" className={css.filterButton} data-on={value !== "all"} aria-haspopup="menu" aria-expanded={open}
      aria-label={`Filter jenis: ${current.label}`} onClick={() => setOpen(!open)}>
      <SlidersHorizontal size={18} aria-hidden="true" />
      <span className={css.filterLabel}>{value === "all" ? "Filter" : current.label}</span>
      {value !== "all" && <span className={css.filterDot} aria-hidden="true" />}
      <ChevronDown size={16} aria-hidden="true" className={css.filterChevron} />
    </button>
    {open && <div className={css.menu} role="menu" aria-label="Jenis aktivitas">
      <p className={css.menuTitle} aria-hidden="true">Jenis aktivitas</p>
      {KINDS.map(kind => <button key={kind.value} type="button" role="menuitemradio" aria-checked={kind.value === value} className={css.menuItem} onClick={() => choose(kind.value)}>
        <span className={css.menuIcon}>{kind.icon}</span><span>{kind.label}</span>{kind.value === value && <Check size={18} aria-hidden="true" className={css.menuCheck} />}
      </button>)}
    </div>}
  </div>;
}

/** Kartu or Daftar; on a phone only the icons, named for screen readers. */
function ViewSwitch({ value, onChange }: { value: View; onChange: (value: View) => void }) {
  const options: readonly { value: View; label: string; icon: ReactNode }[] = [
    { value: "kartu", label: "Kartu", icon: <LayoutGrid size={18} aria-hidden="true" /> },
    { value: "daftar", label: "Daftar", icon: <List size={18} aria-hidden="true" /> },
  ];
  return <div className={css.viewSwitch} role="group" aria-label="Tampilan">
    {options.map(option => <button key={option.value} type="button" aria-pressed={option.value === value} aria-label={option.label} title={option.label} onClick={() => onChange(option.value)}>
      {option.icon}<span className={css.viewLabel} aria-hidden="true">{option.label}</span>
    </button>)}
  </div>;
}

function ShortcutsDialog({ ref }: { ref: Ref<HTMLDialogElement> }) {
  return <dialog ref={ref} className={css.keysDialog} aria-labelledby="wb-keys-title" onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
    <div className={css.keysBody}>
      <header className={css.keysHead}>
        <span className={css.reportIcon}><Keyboard size={22} aria-hidden="true" /></span>
        <div><h2 id="wb-keys-title">Pintasan keyboard</h2><p>Klik satu aktivitas (atau pindah dengan Tab), lalu tekan tombolnya.</p></div>
      </header>
      <dl className={css.keysList}>
        {SHORTCUTS.map(([keys, what]) => <div key={what}>
          <dt>{keys.map((key, index) => <span key={key}>{index > 0 && <small>atau</small>}<kbd>{key}</kbd></span>)}</dt><dd>{what}</dd>
        </div>)}
      </dl>
      <form method="dialog" className={css.keysFoot}><ConsoleButton type="submit" variant="primary">Mengerti</ConsoleButton></form>
    </div>
  </dialog>;
}

/** Proofs the browser can show (storage addresses, or the preview's drawn samples); the rest are not yet viewable. */
const viewable = (photos: readonly string[]) => photos.filter(photo => /^(https?:\/\/|data:image\/)/.test(photo));

/**
 * The proofs: the first as a square (a video shows its first frame and a play mark), "+n" for the
 * rest; a tap opens all of them in the viewer. A dashed square without one.
 */
function Proof({ photos, size, onOpen }: { photos: readonly string[]; size: "md" | "sm"; onOpen: () => void }) {
  const links = viewable(photos);
  const icon = size === "sm" ? 16 : 20;
  if (!photos.length) return <span className={css.proof} data-size={size} data-empty="true" title="Tanpa foto bukti"><ImageOff size={icon} aria-hidden="true" /><span className="sr-only">Tanpa foto bukti</span></span>;
  if (!links.length) return <span className={css.proof} data-size={size} data-empty="true" title="Foto belum bisa ditampilkan"><ImageOff size={icon} aria-hidden="true" /><span className="sr-only">Foto belum bisa ditampilkan</span></span>;
  const first = links[0], video = isVideoProof(first);
  return <button type="button" className={css.proof} data-size={size} onClick={onOpen}
    aria-label={links.length > 1 ? `Lihat ${links.length} bukti` : `Lihat ${video ? "video" : "foto"} bukti`}>
    {video ? <video src={first} muted playsInline preload="metadata" aria-hidden="true" />
      // eslint-disable-next-line @next/next/no-img-element -- proof photos come from storage, any size
      : <img src={first} alt="" loading="lazy" />}
    {video && <span className={css.proofPlay} aria-hidden="true"><Play size={icon} fill="currentColor" /></span>}
    {links.length > 1 && <span className={css.proofMore} aria-hidden="true">+{links.length - 1}</span>}
  </button>;
}

/** All proofs of one activity, large, one at a time: ← → or the buttons to move, Esc to close, each also in a new tab. */
function ProofViewer({ proofs, start, onClose }: { proofs: readonly string[]; start: number; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState(start);
  // Opened with the focus on Tutup (not on the link), so Esc, Enter or ← → work at once.
  useEffect(() => { const dialog = ref.current; if (dialog && !dialog.open) dialog.showModal(); closer.current?.focus(); }, []);
  const url = proofs[at], video = isVideoProof(url), what = `${video ? "Video" : "Foto"} bukti ${at + 1} dari ${proofs.length}`;
  const move = (step: number) => setAt(current => (current + step + proofs.length) % proofs.length);
  return <dialog ref={ref} className={css.viewer} aria-label={what} onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
    onKeyDown={event => {
      if (proofs.length < 2) return;
      if (event.key === "ArrowRight") { event.preventDefault(); move(1); } else if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
    }}>
    <div className={css.viewerBody}>
      <header className={css.viewerHead}>
        <strong>{what}</strong>
        <a href={url} target="_blank" rel="noopener noreferrer" className={css.viewerLink}><ExternalLink size={16} aria-hidden="true" /><span>Buka di tab baru</span></a>
        <button ref={closer} type="button" className={css.viewerClose} onClick={() => ref.current?.close()} aria-label="Tutup"><X size={20} aria-hidden="true" /></button>
      </header>
      <div className={css.viewerStage}>
        {video ? <video key={url} src={url} controls playsInline preload="metadata" />
          // eslint-disable-next-line @next/next/no-img-element -- proof photos come from storage, any size
          : <img key={url} src={url} alt={what} />}
      </div>
      {proofs.length > 1 && <footer className={css.viewerNav}>
        <ConsoleButton icon={<ChevronLeft size={18} aria-hidden="true" />} onClick={() => move(-1)}>Sebelumnya</ConsoleButton>
        <span aria-hidden="true">{at + 1} / {proofs.length}</span>
        <ConsoleButton onClick={() => move(1)}>Berikutnya<ChevronRight size={18} aria-hidden="true" /></ConsoleButton>
      </footer>}
    </div>
  </dialog>;
}

/**
 * An item's rare actions (25 Nov 2026), as Admin's standard has them: behind ⋯, now only Hapus. Esc or a
 * click outside closes it.
 */
function ItemMenu({ label, onDelete }: { label: string; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    box.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <div className={css.menuBox} ref={box} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); button.current?.focus(); } else if (event.key === "Tab") setOpen(false); }}>
    <button ref={button} type="button" className={`${buttonClass()} ${css.moreButton}`} aria-label={`Lainnya untuk ${label}`} title="Lainnya" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
      <MoreHorizontal size={18} aria-hidden="true" /></button>
    {open && <div className={css.menu} role="menu" aria-label={`Lainnya untuk ${label}`}>
      <button type="button" role="menuitem" className={`${css.menuItem} ${css.menuDanger}`} onClick={() => { setOpen(false); onDelete(); }}>
        <span className={css.menuIcon}><Trash2 size={16} aria-hidden="true" /></span><span>Hapus aktivitas</span>
      </button>
    </div>}
  </div>;
}

function ActivityItem({ layout, item, today, picked, onPick, onReview, onDelete, onMove }: { layout: View; item: WbActivity; today: string; picked: boolean; onPick: () => void; onReview: (next: ReviewInput) => Promise<void>; onDelete: () => Promise<void>; onMove: (from: HTMLElement, step: 1 | -1) => void }) {
  const [mode, setMode] = useState<"view" | "adjust" | "reject" | "delete">("view");
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState(String(item.points));
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState("");
  const [viewing, setViewing] = useState<number | null>(null);

  async function act(next: ReviewInput) {
    setBusy(true); setProblem("");
    await onReview(next);
    setBusy(false); setMode("view");
  }
  function ok() { void act({ status: item.status, points: item.points, reason: item.reason, checked: true }); }
  const startAdjust = () => { setReason(""); setValue(String(item.points)); setMode("adjust"); };
  const startReject = () => { setReason(""); setMode("reject"); };
  function submitAdjust() {
    const next = Number(value);
    if (!Number.isInteger(next) || next < 0) return setProblem("Isi poin dengan angka 0 atau lebih.");
    if (!reason.trim()) return setProblem("Tulis alasannya; karyawan akan membacanya.");
    void act({ status: "adjusted", points: next, reason: reason.trim(), checked: true });
  }
  async function submitDelete() {
    setBusy(true); setProblem("");
    try { await onDelete(); } catch { setBusy(false); setMode("view"); }
  }
  function submitReject() {
    if (!reason.trim()) return setProblem("Pilih atau tulis alasannya.");
    void act({ status: "rejected", points: item.points, reason: reason.trim(), checked: true });
  }
  function onKey(event: KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || busy) return;
    const key = event.key.toLowerCase();
    if (key === "o") { event.preventDefault(); if (!item.checked && item.status === "approved") ok(); }
    else if (key === "u") { event.preventDefault(); startAdjust(); }
    else if (key === "t") { event.preventDefault(); startReject(); }
    else if (key === "x") { event.preventDefault(); onPick(); }
    else if (key === "j" || key === "arrowdown") { event.preventDefault(); onMove(event.currentTarget, 1); }
    else if (key === "k" || key === "arrowup") { event.preventDefault(); onMove(event.currentTarget, -1); }
  }

  // A number and its unit never part at the end of a line ("5,2 km", not "5,2" then "km"): no-break spaces.
  const facts = [
    item.kcal != null && `${points(item.kcal)} kkal`, item.steps != null && `${points(item.steps)} langkah`,
    // Zero minutes or metres (activities from the old app often have them) say nothing: not shown.
    !!item.minutes && `${item.minutes} menit`, !!item.distanceM && `${(item.distanceM / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} km`,
    item.source === "strava" && "dari Strava", item.source === "import" && "dari aplikasi lama",
  ].filter(Boolean) as string[];
  const name = item.employeeNickname || item.employeeName;
  const when = `${dayLabel(item.date, today)}${item.time ? ` ${item.time.replace(":", ".")}` : ""}`;
  const status = item.status === "rejected" ? <Pill tone="bad">Ditolak</Pill> : item.status === "adjusted" ? <Pill tone="warn">Diubah</Pill> : item.checked ? <Pill tone="ok">Diperiksa</Pill> : null;
  const reviewed = item.status === "rejected" || item.status === "adjusted";
  const row = layout === "daftar";

  const actions = reviewed
    ? [<ConsoleButton key="back" icon={<Undo2 size={18} aria-hidden="true" />} disabled={busy} aria-label={row ? "Kembalikan" : undefined} title={row ? "Kembalikan" : undefined}
        onClick={() => void act({ status: "approved", points: item.pointsClaimed, reason: null, checked: true })}>{row ? null : "Kembalikan"}</ConsoleButton>]
    : [
      <ConsoleButton key="reject" icon={<X size={18} aria-hidden="true" />} disabled={busy} aria-label={row ? "Tolak" : undefined} title={row ? "Tolak (T)" : undefined} onClick={startReject}>{row ? null : "Tolak"}</ConsoleButton>,
      <ConsoleButton key="adjust" icon={<Pencil size={18} aria-hidden="true" />} disabled={busy} aria-label={row ? "Ubah poin" : undefined} title={row ? "Ubah poin (U)" : undefined} onClick={startAdjust}>{row ? null : "Ubah poin"}</ConsoleButton>,
      ...(item.checked ? [] : [<ConsoleButton key="ok" variant="primary" icon={<Check size={18} aria-hidden="true" />} disabled={busy} aria-label={row ? "Oke" : undefined} title={row ? "Oke (O)" : undefined} onClick={ok}>{row ? null : "Oke"}</ConsoleButton>]),
    ];

  const editor = mode === "delete" ? <form className={css.editor} onSubmit={event => { event.preventDefault(); void submitDelete(); }}>
    <p className={css.deleteAsk} role="alert"><strong>Hapus aktivitas ini?</strong> {points(item.points)} poin hilang dari total {name}, foto buktinya ikut terhapus, dan tidak bisa dikembalikan.
      {item.source === "import" && " Aktivitas dari aplikasi lama bisa masuk lagi kalau data lama diimpor ulang."}</p>
    <div className={css.editorActions}>
      <ConsoleButton disabled={busy} onClick={() => setMode("view")}>Batal</ConsoleButton>
      <button type="submit" className={`${buttonClass("primary")} ${css.dangerButton}`} disabled={busy}><Trash2 size={18} aria-hidden="true" />{busy ? "Menghapus…" : "Hapus"}</button>
    </div>
  </form> : mode !== "view" && <form className={css.editor} onSubmit={event => { event.preventDefault(); if (mode === "adjust") submitAdjust(); else submitReject(); }}>
    {mode === "adjust" && <label className={css.field}><span>Poin baru</span>
      <input className={css.input} inputMode="numeric" value={value} onChange={event => setValue(event.target.value.replace(/\D/g, "").slice(0, 6))} autoFocus /></label>}
    {mode === "reject" && <div className={css.reasonChips} role="group" aria-label="Alasan cepat">
      {rejectReasons.map(text => <button key={text} type="button" className={css.reasonChip} aria-pressed={reason === text} onClick={() => setReason(text)}>{text}</button>)}
    </div>}
    <label className={css.field}><span>Alasan (dibaca karyawan)</span>
      <input className={css.input} value={reason} maxLength={300} onChange={event => setReason(event.target.value)} placeholder={mode === "adjust" ? "mis. Kalori disesuaikan dengan durasi di foto" : "atau tulis sendiri"} autoFocus={mode === "reject"} /></label>
    {problem && <p className={css.problem} role="alert">{problem}</p>}
    <div className={css.editorActions}>
      <ConsoleButton disabled={busy} onClick={() => { setMode("view"); setProblem(""); }}>Batal</ConsoleButton>
      <ConsoleButton type="submit" variant="primary" disabled={busy}>{busy ? "Menyimpan…" : mode === "adjust" ? "Simpan poin" : "Tolak aktivitas"}</ConsoleButton>
    </div>
  </form>;
  const reasonNote = item.reason && <p className={css.reason} data-tone={item.status === "rejected" ? "bad" : "warn"}>
    <strong>{item.status === "rejected" ? "Alasan ditolak" : "Alasan diubah"}:</strong> {item.reason}{item.reviewedBy && <small> · oleh {item.reviewedBy}</small>}
  </p>;
  const pointsView = <span className={css.cardPoints}>
    <strong className={item.status === "rejected" ? css.ptsOff : item.points === 0 ? css.ptsZero : css.pts}>+{points(item.points)}</strong>
    {item.status === "adjusted" && item.pointsClaimed !== item.points && <small>dari {points(item.pointsClaimed)}</small>}
    {item.status === "rejected" && <small>tidak dihitung</small>}
  </span>;
  // The facts as one text; a no-break space before each dot, so a dot never starts a wrapped line.
  const details = [item.title && item.title !== item.typeName ? item.typeName : null, ...facts].filter(Boolean).join(" · ");
  const meta = <span className={css.cardMeta}>
    <DimensionPill dimension={item.dimension} />
    {details && <span>{details}</span>}
  </span>;
  const title = item.title || item.typeName;
  // Who: the name with the day and time beside it; under it the full name (when the shown name is a nickname, so
  // the avatar's initials and two people with one nickname make sense) and the department, as in Karyawan.
  const fullName = item.employeeNickname && item.employeeNickname !== item.employeeName ? item.employeeName : "";
  const who = (className: string) => <div className={className}>
    <span className={css.whoLine}><strong>{name}</strong><small>{when}</small></span>
    <small className={css.whoDept}>{[fullName, item.department].filter(Boolean).join(" · ") || "-"}</small>
  </div>;
  const common = {
    "data-card": true, tabIndex: 0, onKeyDown: onKey, "data-status": item.status, "data-picked": picked,
    "aria-label": `${name}, ${item.typeName}, ${item.points} poin${picked ? ", dipilih" : ""}`,
  } as const;
  const pick = <label className={css.cardPick}><input type="checkbox" checked={picked} onChange={onPick} aria-label={`Pilih aktivitas ${name}, ${item.typeName}`} /></label>;

  if (row) return <article className={css.row} {...common}>
    {pick}
    <Avatar name={item.employeeName || name} size={36} />
    {who(css.rowWho)}
    <div className={css.rowWhat}><strong title={title}>{title}</strong>{meta}</div>
    <Proof photos={item.photos} size="sm" onOpen={() => setViewing(0)} />
    <div className={css.rowScore}>{pointsView}{status}</div>
    <span className={css.rowActions}>{mode === "view" ? <>{actions}<ItemMenu label={item.typeName} onDelete={() => setMode("delete")} /></> : null}</span>
    {(reasonNote || item.note) && <div className={css.rowExtra}>
      {item.note && <p className={css.note}>“{item.note}”</p>}
      {reasonNote}
    </div>}
    {editor && <div className={css.rowEditor}>{editor}</div>}
    {viewing !== null && <ProofViewer proofs={viewable(item.photos)} start={viewing} onClose={() => setViewing(null)} />}
  </article>;

  return <article className={css.card} {...common}>
    <header className={css.cardHead}>
      {pick}
      <Avatar name={item.employeeName || name} size={40} />
      {who(css.cardWho)}
      {status}
      {mode === "view" && <ItemMenu label={item.typeName} onDelete={() => setMode("delete")} />}
    </header>
    <div className={css.cardBody}>
      <div className={css.cardWhat}>
        <strong title={title}>{title}</strong>
        {meta}
        {item.note && <p className={css.note}>“{item.note}”</p>}
      </div>
      <Proof photos={item.photos} size="md" onOpen={() => setViewing(0)} />
    </div>
    {reasonNote}
    {mode === "view" ? <footer className={css.cardFoot}>
      {pointsView}
      <span className={css.cardActions} data-count={actions.length}>{actions}</span>
    </footer> : editor}
    {viewing !== null && <ProofViewer proofs={viewable(item.photos)} start={viewing} onClose={() => setViewing(null)} />}
  </article>;
}
