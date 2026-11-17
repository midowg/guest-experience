"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, CircleCheck, CloudOff, Ellipsis, EyeOff, Grid3x3, Heart, Hourglass, Images, LayoutGrid, MoveHorizontal, Users } from "lucide-react";
import { ShellActions, ShellChrome } from "@/components/main-wam/shell";
import { Banner, Button, Chip, FilterChip, IconBox, IconButton, Pressable, Segmented, Spinner, TopBar, useToast } from "@/components/main-wam/ui";
import { errorText, praWamRequest } from "@/components/pra-wam/api";
import type { SessionChoice } from "@/lib/main-wam/momen/sessions";
import { stackCount, stackCountSpoken, type StackMode } from "@/lib/main-wam/momen/stack";
import { UMUM, type FeedAnswer, type FeedPhoto, type SessionCount, type SessionFilter } from "@/lib/main-wam/momen/types";
import type { PhotoStatus, ViewerGroup } from "@/lib/main-wam/types";
import { mainWamApi, mainWamPath } from "@/lib/routes";
import { DeletePhotoDialog, PhotoOptionsSheet, refusedForGood, ReportSheet, SessionFilterSheet } from "./MomenSheets";
import { StackDeck } from "./StackDeck";
import { MomenQueueRunner } from "./upload/QueueRunner";
import css from "./momen.module.css";

export type MomenStackProps = {
  mode: StackMode;
  view: "semua" | "kelompok";
  session: SessionFilter;
  /** The chip's and the line's name of the session filter ("Pemaparan departemen", "Umum"). */
  sessionTitle: string | null;
  items: FeedPhoto[];
  next: string | null;
  /** How many the counter counts: new photos (baru), the session's photos, the gallery's photos. */
  total: number;
  startIndex: number;
  /** Galeri: photos newer than the first one loaded (the counter starts after them). */
  offset: number;
  counts: SessionCount[] | null;
  sessions: SessionChoice[];
  group: ViewerGroup | null;
  groupsPublished: boolean;
  mozaik: boolean;
  migrated: boolean;
  /** The view has photos at all (baru with none new = "Kamu sudah lihat semua"). */
  anyPhotos: boolean;
  /** Opened from a note about one's own hidden photo. */
  own: { id: string; status: PhotoStatus; reason: string } | null;
  eventName: string;
  nowIso: string;
  /** Dev preview only: a fixed state to look at (a sheet open, offline, loading, …), no network. */
  demo?: StackDemo;
};
export type StackDemo = { sheet?: "sesi" | "pilihan" | "lapor" | "hapus"; hiddenForMe?: boolean; offline?: boolean; loading?: boolean; hint?: boolean };

const HINT_KEY = "mw-momen-geser";
const subscribeOnline = (notify: () => void) => { window.addEventListener("online", notify); window.addEventListener("offline", notify); return () => { window.removeEventListener("online", notify); window.removeEventListener("offline", notify); }; };

/** Read once in the browser (localStorage may throw: private windows, blocked storage). */
function readFlag(key: string): boolean {
  try { return window.localStorage.getItem(key) === "1"; } catch { return true; }
}

/**
 * M01–M04: Momen as a stack of photos to swipe through (Instagram Instants), Semua / Kelompokku and
 * "Semua sesi ▾", new photos first, then "Kamu sudah lihat semua" (M03). Suka (button or a double
 * tap), "…" → Laporkan foto (M04) or Hapus foto (one's own). Opened from the gallery (`foto`), it
 * starts at that photo with ‹ Galeri. The server gave the first page; more pages come five cards
 * ahead; seen photos are told to the server in small batches.
 */
export function MomenStack(props: MomenStackProps) {
  const { mode, view, session, sessionTitle, group, mozaik, migrated } = props;
  const router = useRouter();
  const toast = useToast();
  const now = useMemo(() => new Date(props.nowIso), [props.nowIso]);
  const [items, setItems] = useState(props.items);
  const [next, setNext] = useState(props.next);
  const [index, setIndex] = useState(props.startIndex);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [hearts, setHearts] = useState<Record<string, { hearts: number; hearted: boolean }>>({});
  const demo = props.demo;
  const [hiddenForMe, setHiddenForMe] = useState<Set<string>>(() => new Set(demo?.hiddenForMe && props.items[props.startIndex] ? [props.items[props.startIndex].id] : []));
  const [sheet, setSheet] = useState<"sesi" | "pilihan" | "lapor" | "hapus" | null>(demo?.sheet ?? null);
  const [deleting, setDeleting] = useState(false);
  const [spoken, setSpoken] = useState("");
  const [hintSeen, setHintSeen] = useState(true);
  const browserOnline = useSyncExternalStore(subscribeOnline, () => navigator.onLine !== false, () => true);
  const online = demo?.offline ? false : browserOnline;
  const seen = useRef(new Set<string>());
  const pendingSeen = useRef(new Set<string>());

  // A new filter remounts this (the page keys it), so the server's first page is the start.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage, read after hydration
  useEffect(() => { setHintSeen(demo ? !demo.hint : readFlag(HINT_KEY)); }, [demo]);

  const current = index < items.length ? items[index] : null;
  const shownHearts = current ? hearts[current.id] ?? { hearts: current.hearts, hearted: current.hearted } : null;

  /* Seen: told to the server every few seconds and when the app goes to the background. */
  const sendSeen = useCallback((keepalive = false) => {
    const ids = [...pendingSeen.current].slice(0, 100);
    if (!ids.length) return;
    ids.forEach(id => pendingSeen.current.delete(id));
    fetch(mainWamApi.photosSeen, { method: "POST", credentials: "same-origin", keepalive, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) })
      .then(response => { if (!response.ok && response.status >= 500) ids.forEach(id => pendingSeen.current.add(id)); })
      .catch(() => ids.forEach(id => pendingSeen.current.add(id)));
  }, []);
  useEffect(() => {
    if (!current || current.mine || current.seen || seen.current.has(current.id)) return;
    seen.current.add(current.id);
    pendingSeen.current.add(current.id);
  }, [current]);
  useEffect(() => {
    if (demo) return;
    const timer = window.setInterval(() => sendSeen(), 3000);
    const away = () => { if (document.visibilityState === "hidden") sendSeen(true); };
    const leave = () => sendSeen(true);
    document.addEventListener("visibilitychange", away);
    window.addEventListener("pagehide", leave);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", away); window.removeEventListener("pagehide", leave); sendSeen(true); };
  }, [sendSeen, demo]);

  /* More photos, five cards ahead (keyset cursor from the server). */
  const loadMore = useCallback(async () => {
    if (!next || loading) return;
    setLoading(true);
    try {
      const { data } = await praWamRequest<FeedAnswer>(mainWamApi.photos({ lihat: view === "kelompok" ? "kelompok" : undefined, sesi: session ?? undefined, sebelum: next }));
      setItems(list => [...list, ...data.items.filter(item => !list.some(other => other.id === item.id))]);
      setNext(data.next);
      setLoadError(false);
    } catch { setLoadError(true); } finally { setLoading(false); }
  }, [next, loading, view, session]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- starts a request (its "loading" flag), not derived state
  useEffect(() => { if (!demo && next && !loading && !loadError && items.length - index <= 5) void loadMore(); }, [items.length, index, next, loading, loadError, loadMore, demo]);

  function move(to: number, how: "swipe" | "tap" | "key") {
    setIndex(to);
    if (how !== "swipe") setSpoken(to >= items.length ? "Kamu sudah lihat semua" : stackCountSpoken(mode, props.offset + to, props.total));
    if (!hintSeen) { setHintSeen(true); try { window.localStorage.setItem(HINT_KEY, "1"); } catch { /* not kept */ } }
  }

  function filterTo(nextView: "semua" | "kelompok", nextSession: SessionFilter) {
    router.replace(mainWamPath.moments({ lihat: nextView === "kelompok" ? "kelompok" : undefined, sesi: nextSession ?? undefined }), { scroll: false });
  }

  async function toggleHeart(photo: FeedPhoto, on?: boolean) {
    const before = hearts[photo.id] ?? { hearts: photo.hearts, hearted: photo.hearted };
    const want = on ?? !before.hearted;
    if (want === before.hearted) return;
    setHearts(map => ({ ...map, [photo.id]: { hearts: Math.max(0, before.hearts + (want ? 1 : -1)), hearted: want } }));
    try {
      const { data } = await praWamRequest<{ hearts: number; hearted: boolean }>(mainWamApi.photoHeart(photo.id), { method: want ? "PUT" : "DELETE" });
      setHearts(map => ({ ...map, [photo.id]: data }));
    } catch (error) {
      setHearts(map => ({ ...map, [photo.id]: before }));
      toast.show({ text: errorText(error), tone: "error" });
    }
  }

  async function report(input: { reason: string; note: string }) {
    if (!current) return;
    await praWamRequest(mainWamApi.photoReport(current.id), { method: "POST", json: input });
    setHiddenForMe(set => new Set(set).add(current.id));
    setSheet(null);
    toast.show({ text: "Laporan terkirim. Terima kasih.", tone: "success" });
  }

  async function showAgain(photo: FeedPhoto) {
    try {
      await praWamRequest(mainWamApi.photoReport(photo.id), { method: "DELETE" });
      setHiddenForMe(set => { const copy = new Set(set); copy.delete(photo.id); return copy; });
    } catch (error) { toast.show({ text: errorText(error), tone: "error" }); }
  }

  async function removeMine() {
    if (!current) return;
    setDeleting(true);
    try {
      await praWamRequest(mainWamApi.photo(current.id), { method: "DELETE" });
      setItems(list => list.filter(item => item.id !== current.id));
      setSheet(null);
      toast.show({ text: "Foto dihapus", tone: "success" });
    } catch (error) {
      // 409: the photo stays (nominated for Awarding); trying again would not change it.
      if (refusedForGood(error)) setSheet(null);
      toast.show({ text: errorText(error), tone: "error" });
    } finally { setDeleting(false); }
  }

  /* What stands in the front card's place. */
  const galeriHref = mainWamPath.gallery({ lihat: view === "kelompok" ? "kelompok" : undefined, sesi: session ?? undefined });
  let panel: ReactNode = null;
  let noCard = false;
  if (demo?.loading) {
    noCard = true;
    panel = <Spinner label="Memuat foto" />;
  } else if (!migrated) {
    noCard = true;
    panel = <><IconBox icon={Hourglass} size={64} round tone="ondark" /><h2 className={css.panelTitle}>Menunggu pembaruan sistem</h2><p className={css.panelBody}>Momen bisa dipakai setelah sistem diperbarui.</p></>;
  } else if (view === "kelompok" && !group) {
    noCard = true;
    panel = <><IconBox icon={Users} size={64} round tone="ondark" /><h2 className={css.panelTitle}>{props.groupsPublished ? "Kamu belum masuk kelompok" : "Kelompok belum diterbitkan panitia"}</h2></>;
  } else if (props.own && current?.id === props.own.id && props.own.status !== "tampil") {
    panel = <><IconBox icon={EyeOff} size={64} round tone="ondark" />
      <h2 className={css.panelTitle}>{props.own.status === "disembunyikan" ? "Fotomu disembunyikan panitia" : "Fotomu disembunyikan sementara"}</h2>
      <p className={css.panelBody}>{props.own.status === "disembunyikan" ? props.own.reason || "Ada rekan yang tidak setuju fotonya dibagikan." : "Panitia sedang meninjau laporan."}</p></>;
  } else if (current && hiddenForMe.has(current.id)) {
    panel = <><IconBox icon={EyeOff} size={64} round tone="ondark" /><h2 className={css.panelTitle}>Foto disembunyikan untukmu</h2>
      <Button variant="ondark" size="m" onClick={() => showAgain(current)}>Tampilkan lagi</Button></>;
  } else if (!items.length && !(mode === "baru" && props.anyPhotos)) {
    noCard = true;
    panel = view === "kelompok"
      ? <><IconBox icon={Images} size={64} round tone="ondark" /><h2 className={css.panelTitle}>Kelompokmu belum punya foto</h2></>
      : <><IconBox icon={Images} size={64} round tone="ondark" /><h2 className={css.panelTitle}>{session ? "Belum ada foto di sesi ini" : "Belum ada foto"}</h2>
        {session
          ? <Button variant="ondark" size="m" onClick={() => filterTo(view, null)}>Semua sesi</Button>
          : <p className={css.panelBody}>Jadi yang pertama memotret {props.eventName}.</p>}</>;
  } else if (!current && next) {
    panel = loadError
      ? <><IconBox icon={CloudOff} size={64} round tone="ondark" /><h2 className={css.panelTitle}>Foto belum dapat dimuat</h2><Button variant="ondark" size="m" onClick={() => { setLoadError(false); void loadMore(); }}>Coba lagi</Button></>
      : <Spinner label="Memuat foto" />;
  } else if (!current) {
    noCard = true;
    panel = <><IconBox icon={CircleCheck} size={64} round tone="ondark" /><h2 className={css.panelTitle}>Kamu sudah lihat semua</h2>
      <p className={css.panelBody}>{mozaik ? "Foto tetap tersimpan di Galeri dan Mozaik." : "Foto tetap tersimpan di Galeri."}</p>
      <div className={css.panelActions}>
        <Button block icon={Grid3x3} href={galeriHref}>Buka Galeri</Button>
        {mozaik && <Button block variant="ondark" icon={LayoutGrid} href={mainWamPath.mosaic()}>Lihat Mozaik</Button>}
      </div></>;
  }

  /* The line under the cards. */
  const position = props.offset + index;
  let hint: ReactNode = null;
  if (migrated && !(view === "kelompok" && !group)) {
    if (mode === "sesi" && props.total > 0) hint = <span className={css.count}>{stackCount("sesi", 0, props.total, sessionTitle ?? undefined)}</span>;
    else if (mode === "baru" && current && !panel) hint = <>
      <span className={css.count} aria-label={stackCountSpoken("baru", index, props.total)}>{stackCount("baru", index, props.total)}</span>
      {!hintSeen && <><span aria-hidden>·</span><MoveHorizontal aria-hidden />Geser untuk foto berikutnya</>}
    </>;
    else if (mode === "baru" && !current && !next && items.length > 0) hint = <span className={css.count}><Check aria-hidden />{items.length} dari {items.length}</span>;
  }

  const sessionLabel = session === UMUM ? "Umum" : sessionTitle ?? "Semua sesi";
  // Suka and Pilihan foto for a photo on show; one's own hidden photo keeps Pilihan foto (Hapus foto).
  const ownHidden = !!props.own && current?.id === props.own.id;
  const photoActions = !!current && !noCard && !panel;
  const optionsAction = photoActions || (ownHidden && !!current);
  return <>
    {!demo && <MomenQueueRunner />}
    {mode === "galeri" ? <>
      <ShellChrome hideTopBar />
      <div className={css.ownBar}>
        <TopBar variant="back" tone="dark" title={`Galeri · ${view === "kelompok" ? "Kelompokku" : "Semua"}`} backHref={galeriHref}
          onBack={event => { if (window.history.length > 1) { event.preventDefault(); router.back(); } }}
          actions={items.length ? <span className={css.ownCount}>{stackCount("galeri", Math.min(position, props.total - 1), props.total)}</span> : null} />
      </div>
    </> : <ShellActions>
      <Chip tone="dark" icon={Grid3x3} href={galeriHref}>Galeri</Chip>
      {mozaik && <Chip tone="dark" icon={LayoutGrid} href={mainWamPath.mosaic()}>Mozaik</Chip>}
    </ShellActions>}

    <div className={`${css.view} ${mode === "galeri" ? css.viewGaleri : ""}`}>
      {mode !== "galeri" && <div className={css.filter}>
        <Segmented label="Saring Momen" tone="dark" value={view} onChange={value => filterTo(value, session)}
          options={[{ value: "semua", label: "Semua" }, { value: "kelompok", label: "Kelompokku" }]} />
        <FilterChip menu tone="dark" name="Saring sesi" className={css.filterChip} active={session !== null} expanded={sheet === "sesi"} disabled={!props.counts} onClick={() => setSheet("sesi")}>{sessionLabel}</FilterChip>
      </div>}
      {!online && <Banner tone="offline" className={css.banner}>Offline. Menampilkan foto yang sudah dimuat.</Banner>}

      <StackDeck items={noCard ? [] : items} index={noCard ? 0 : index} onIndex={move} onLike={photo => toggleHeart(photo, true)} now={now} panel={panel}
        label="Momen" describe={at => stackCountSpoken(mode, props.offset + at, props.total)} />

      <p className={css.hint}>{hint}</p>
      <p className={css.sr} aria-live="polite">{spoken}</p>

      <div className={css.actions}>
        {photoActions && shownHearts ? <button type="button" className={css.react} aria-pressed={shownHearts.hearted} onClick={() => toggleHeart(current!)}
          aria-label={`${shownHearts.hearted ? "Batal suka" : "Suka foto"}, ${shownHearts.hearts} suka`}><Heart aria-hidden />{shownHearts.hearts}</button> : <span />}
        <Pressable href={mainWamPath.camera()} className={css.camera} aria-label="Buka kamera"><Camera aria-hidden /></Pressable>
        {optionsAction ? <IconButton variant="ondark" icon={Ellipsis} label="Pilihan foto" onClick={() => setSheet("pilihan")} /> : <span />}
      </div>
    </div>

    {props.counts && <SessionFilterSheet open={sheet === "sesi"} onClose={() => setSheet(null)} sessions={props.sessions} counts={props.counts} value={session} now={now}
      onChange={value => filterTo(view, value)} />}
    {current && <PhotoOptionsSheet open={sheet === "pilihan"} onClose={() => setSheet(null)} owner={current.owner.name} mine={current.mine}
      onReport={() => setSheet("lapor")} onDelete={() => setSheet("hapus")} />}
    <ReportSheet open={sheet === "lapor"} onClose={() => setSheet(null)} onSubmit={report} />
    <DeletePhotoDialog open={sheet === "hapus"} busy={deleting} mozaik={mozaik} onCancel={() => setSheet(null)} onConfirm={removeMine} />
  </>;
}
