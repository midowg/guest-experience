"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Camera, Hourglass, Images, LayoutGrid, RotateCcw, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, IconButton, EmptyState, FilterChip, List, ListRow, Pill, PhotoFill, Pressable, Segmented, Sheet, useToast } from "@/components/main-wam/ui";
import { useKnown, useLang, useT } from "@/components/main-wam/i18n";
import { ScreenContent, ShellActions, Stack } from "@/components/main-wam/shell";
import { errorText, praWamRequest } from "@/components/pra-wam/api";
import { UMUM } from "@/lib/main-wam/momen/types";
import type { QueueItem } from "@/lib/main-wam/momen/queue";
import type { SessionChoice } from "@/lib/main-wam/momen/sessions";
import { photoAlt } from "@/lib/main-wam/momen/stack";
import type { FeedAnswer, FeedPhoto, FeedView, SessionCount, SessionFilter } from "@/lib/main-wam/momen/types";
import { isDemoFile } from "@/lib/main-wam/momen/viewer";
import { mainWamApi, mainWamPath } from "@/lib/routes";
import { refusedForGood, SessionFilterSheet } from "./MomenSheets";
import { PhotoViewerSheet } from "./PhotoViewer";
import { MomenQueueRunner, useMomenQueue } from "./upload/QueueRunner";
import { momenQueue } from "./upload/sender";
import { useFreshAddress } from "./useFreshAddress";
import css from "./gallery.module.css";

export type GalleryProps = {
  view: FeedView;
  session: SessionFilter;
  sessionTitle: string | null;
  items: FeedPhoto[];
  next: string | null;
  total: number;
  counts: SessionCount[] | null;
  sessions: SessionChoice[];
  mozaik: boolean;
  migrated: boolean;
  nowIso: string;
};

const tone = (id: string) => ((parseInt(id.replace(/[^0-9a-f]/gi, "").slice(-4) || "0", 16) % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6;

/** A kept photo's small copy in the grid (a fresh address once, when the list's one has run out). */
function GridImg({ photo }: { photo: FeedPhoto }) {
  const small = useFreshAddress(photo.id, "kecil", photo.src.kecil);
  if (!small.src) return null;
  // eslint-disable-next-line @next/next/no-img-element -- short-lived storage addresses from the server
  return <img className={css.img} src={small.src} alt="" loading="lazy" decoding="async" onError={small.onError} />;
}

/** A queued photo's small copy, shown from this phone while it waits (object URL, freed after). */
function QueuedTile({ item, onOpen }: { item: QueueItem; onOpen: () => void }) {
  const t = useT();
  const url = useMemo(() => URL.createObjectURL(new Blob([item.kecil], { type: "image/jpeg" })), [item.kecil]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const label = item.state === "gagal" ? t("momen.gal.failed") : t("momen.gal.queued");
  return <button type="button" className={css.tile} onClick={onOpen} aria-label={item.state === "gagal" ? t("momen.gal.notSent") : t("momen.gal.waitingSend")}>
    {/* eslint-disable-next-line @next/next/no-img-element -- a photo on this phone */}
    <img className={css.img} src={url} alt="" />
    <span className={css.state} aria-hidden>{label}</span>
  </button>;
}

/**
 * M05 Galeri: Semua / Fotoku and "Semua sesi ▾", a grid of three (keyset pages as it scrolls, or
 * Muat lagi), and the way to the Mozaik. A tap opens the stack at that photo; in Fotoku it opens the
 * photo's sheet (Hapus foto), and photos still waiting on this phone come first, marked Antre or Gagal.
 */
export function Gallery(props: GalleryProps) {
  const { view, session } = props;
  const t = useT();
  const known = useKnown();
  const { lang } = useLang();
  const sessionTitle = session === UMUM ? t("momen.general") : props.sessionTitle;
  const router = useRouter();
  const toast = useToast();
  const now = useMemo(() => new Date(props.nowIso), [props.nowIso]);
  const [items, setItems] = useState(props.items);
  const [next, setNext] = useState(props.next);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [picking, setPicking] = useState(false);
  const [mine, setMine] = useState<FeedPhoto | null>(null);
  const [queued, setQueued] = useState<QueueItem | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removed, setRemoved] = useState(0);
  const sentinel = useRef<HTMLDivElement>(null);
  const queue = useMomenQueue();

  // A new filter remounts this (the page keys it), so the server's first page is the start.

  const loadMore = useCallback(async () => {
    if (!next || loading) return;
    setLoading(true);
    try {
      const { data } = await praWamRequest<FeedAnswer>(mainWamApi.photos({ lihat: view === "semua" ? undefined : view, sesi: session ?? undefined, sebelum: next }));
      setItems(list => [...list, ...data.items.filter(item => !list.some(other => other.id === item.id))]);
      setNext(data.next);
      setFailed(false);
    } catch { setFailed(true); } finally { setLoading(false); }
  }, [next, loading, view, session]);

  useEffect(() => {
    const element = sentinel.current;
    if (!element || !next || failed || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void loadMore(); }, { rootMargin: "600px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [next, failed, loadMore]);

  function filterTo(nextView: FeedView, nextSession: SessionFilter) {
    router.replace(mainWamPath.gallery({ lihat: nextView === "semua" ? undefined : nextView, sesi: nextSession ?? undefined }), { scroll: false });
  }

  async function removeMine() {
    if (!mine) return;
    setDeleting(true);
    try {
      await praWamRequest(mainWamApi.photo(mine.id), { method: "DELETE" });
      setItems(list => list.filter(item => item.id !== mine.id));
      setRemoved(count => count + 1);
      setConfirm(false); setMine(null);
      toast.show({ text: t("momen.photoDeleted"), tone: "success" });
    } catch (error) {
      // 409: the photo stays (nominated for Awarding); trying again would not change it.
      if (refusedForGood(error)) { setConfirm(false); setMine(null); }
      toast.show({ text: known(errorText(error)), tone: "error" });
    } finally { setDeleting(false); }
  }

  const total = Math.max(0, props.total - removed);
  // A long session name gives way; the count always shows ("Batu Night Spect… · 0 foto").
  const caption = session
    ? <><span className={css.captionName}>{sessionTitle ?? t("momen.sessionWord")}</span><span className={css.captionCount}>{t("momen.captionCount", { n: total })}</span></>
    : t("momen.photosN", { n: total });
  const waiting = view === "saya" ? queue.items.filter(item => !session || (session === UMUM ? !item.sessionId : item.sessionId === session)) : [];

  let body: ReactNode;
  if (!props.migrated) body = <EmptyState icon={Hourglass} title={t("peserta.waiting.title")}>{t("momen.gal.waitingBody")}</EmptyState>;
  else if (!items.length && !waiting.length) {
    // Filtered to a session without photos: a way back to every session (audit T-M02).
    const action = session
      ? <Button variant="text" onClick={() => filterTo(view, null)}>{t("momen.allSessions")}</Button>
      : view === "saya" ? <Button variant="tonal" size="m" icon={Camera} href={mainWamPath.camera()}>{t("momen.takePhoto")}</Button> : undefined;
    body = <EmptyState icon={Images} title={session ? t("momen.stack.sessionEmpty") : view === "saya" ? t("momen.gal.empty.mine") : t("momen.noneYet")} action={action} />;
  } else {
    body = <>
      <ul className={css.grid} aria-label={t("momen.gal.listLabel")}>
        {waiting.map(item => <li key={item.clientId}><QueuedTile item={item} onOpen={() => setQueued(item)} /></li>)}
        {items.map(photo => {
          const alt = photo.mine ? t("momen.altMine") : t("momen.altBy", { name: photo.owner.name });
          const label = `${alt}${photo.status !== "tampil" ? t("momen.gal.hiding") : ""}`;
          const inner = <>
            <PhotoFill tone={tone(photo.id)} className={css.fill} />
            <GridImg photo={photo} />
            {photo.status !== "tampil" && <span className={css.state} aria-hidden>{photo.status === "ditinjau" ? t("momen.gal.reviewing") : t("momen.gal.hidden")}</span>}
          </>;
          return <li key={photo.id}>
            {view === "saya"
              ? <Pressable className={css.tile} onClick={() => setMine(photo)} aria-label={label} title={photoAlt(photo, now, lang)}>{inner}</Pressable>
              : <Pressable className={css.tile} href={mainWamPath.moments({ sesi: session ?? undefined, foto: photo.id })} aria-label={label}>{inner}</Pressable>}
          </li>;
        })}
      </ul>
      {next && <div ref={sentinel} className={css.sentinel} aria-hidden />}
      {next && <div className={css.more}><Button variant="text" loading={loading} loadingLabel={t("momen.loadingShort")} onClick={() => { setFailed(false); void loadMore(); }}>{failed ? t("shell.retry") : t("momen.gal.loadMore")}</Button></div>}
    </>;
  }

  return <ScreenContent>
    <MomenQueueRunner />
    {props.mozaik && <ShellActions><IconButton variant="tonal" icon={LayoutGrid} label={t("momen.mosaic")} href={mainWamPath.mosaic()} /></ShellActions>}
    <Stack>
      <Segmented label={t("momen.gal.filterLabel")} value={view} onChange={value => filterTo(value, session)}
        options={[{ value: "semua", label: t("momen.all") }, { value: "saya", label: t("momen.myPhotos") }]} />
      <div className={css.bar}>
        <FilterChip menu name={t("momen.filterSessionTitle")} className={css.chip} active={session !== null} expanded={picking} disabled={!props.counts} onClick={() => setPicking(true)}>
          {session === UMUM ? t("momen.general") : sessionTitle ?? t("momen.allSessions")}
        </FilterChip>
        {/* With a session chosen the count shows even at 0 ("Batu Night Spectacular · 0 foto", audit T-M02). */}
        {props.migrated && (total > 0 || !!session) && <span className={css.caption}>{caption}</span>}
      </div>
      {body}
    </Stack>

    {props.counts && <SessionFilterSheet open={picking} onClose={() => setPicking(false)} sessions={props.sessions} counts={props.counts} value={session} now={now} onChange={value => filterTo(view, value)} />}
    {/* Fotoku: the same viewer as the Mozaik (large photo, Simpan foto), with Hapus foto under it. */}
    <PhotoViewerSheet open={!!mine && !confirm} onClose={() => setMine(null)}
      target={mine ? { id: mine.id, file: isDemoFile(mine.src.besar) ? mine.src.besar : null, detail: { id: mine.id, owner: { name: mine.owner.name }, mine: true, sessionTitle: props.sessions.find(item => item.id === mine.sessionId)?.title ?? (mine.sessionId ? null : t("momen.general")), takenAt: mine.takenAt } } : null}
      actions={<>
        {mine && mine.status !== "tampil" && <div style={{ display: "flex", justifyContent: "center" }}><Pill tone="warning">{mine.status === "ditinjau" ? t("momen.gal.pillReviewing") : t("momen.gal.pillHidden")}</Pill></div>}
        <List plain label={t("momen.photoOptions")}>
          <ListRow icon={<Trash2 className={css.danger} />} title={<span className={css.danger}>{t("momen.deletePhoto")}</span>} chevron={false} onClick={() => setConfirm(true)} />
        </List>
      </>} />
    <ConfirmDialog open={confirm} onCancel={() => setConfirm(false)} onConfirm={removeMine} tone="danger" icon={<Trash2 />} title={t("momen.deleteTitle")}
      body={props.mozaik ? t("momen.deleteBodyMosaic") : t("momen.deleteBody")} confirmLabel={t("momen.deletePhoto")} busy={deleting} busyLabel={t("momen.deleting")} />
    <Sheet open={!!queued} onClose={() => setQueued(null)} title={t("momen.yourPhoto")} subtitle={queued?.state === "gagal" ? known(queued.error ?? "") || t("srv.momen.notSentYet") : t("momen.gal.waitSignal")} flush>
      <List plain inset={68} label={t("momen.photoOptions")}>
        {queued?.state === "gagal" && <ListRow icon={<RotateCcw />} title={t("shell.retry")} chevron={false} onClick={() => { void momenQueue().retry(queued.clientId); setQueued(null); }} />}
        <ListRow icon={<Trash2 className={css.danger} />} title={<span className={css.danger}>{t("momen.gal.cancel")}</span>} chevron={false} onClick={() => { if (queued) void momenQueue().discard(queued.clientId); setQueued(null); }} />
      </List>
    </Sheet>
  </ScreenContent>;
}
