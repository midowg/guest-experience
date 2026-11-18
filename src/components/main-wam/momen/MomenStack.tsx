"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, CircleCheck, CloudOff, Ellipsis, EyeOff, Grid3x3, Heart, Hourglass, Images, LayoutGrid, MoveHorizontal, Users } from "lucide-react";
import { useKnown, useLang, useT } from "@/components/main-wam/i18n";
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
  const { mode, view, session, group, mozaik, migrated } = props;
  const t = useT();
  const known = useKnown();
  const { lang } = useLang();
  const sessionTitle = session === UMUM ? t("momen.general") : props.sessionTitle;
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
    if (how !== "swipe") setSpoken(to >= items.length ? t("momen.stack.seenAll") : stackCountSpoken(mode, props.offset + to, props.total, lang));
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
      toast.show({ text: known(errorText(error)), tone: "error" });
    }
  }

  async function report(input: { reason: string; note: string }) {
    if (!current) return;
    await praWamRequest(mainWamApi.photoReport(current.id), { method: "POST", json: input });
    setHiddenForMe(set => new Set(set).add(current.id));
    setSheet(null);
    toast.show({ text: t("momen.reportSent"), tone: "success" });
  }

  async function showAgain(photo: FeedPhoto) {
    try {
      await praWamRequest(mainWamApi.photoReport(photo.id), { method: "DELETE" });
      setHiddenForMe(set => { const copy = new Set(set); copy.delete(photo.id); return copy; });
    } catch (error) { toast.show({ text: known(errorText(error)), tone: "error" }); }
  }

  async function removeMine() {
    if (!current) return;
    setDeleting(true);
    try {
      await praWamRequest(mainWamApi.photo(current.id), { method: "DELETE" });
      setItems(list => list.filter(item => item.id !== current.id));
      setSheet(null);
      toast.show({ text: t("momen.photoDeleted"), tone: "success" });
    } catch (error) {
      // 409: the photo stays (nominated for Awarding); trying again would not change it.
      if (refusedForGood(error)) setSheet(null);
      toast.show({ text: known(errorText(error)), tone: "error" });
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
    panel = <><IconBox icon={Hourglass} size={64} round /><h2 className={css.panelTitle}>{t("peserta.waiting.title")}</h2><p className={css.panelBody}>{t("momen.stack.waitingBody")}</p></>;
  } else if (view === "kelompok" && !group) {
    noCard = true;
    panel = <><IconBox icon={Users} size={64} round /><h2 className={css.panelTitle}>{props.groupsPublished ? t("momen.stack.notInGroup") : t("momen.stack.groupsNotPublished")}</h2></>;
  } else if (props.own && current?.id === props.own.id && props.own.status !== "tampil") {
    panel = <><IconBox icon={EyeOff} size={64} round />
      <h2 className={css.panelTitle}>{props.own.status === "disembunyikan" ? t("momen.stack.ownHidden") : t("momen.stack.ownHiddenTemp")}</h2>
      <p className={css.panelBody}>{props.own.status === "disembunyikan" ? props.own.reason || t("momen.stack.ownHiddenReason") : t("momen.stack.reviewing")}</p></>;
  } else if (current && hiddenForMe.has(current.id)) {
    panel = <><IconBox icon={EyeOff} size={64} round /><h2 className={css.panelTitle}>{t("momen.stack.hiddenForYou")}</h2>
      <Button variant="tonal" size="m" onClick={() => showAgain(current)}>{t("momen.stack.showAgain")}</Button></>;
  } else if (!items.length && !(mode === "baru" && props.anyPhotos)) {
    noCard = true;
    panel = view === "kelompok"
      ? <><IconBox icon={Images} size={64} round /><h2 className={css.panelTitle}>{t("momen.stack.groupEmpty")}</h2></>
      : <><IconBox icon={Images} size={64} round /><h2 className={css.panelTitle}>{session ? t("momen.stack.sessionEmpty") : t("momen.noneYet")}</h2>
        {session
          ? <Button variant="tonal" size="m" onClick={() => filterTo(view, null)}>{t("momen.allSessions")}</Button>
          : <><p className={css.panelBody}>{t("momen.stack.beFirst", { event: props.eventName })}</p>
            <Button variant="tonal" size="m" icon={Camera} href={mainWamPath.camera()}>{t("momen.takePhoto")}</Button></>}</>;
  } else if (!current && next) {
    panel = loadError
      ? <><IconBox icon={CloudOff} size={64} round /><h2 className={css.panelTitle}>{t("momen.stack.loadFailed")}</h2><Button variant="tonal" size="m" onClick={() => { setLoadError(false); void loadMore(); }}>{t("shell.retry")}</Button></>
      : <Spinner label="Memuat foto" />;
  } else if (!current) {
    noCard = true;
    panel = <><IconBox icon={CircleCheck} size={64} round /><h2 className={css.panelTitle}>{t("momen.stack.seenAll")}</h2>
      <p className={css.panelBody}>{mozaik ? t("momen.stack.keptBoth") : t("momen.stack.keptGallery")}</p>
      <div className={css.panelActions}>
        <Button block icon={Grid3x3} href={galeriHref}>{t("momen.stack.openGallery")}</Button>
        {mozaik && <Button block variant="secondary" icon={LayoutGrid} href={mainWamPath.mosaic()}>{t("momen.stack.seeMosaic")}</Button>}
      </div></>;
  }

  /* The line under the cards. */
  const position = props.offset + index;
  let hint: ReactNode = null;
  if (migrated && !(view === "kelompok" && !group)) {
    if (mode === "sesi" && props.total > 0) hint = <span className={css.count}>{stackCount("sesi", 0, props.total, sessionTitle ?? undefined, lang)}</span>;
    else if (mode === "baru" && current && !panel) hint = <>
      {/* The first `total` cards are the new ones; after them come the ones seen before and the person's own. */}
      {index < props.total
        ? <span className={css.count} aria-label={stackCountSpoken("baru", index, props.total, lang)}>{stackCount("baru", index, props.total, undefined, lang)}</span>
        : <span className={css.count}>{t("momen.stack.earlier")}</span>}
      {!hintSeen && <><span aria-hidden>·</span><MoveHorizontal aria-hidden />{t("momen.stack.swipeHint")}</>}
    </>;
    else if (mode === "baru" && !current && !next && items.length > 0) hint = <span className={css.count}><Check aria-hidden />{t("momen.stack.countOf", { a: items.length, b: items.length })}</span>;
  }

  const sessionLabel = session === UMUM ? t("momen.general") : sessionTitle ?? t("momen.allSessions");
  // Suka and Pilihan foto for a photo on show; one's own hidden photo keeps Pilihan foto (Hapus foto).
  const ownHidden = !!props.own && current?.id === props.own.id;
  const photoActions = !!current && !noCard && !panel;
  const optionsAction = photoActions || (ownHidden && !!current);
  return <>
    {!demo && <MomenQueueRunner />}
    {mode === "galeri" ? <>
      <ShellChrome hideTopBar />
      <div className={css.ownBar}>
        <TopBar variant="back" title={view === "kelompok" ? t("momen.stack.galleryTitleGroup") : t("momen.stack.galleryTitleAll")} backHref={galeriHref}
          onBack={event => { if (window.history.length > 1) { event.preventDefault(); router.back(); } }}
          actions={items.length ? <span className={css.ownCount}>{stackCount("galeri", Math.min(position, props.total - 1), props.total, undefined, lang)}</span> : null} />
      </div>
    </> : <ShellActions>
      <Chip icon={Grid3x3} href={galeriHref}>{t("momen.gallery")}</Chip>
      {mozaik && <Chip icon={LayoutGrid} href={mainWamPath.mosaic()}>{t("momen.mosaic")}</Chip>}
    </ShellActions>}

    <div className={css.view}>
      {mode !== "galeri" && <div className={css.filter}>
        <Segmented label={t("momen.stack.filterLabel")} value={view} onChange={value => filterTo(value, session)}
          options={[{ value: "semua", label: t("momen.all") }, { value: "kelompok", label: t("momen.myGroup") }]} />
        <FilterChip menu name={t("momen.filterSessionTitle")} className={css.filterChip} active={session !== null} expanded={sheet === "sesi"} disabled={!props.counts} onClick={() => setSheet("sesi")}>{sessionLabel}</FilterChip>
      </div>}
      {!online && <Banner tone="offline" className={css.banner}>{t("momen.stack.offline")}</Banner>}

      <div className={css.stage}>
      <StackDeck items={noCard ? [] : items} index={noCard ? 0 : index} onIndex={move} onLike={photo => toggleHeart(photo, true)} now={now} panel={panel}
        label={t("ui.moments")} describe={at => stackCountSpoken(mode, props.offset + at, props.total, lang)} />

      <p className={css.hint}>{hint}</p>
      <p className={css.sr} aria-live="polite">{spoken}</p>

      <div className={css.actions}>
        {photoActions && shownHearts && current!.mine
          ? <span className={css.react} data-static role="img" aria-label={t("momen.stack.likesOnYours", { n: shownHearts.hearts })}><Heart aria-hidden />{shownHearts.hearts}</span>
          : photoActions && shownHearts ? <button type="button" className={css.react} aria-pressed={shownHearts.hearted} onClick={() => toggleHeart(current!)}
          aria-label={t(shownHearts.hearted ? "momen.stack.unlike" : "momen.stack.like", { n: shownHearts.hearts })}><Heart aria-hidden />{shownHearts.hearts}</button> : <span />}
        <Pressable href={mainWamPath.camera()} className={css.camera} aria-label={t("momen.stack.openCamera")}><Camera aria-hidden /></Pressable>
        {optionsAction ? <IconButton icon={Ellipsis} label={t("momen.photoOptions")} onClick={() => setSheet("pilihan")} /> : <span />}
      </div>
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
