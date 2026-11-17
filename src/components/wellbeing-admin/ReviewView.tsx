"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, CheckCheck, FileSpreadsheet, ImageOff, Pencil, Undo2, X } from "lucide-react";
import { Avatar, ConsoleButton, FilterChips, PageHeader, Pill, SearchField, SegmentedControl } from "@/components/console";
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
 * Each action happens at once with Urungkan in the toast. On a laptop: O, U, T, and J/K to move.
 *
 * Many at once (17 Nov 2026): tick cards (or X, or Pilih semua), then Konfirmasi marks every ticked one
 * that is not yet checked as checked (Urungkan sets them back), and Unduh Excel exports the ticked ones.
 */

const stateOf = (item: WbActivity): ReviewInput => ({ status: item.status, points: item.points, reason: item.reason, checked: item.checked });

export function ReviewView() {
  const [query, setQuery] = useState<ActivityQuery>({ filter: "unchecked", kind: "all", q: "" });
  const [search, setSearch] = useState("");
  useEffect(() => { const timer = setTimeout(() => setQuery(current => current.q === search ? current : { ...current, q: search }), 300); return () => clearTimeout(timer); }, [search]);
  const source = wb.activities(query);
  const page = useResource(source.key, source.fetch);
  const [more, setMore] = useState<{ key: string; items: WbActivity[]; next: string | null; loading: boolean }>({ key: "", items: [], next: null, loading: false });
  const toast = useToast();
  const { openExport } = useWbActions();
  const today = useMemo(() => wibToday(), []);
  const list = useRef<HTMLDivElement>(null);
  // Ticked cards belong to one list: a new filter or search starts with none.
  const [picked, setPicked] = useState<{ key: string; ids: string[] }>({ key: "", ids: [] });
  const [confirming, setConfirming] = useState(false);

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
      const data = { changed: done }, message = done.length ? `${done.length} aktivitas ditandai sudah diperiksa.` : "Semua yang dipilih sudah diperiksa.";
      const changed = new Set(data.changed);
      const mark = (item: WbActivity) => changed.has(item.id) ? { ...item, checked: true } : item;
      const keep = (item: WbActivity) => !(query.filter === "unchecked" && changed.has(item.id));
      setResource<WbActivityPage>(source.key, current => current && { ...current, items: current.items.filter(keep).map(mark), unchecked: Math.max(0, current.unchecked - changed.size) });
      setMore(current => current.key === source.key ? { ...current, items: current.items.filter(keep).map(mark) } : current);
      setPicked({ key: source.key, ids: [] });
      revalidate("wb:overview"); revalidate("wb:people");
      toast({ message, tone: "ok", action: data.changed.length ? { label: "Urungkan", run: () => void undoConfirm(data.changed) } : undefined });
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
    <PageHeader title="Periksa" subtitle="Semua aktivitas sudah dihitung. Lihat buktinya; ubah poin atau tolak bila tidak sesuai. Pintasan: O oke · U ubah · T tolak · X pilih · J/K pindah."
      actions={<ConsoleButton icon={<FileSpreadsheet size={18} aria-hidden="true" />} onClick={() => openExport({ data: "activities", status: query.filter, kind: query.kind })}>Unduh Excel</ConsoleButton>} />
    <div className={css.toolbar}>
      <FilterChips label="Status" value={query.filter} onChange={filter => setQuery(current => ({ ...current, filter }))} chips={[
        { value: "unchecked", label: "Belum diperiksa", count: unchecked },
        { value: "all", label: "Semua" }, { value: "adjusted", label: "Diubah" }, { value: "rejected", label: "Ditolak" },
      ]} />
      <div className={css.toolbarRight}>
        <SegmentedControl label="Jenis" value={query.kind} onChange={kind => setQuery(current => ({ ...current, kind }))} options={[
          { value: "all", label: "Semua" }, { value: "daily", label: "Harian" }, { value: "sport", label: "Olahraga" }, { value: "strava", label: "Strava" },
        ]} />
        <SearchField label="Cari nama atau divisi" placeholder="Cari nama atau divisi" value={search} onChange={setSearch} />
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
          <div ref={list} className={css.cards}>
            {items.map(item => <ActivityCard key={item.id} item={item} today={today} picked={selected.includes(item.id)} onPick={() => toggle(item.id)} onReview={next => review(item, next)} onMove={move} />)}
          </div>
        </>}
    {next && <div className={css.more}><ConsoleButton onClick={() => void loadMore()} disabled={extra.loading}>{extra.loading ? "Memuat…" : "Muat lagi"}</ConsoleButton></div>}
  </>;
}

function ActivityCard({ item, today, picked, onPick, onReview, onMove }: { item: WbActivity; today: string; picked: boolean; onPick: () => void; onReview: (next: ReviewInput) => Promise<void>; onMove: (from: HTMLElement, step: 1 | -1) => void }) {
  const [mode, setMode] = useState<"view" | "adjust" | "reject">("view");
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState(String(item.points));
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState("");

  async function act(next: ReviewInput) {
    setBusy(true); setProblem("");
    await onReview(next);
    setBusy(false); setMode("view");
  }
  function ok() { void act({ status: item.status, points: item.points, reason: item.reason, checked: true }); }
  function submitAdjust() {
    const next = Number(value);
    if (!Number.isInteger(next) || next < 0) return setProblem("Isi poin dengan angka 0 atau lebih.");
    if (!reason.trim()) return setProblem("Tulis alasannya; karyawan akan membacanya.");
    void act({ status: "adjusted", points: next, reason: reason.trim(), checked: true });
  }
  function submitReject() {
    if (!reason.trim()) return setProblem("Pilih atau tulis alasannya.");
    void act({ status: "rejected", points: item.points, reason: reason.trim(), checked: true });
  }
  function onKey(event: KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || busy) return;
    const key = event.key.toLowerCase();
    if (key === "o") { event.preventDefault(); ok(); }
    else if (key === "u") { event.preventDefault(); setReason(""); setMode("adjust"); }
    else if (key === "t") { event.preventDefault(); setReason(""); setMode("reject"); }
    else if (key === "x") { event.preventDefault(); onPick(); }
    else if (key === "j" || key === "arrowdown") { event.preventDefault(); onMove(event.currentTarget, 1); }
    else if (key === "k" || key === "arrowup") { event.preventDefault(); onMove(event.currentTarget, -1); }
  }

  const facts = [
    item.kcal != null && `${points(item.kcal)} kkal`, item.steps != null && `${points(item.steps)} langkah`,
    item.minutes != null && `${item.minutes} menit`, item.distanceM != null && `${(item.distanceM / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} km`,
    item.source === "strava" && "dari Strava", item.source === "import" && "dari aplikasi lama",
  ].filter(Boolean) as string[];
  const name = item.employeeNickname || item.employeeName;
  return <article className={css.card} data-card tabIndex={0} onKeyDown={onKey} data-status={item.status} data-picked={picked} aria-label={`${name}, ${item.typeName}, ${item.points} poin${picked ? ", dipilih" : ""}`}>
    <header className={css.cardHead}>
      <label className={css.cardPick}><input type="checkbox" checked={picked} onChange={onPick} aria-label={`Pilih aktivitas ${name}, ${item.typeName}`} /></label>
      <Avatar name={item.employeeName || name} size={40} />
      <div className={css.cardWho}><strong>{name}</strong><small>{item.department || "-"} · {dayLabel(item.date, today)}{item.time ? ` ${item.time.replace(":", ".")}` : ""}</small></div>
      {item.status === "rejected" ? <Pill tone="bad">Ditolak</Pill> : item.status === "adjusted" ? <Pill tone="warn">Diubah</Pill> : item.checked ? <Pill tone="ok">Diperiksa</Pill> : null}
    </header>
    <div className={css.cardWhat}>
      <strong>{item.title || item.typeName}</strong>
      <span className={css.cardMeta}><DimensionPill dimension={item.dimension} />{item.title && item.title !== item.typeName && <span>{item.typeName}</span>}{facts.map(fact => <span key={fact}>{fact}</span>)}</span>
      {item.note && <p className={css.note}>“{item.note}”</p>}
    </div>
    {item.photos.length > 0 && <div className={css.photos}>
      {item.photos.map((photo, index) => /^https?:\/\//.test(photo)
        ? <a key={photo} href={photo} target="_blank" rel="noopener noreferrer" className={css.photo} aria-label={`${isVideoProof(photo) ? "Video" : "Foto"} bukti ${index + 1} (tab baru)`}>
          {isVideoProof(photo)
            ? <video src={photo} muted playsInline preload="metadata" aria-hidden="true" />
            // eslint-disable-next-line @next/next/no-img-element -- proof photos come from storage, any size
            : <img src={photo} alt="" loading="lazy" />}
        </a>
        : <span key={photo} className={`${css.photo} ${css.photoMissing}`} title="Foto belum bisa ditampilkan"><ImageOff size={20} aria-hidden="true" /></span>)}
    </div>}
    {item.reason && <p className={css.reason} data-tone={item.status === "rejected" ? "bad" : "warn"}>
      <strong>{item.status === "rejected" ? "Alasan ditolak" : "Alasan diubah"}:</strong> {item.reason}{item.reviewedBy && <small> · oleh {item.reviewedBy}</small>}
    </p>}

    {mode === "view" ? <footer className={css.cardFoot}>
      <span className={css.cardPoints}>
        <strong className={item.status === "rejected" ? css.ptsOff : css.pts}>+{points(item.points)}</strong>
        {item.status === "adjusted" && item.pointsClaimed !== item.points && <small>dari {points(item.pointsClaimed)}</small>}
        {item.status === "rejected" && <small>tidak dihitung</small>}
      </span>
      <span className={css.cardActions}>
        {item.status === "rejected" || item.status === "adjusted"
          ? <ConsoleButton icon={<Undo2 size={18} aria-hidden="true" />} disabled={busy} onClick={() => void act({ status: "approved", points: item.pointsClaimed, reason: null, checked: true })}>Kembalikan</ConsoleButton>
          : <>
            <ConsoleButton icon={<X size={18} aria-hidden="true" />} disabled={busy} onClick={() => { setReason(""); setMode("reject"); }}>Tolak</ConsoleButton>
            <ConsoleButton icon={<Pencil size={18} aria-hidden="true" />} disabled={busy} onClick={() => { setReason(""); setValue(String(item.points)); setMode("adjust"); }}>Ubah poin</ConsoleButton>
            {!item.checked && <ConsoleButton variant="primary" icon={<Check size={18} aria-hidden="true" />} disabled={busy} onClick={ok}>Oke</ConsoleButton>}
          </>}
      </span>
    </footer> : <form className={css.editor} onSubmit={event => { event.preventDefault(); if (mode === "adjust") submitAdjust(); else submitReject(); }}>
      {mode === "adjust" && <label className={css.field}><span>Poin baru</span>
        <input className={css.input} inputMode="numeric" value={value} onChange={event => setValue(event.target.value.replace(/\D/g, "").slice(0, 6))} autoFocus /></label>}
      {mode === "reject" && <div className={css.reasonChips} role="group" aria-label="Alasan cepat">
        {rejectReasons.map(text => <button key={text} type="button" className={css.reasonChip} aria-pressed={reason === text} onClick={() => setReason(text)}>{text}</button>)}
      </div>}
      <label className={css.field}><span>Alasan (dibaca karyawan)</span>
        <input className={css.input} value={reason} maxLength={300} onChange={event => setReason(event.target.value)} placeholder={mode === "adjust" ? "mis. Kalori disesuaikan dengan durasi di foto" : "atau tulis sendiri"} autoFocus={mode === "reject"} /></label>
      {problem && <p className={css.problem} role="alert">{problem}</p>}
      <div className={css.cardActions}>
        <ConsoleButton disabled={busy} onClick={() => { setMode("view"); setProblem(""); }}>Batal</ConsoleButton>
        <ConsoleButton type="submit" variant="primary" disabled={busy}>{busy ? "Menyimpan…" : mode === "adjust" ? "Simpan poin" : "Tolak aktivitas"}</ConsoleButton>
      </div>
    </form>}
  </article>;
}
