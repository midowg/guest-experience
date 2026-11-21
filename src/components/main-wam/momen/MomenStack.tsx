"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Camera, CircleCheck, CloudOff, Ellipsis, EyeOff, Grid3x3, Hourglass, Images, LayoutGrid, MoveHorizontal } from "lucide-react";
import { useKnown, useLang, useT } from "@/components/main-wam/i18n";
import { ShellActions, ShellChrome } from "@/components/main-wam/shell";
import { Banner, Button, IconBox, IconButton, Spinner, TopBar, useToast } from "@/components/main-wam/ui";
import { errorText, praWamRequest } from "@/components/pra-wam/api";
import { HEART, myReaction, withReaction, type ReactionCount } from "@/lib/main-wam/momen/reactions";
import { createSeenQueue, refusedForGoodStatus, type SeenQueue } from "@/lib/main-wam/momen/seen";
import { stackCountSpoken, type StackMode } from "@/lib/main-wam/momen/stack";
import { type FeedAnswer, type FeedPhoto, type Reactor, type SessionFilter } from "@/lib/main-wam/momen/types";
import type { PhotoStatus } from "@/lib/main-wam/types";
import { mainWamApi, mainWamPath } from "@/lib/routes";
import { DeletePhotoDialog, PhotoOptionsSheet, refusedForGood, ReportSheet } from "./MomenSheets";
import { QuickReactions, ReactorsSheet } from "./Reactions";
import { StackDeck } from "./StackDeck";
import { MomenQueueRunner } from "./upload/QueueRunner";
import css from "./momen.module.css";

export type MomenStackProps = {
  mode: StackMode;
  session: SessionFilter;
  /** The line's name of the session filter ("Pemaparan departemen", "Umum"). */
  sessionTitle: string | null;
  items: FeedPhoto[];
  next: string | null;
  /** How many the counter counts: new photos (baru), the session's photos, the gallery's photos. */
  total: number;
  startIndex: number;
  /** Galeri: photos newer than the first one loaded (the counter starts after them). */
  offset: number;
  mozaik: boolean;
  migrated: boolean;
  /** The view has photos at all (baru with none new = "Kamu sudah lihat semua"). */
  anyPhotos: boolean;
  /** Opened from a note about one's own hidden photo. */
  own: { id: string; status: PhotoStatus; reason: string } | null;
  eventName: string;
  /** The viewer, for their avatar on the reactions pill (name and photo); absent in some previews. */
  me?: { name: string; photo: string | null } | null;
  nowIso: string;
  /** Dev preview only: a fixed state to look at (a sheet open, offline, loading, …), no network. */
  demo?: StackDemo;
};
export type StackDemo = { sheet?: "pilihan" | "lapor" | "hapus" | "daftar"; hiddenForMe?: boolean; offline?: boolean; loading?: boolean; hint?: boolean; /** The list "who reacted" the sheet shows (no network). */ reactors?: Reactor[] | "memuat" | "gagal" };

const HINT_KEY = "mw-momen-geser";
/** How often the "seen all" panel looks for new photos (ms). */
const POLL_MS = 20_000;
const subscribeOnline = (notify: () => void) => { window.addEventListener("online", notify); window.addEventListener("offline", notify); return () => { window.removeEventListener("online", notify); window.removeEventListener("offline", notify); }; };

/** Read once in the browser (localStorage may throw: private windows, blocked storage). */
function readFlag(key: string): boolean {
  try { return window.localStorage.getItem(key) === "1"; } catch { return true; }
}

/**
 * M01–M04: Momen as a stack of photos to swipe through (Instagram Instants), every photo for everyone. The stack
 * holds only the photos not seen yet (the person's own one shows once, first): a photo that was in front counts as
 * seen and is not in the stack next time, only in the gallery; at the end "Kamu sudah lihat semua" (M03), and a
 * photo that comes in later appears there as new (a light poll while that panel is up). The title bar has only the
 * Foto button (and Galeri). There is no counter of photos and no next/previous button: the stack is swiped.
 * Messages under a photo are postponed: there is no comment UI at all.
 * Reactions: eight plain emoji under the photo (4 × 2), a small pill inside the photo (three avatars and the number of
 * reactions; a tap on it opens the list of who reacted with what, where one's own reaction can be taken back); one
 * per person, a tap on the same emoji takes it back, a double tap on the photo is the red heart. "…" on the photo → Laporkan foto (M04) or Hapus foto (one's own). Opened from
 * the gallery (`foto`), it starts at that photo with ‹ Galeri. The server gave the first page; more pages
 * come five cards ahead; seen photos are told to the server in small batches.
 */
export function MomenStack(props: MomenStackProps) {
  const { mode, session, mozaik, migrated } = props;
  const t = useT();
  const known = useKnown();
  const { lang } = useLang();
  const router = useRouter();
  const toast = useToast();
  const now = useMemo(() => new Date(props.nowIso), [props.nowIso]);
  // The stack (baru) holds only unseen photos: anything the server still sends as seen (an older database) is left out.
  const [start] = useState(() => {
    if (mode !== "baru") return { items: props.items, index: props.startIndex };
    const before = props.items.slice(0, props.startIndex).filter(item => item.seen).length;
    return { items: props.items.filter(item => !item.seen), index: Math.max(0, props.startIndex - before) };
  });
  const [items, setItems] = useState(start.items);
  const [next, setNext] = useState(props.next);
  const [index, setIndex] = useState(start.index);
  const [total, setTotal] = useState(props.total);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  /** The reactions just given (shown at once, replaced by the server's answer); the photo's own list until then. */
  const [given, setGiven] = useState<Record<string, ReactionCount[]>>({});
  const reactionRuns = useRef(new Map<string, number>());
  const demo = props.demo;
  const [hiddenForMe, setHiddenForMe] = useState<Set<string>>(() => new Set(demo?.hiddenForMe && props.items[props.startIndex] ? [props.items[props.startIndex].id] : []));
  const [sheet, setSheet] = useState<"pilihan" | "lapor" | "hapus" | "daftar" | null>(demo?.sheet ?? null);
  const [deleting, setDeleting] = useState(false);
  const [spoken, setSpoken] = useState("");
  const [hintSeen, setHintSeen] = useState(true);
  const browserOnline = useSyncExternalStore(subscribeOnline, () => navigator.onLine !== false, () => true);
  const online = demo?.offline ? false : browserOnline;
  const seenQueue = useRef<SeenQueue | null>(null);
  /** Photos that were in front in this visit (told to the queue once). */
  const marked = useRef(new Set<string>());

  // A new filter remounts this (the page keys it), so the server's first page is the start.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage, read after hydration
  useEffect(() => { setHintSeen(demo ? !demo.hint : readFlag(HINT_KEY)); }, [demo]);

  const current = index < items.length ? items[index] : null;
  const reactionsOf = useCallback((photo: FeedPhoto) => given[photo.id] ?? photo.reactions, [given]);
  const chosen = current ? myReaction(reactionsOf(current)) : null;

  /*
   * Seen: a photo is told to the queue the moment it is in front (swiping to it, or opening the stack on it), the person's
   * own included. The queue (lib/seen.ts) sends it in batches every few seconds, when the app goes to the background, when the
   * network is back and when this screen closes; a failed send stays queued (and in the phone's storage), so a bad network
   * never brings a seen photo back or loses the mark. Photos still queued from an earlier visit are left out of the stack.
   */
  useEffect(() => {
    if (demo) return;
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* blocked: the queue lives in memory only */ }
    const queue = createSeenQueue(async (ids, keepalive) => {
      try {
        const response = await fetch(mainWamApi.photosSeen, { method: "POST", credentials: "same-origin", keepalive, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
        return response.ok || refusedForGoodStatus(response.status);
      } catch { return false; }
    }, storage);
    seenQueue.current = queue;
    if (mode === "baru") {
      // Only what an earlier visit left queued (read now: the front photo is marked right after this, and stays in the stack).
      const earlier = new Set(queue.waiting());
      const gone = (list: FeedPhoto[]) => list.filter(item => !earlier.has(item.id));
      const dropped = start.items.filter(item => earlier.has(item.id)).length;
      if (dropped) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- the queue is browser storage, read after hydration
        setItems(gone);
        setTotal(count => Math.max(0, count - dropped));
      }
    }
    void queue.flush();
    const timer = window.setInterval(() => void queue.flush(), 3000);
    const away = () => { if (document.visibilityState === "hidden") void queue.flush(true); };
    const leave = () => void queue.flush(true);
    const back = () => void queue.flush();
    document.addEventListener("visibilitychange", away);
    window.addEventListener("pagehide", leave);
    window.addEventListener("online", back);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", away); window.removeEventListener("pagehide", leave); window.removeEventListener("online", back);
      void queue.flush(true);
      seenQueue.current = null;
    };
  }, [demo, mode, start.items]);
  useEffect(() => {
    const queue = seenQueue.current;
    if (!queue || !current || current.seen || marked.current.has(current.id)) return;
    marked.current.add(current.id);
    queue.add(current.id);
  }, [current]);

  /* At the end of the stack ("Kamu sudah lihat semua"): a photo that comes in later shows up as new. A light poll while the panel is up. */
  const waitingForNew = mode === "baru" && migrated && !demo && !current && !next;
  useEffect(() => {
    if (!waitingForNew) return;
    let alive = true;
    let running = false;
    const poll = async () => {
      if (running || document.visibilityState === "hidden" || navigator.onLine === false) return;
      running = true;
      try {
        const { data } = await praWamRequest<FeedAnswer>(mainWamApi.photos({ sebelum: "b~" }));
        if (!alive) return;
        const fresh = data.items.filter(item => !item.seen && !marked.current.has(item.id) && !seenQueue.current?.has(item.id));
        if (!fresh.length) return;
        setItems(list => { const more = fresh.filter(item => !list.some(other => other.id === item.id)); return more.length ? [...list, ...more] : list; });
        setNext(data.next);
        setTotal(count => count + Math.max(fresh.length, data.total ?? 0));
      } catch { /* the next tick tries again */ } finally { running = false; }
    };
    const timer = window.setInterval(() => void poll(), POLL_MS);
    const visible = () => { if (document.visibilityState === "visible") void poll(); };
    const back = () => void poll();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", back);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); window.removeEventListener("online", back); };
  }, [waitingForNew]);

  /* More photos, five cards ahead (keyset cursor from the server). */
  const loadMore = useCallback(async () => {
    if (!next || loading) return;
    setLoading(true);
    try {
      const { data } = await praWamRequest<FeedAnswer>(mainWamApi.photos({ sesi: session ?? undefined, sebelum: next }));
      // Photos seen meanwhile (this visit, or a mark still queued) do not come back into the stack.
      const stays = (item: FeedPhoto) => mode !== "baru" || (!item.seen && !seenQueue.current?.has(item.id) && !marked.current.has(item.id));
      setItems(list => [...list, ...data.items.filter(item => stays(item) && !list.some(other => other.id === item.id))]);
      setNext(data.next);
      setLoadError(false);
    } catch { setLoadError(true); } finally { setLoading(false); }
  }, [next, loading, session, mode]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- starts a request (its "loading" flag), not derived state
  useEffect(() => { if (!demo && next && !loading && !loadError && items.length - index <= 5) void loadMore(); }, [items.length, index, next, loading, loadError, loadMore, demo]);

  function move(to: number, how: "swipe" | "key") {
    setIndex(to);
    if (how !== "swipe") setSpoken(to >= items.length ? t("momen.stack.seenAll") : stackCountSpoken(mode, props.offset + to, total, lang));
    if (!hintSeen) { setHintSeen(true); try { window.localStorage.setItem(HINT_KEY, "1"); } catch { /* not kept */ } }
  }

  function allSessions() {
    router.replace(mainWamPath.moments(), { scroll: false });
  }

  /**
   * React to a photo with `emoji` (the same one again takes it back; another replaces the old one). The count moves
   * at once; the server's answer replaces it, and a failure puts back what was there. Only the latest tap of a photo
   * counts when answers come out of order.
   */
  async function react(photo: FeedPhoto, emoji: string) {
    if (photo.mine) return;
    const before = reactionsOf(photo);
    const want = myReaction(before) === emoji ? null : emoji;
    const run = (reactionRuns.current.get(photo.id) ?? 0) + 1;
    reactionRuns.current.set(photo.id, run);
    setGiven(map => ({ ...map, [photo.id]: withReaction(before, want) }));
    setSpoken(want ? t("momen.react.set", { emoji: want }) : t("momen.react.unset"));
    try {
      const { data } = await praWamRequest<{ reactions: ReactionCount[] }>(mainWamApi.photoReaction(photo.id), want ? { method: "PUT", json: { emoji: want } } : { method: "DELETE" });
      if (reactionRuns.current.get(photo.id) === run) setGiven(map => ({ ...map, [photo.id]: data.reactions }));
    } catch (error) {
      if (reactionRuns.current.get(photo.id) === run) setGiven(map => ({ ...map, [photo.id]: before }));
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
  const galeriHref = mainWamPath.gallery({ sesi: session ?? undefined });
  let panel: ReactNode = null;
  let noCard = false;
  if (demo?.loading) {
    noCard = true;
    panel = <Spinner label="Memuat foto" />;
  } else if (!migrated) {
    noCard = true;
    panel = <><IconBox icon={Hourglass} size={64} round /><h2 className={css.panelTitle}>{t("peserta.waiting.title")}</h2><p className={css.panelBody}>{t("momen.stack.waitingBody")}</p></>;
  } else if (props.own && current?.id === props.own.id && props.own.status !== "tampil") {
    panel = <><IconBox icon={EyeOff} size={64} round />
      <h2 className={css.panelTitle}>{props.own.status === "disembunyikan" ? t("momen.stack.ownHidden") : t("momen.stack.ownHiddenTemp")}</h2>
      <p className={css.panelBody}>{props.own.status === "disembunyikan" ? props.own.reason || t("momen.stack.ownHiddenReason") : t("momen.stack.reviewing")}</p></>;
  } else if (current && hiddenForMe.has(current.id)) {
    panel = <><IconBox icon={EyeOff} size={64} round /><h2 className={css.panelTitle}>{t("momen.stack.hiddenForYou")}</h2>
      <Button variant="tonal" size="m" onClick={() => showAgain(current)}>{t("momen.stack.showAgain")}</Button></>;
  } else if (!items.length && !(mode === "baru" && props.anyPhotos)) {
    noCard = true;
    panel = <><IconBox icon={Images} size={64} round /><h2 className={css.panelTitle}>{session ? t("momen.stack.sessionEmpty") : t("momen.noneYet")}</h2>
      {session
        ? <Button variant="tonal" size="m" onClick={allSessions}>{t("momen.allSessions")}</Button>
        : <><p className={css.panelBody}>{t("momen.stack.beFirst", { event: props.eventName })}</p>
          <Button variant="tonal" size="m" icon={Camera} href={mainWamPath.camera()}>{t("momen.takePhoto")}</Button></>}</>;
  } else if (!current && next) {
    panel = loadError
      ? <><IconBox icon={CloudOff} size={64} round /><h2 className={css.panelTitle}>{t("momen.stack.loadFailed")}</h2><Button variant="tonal" size="m" onClick={() => { setLoadError(false); void loadMore(); }}>{t("shell.retry")}</Button></>
      : <Spinner label="Memuat foto" />;
  } else if (!current) {
    noCard = true;
    panel = <><IconBox icon={CircleCheck} size={64} round /><h2 className={css.panelTitle}>{t("momen.stack.seenAll")}</h2>
      <p className={css.panelBody}>{t("momen.stack.seenAllBody")}</p>
      <div className={css.panelActions}>
        <Button block icon={Camera} href={mainWamPath.camera()}>{t("momen.takePhoto")}</Button>
        <Button block variant="secondary" icon={Grid3x3} href={galeriHref}>{t("momen.stack.openGallery")}</Button>
        {mozaik && <Button block variant="secondary" icon={LayoutGrid} href={mainWamPath.mosaic()}>{t("momen.stack.seeMosaic")}</Button>}
      </div></>;
  }

  /* The line under the cards: only the first-time hint to swipe (no counter of photos). */
  const hint: ReactNode = migrated && mode === "baru" && current && !panel && !hintSeen ? <><MoveHorizontal aria-hidden />{t("momen.stack.swipeHint")}</> : null;

  // Reactions for a photo on show (another person's); one's own hidden photo keeps Pilihan foto (Hapus foto).
  const ownHidden = !!props.own && current?.id === props.own.id;
  const photoActions = !!current && !noCard && !panel;
  const ownHiddenOptions = ownHidden && !!current && !photoActions;
  return <>
    {!demo && <MomenQueueRunner />}
    {mode === "galeri" ? <>
      <ShellChrome hideTopBar />
      <div className={css.ownBar}>
        <TopBar variant="back" title={t("momen.stack.galleryTitleAll")} backHref={galeriHref}
          onBack={event => { if (window.history.length > 1) { event.preventDefault(); router.back(); } }} />
      </div>
    </> : <ShellActions>
      <IconButton variant="tonal" icon={Grid3x3} label={t("momen.gallery")} href={galeriHref} />
      <Button size="m" icon={<Camera />} href={mainWamPath.camera()}><span className={css.photoLabel}>{t("momen.photoShort")}</span></Button>
    </ShellActions>}

    <div className={css.view}>
      {!online && <Banner tone="offline" className={css.banner}>{t("momen.stack.offline")}</Banner>}

      <div className={css.stage}>
      <StackDeck items={noCard ? [] : items} index={noCard ? 0 : index} onIndex={move} onLike={photo => { if (myReaction(reactionsOf(photo)) !== HEART) void react(photo, HEART); }}
        onReactors={() => setSheet("daftar")} onOptions={photoActions ? () => setSheet("pilihan") : undefined} reactionsOf={reactionsOf} me={props.me} now={now} panel={panel}
        label={t("ui.moments")} describe={at => stackCountSpoken(mode, props.offset + at, total, lang)} seenTag={mode === "galeri"} />

      <p className={css.hint}>{hint}</p>
      <p className={css.sr} aria-live="polite">{spoken}</p>

      <div className={css.actions}>
        {photoActions && !current!.mine && <QuickReactions chosen={chosen} onPick={emoji => void react(current!, emoji)} />}
        {ownHiddenOptions && <IconButton icon={Ellipsis} label={t("momen.photoOptions")} onClick={() => setSheet("pilihan")} />}
      </div>
      </div>
    </div>

    {current && <ReactorsSheet open={sheet === "daftar"} onClose={() => setSheet(null)} photoId={current.id} demo={demo?.reactors}
      onRemove={async emoji => { if (!current.mine && myReaction(reactionsOf(current)) === emoji) await react(current, emoji); }} />}
    {current && <PhotoOptionsSheet open={sheet === "pilihan"} onClose={() => setSheet(null)} owner={current.owner.name} mine={current.mine}
      onReport={() => setSheet("lapor")} onDelete={() => setSheet("hapus")} />}
    <ReportSheet open={sheet === "lapor"} onClose={() => setSheet(null)} onSubmit={report} />
    <DeletePhotoDialog open={sheet === "hapus"} busy={deleting} mozaik={mozaik} onCancel={() => setSheet(null)} onConfirm={removeMine} />
  </>;
}
