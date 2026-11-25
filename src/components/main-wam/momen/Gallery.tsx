"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Camera, Hourglass, Images, Tag, Trash2, UserRoundX } from "lucide-react";
import { Button, ConfirmDialog, EmptyState, List, ListRow, Pill, PhotoFill, Pressable, Segmented, useToast } from "@/components/main-wam/ui";
import { useKnown, useLang, useT } from "@/components/main-wam/i18n";
import { ScreenContent, Stack } from "@/components/main-wam/shell";
import { errorText, praWamRequest } from "@/components/pra-wam/api";
import type { QueueItem } from "@/lib/main-wam/momen/queue";
import { photoAlt } from "@/lib/main-wam/momen/stack";
import { togetherNames, type TaggedAnswer, type TaggedPhoto } from "@/lib/main-wam/momen/tagged";
import type { FeedAnswer, FeedPhoto } from "@/lib/main-wam/momen/types";
import { isDemoFile } from "@/lib/main-wam/momen/viewer";
import { mainWamApi, mainWamPath } from "@/lib/routes";
import { DeletePhotoDialog, refusedForGood } from "./MomenSheets";
import { QueuedSheet } from "./OwnPhotos";
import { PhotoViewerSheet } from "./PhotoViewer";
import { MomenQueueRunner, useMomenQueue } from "./upload/QueueRunner";
import { useFreshAddress } from "./useFreshAddress";
import css from "./gallery.module.css";

type Tab = "fotoku" | "ditandai";
type Page<T> = { items: T[]; next: string | null; total: number; migrated: boolean };

export type GalleryProps = {
  /** The tab it opens on. */
  tab: Tab;
  own: Page<FeedPhoto>;
  tagged: TaggedAnswer;
  /** The sessions' names, for a photo's details. */
  sessions: { id: string; title: string }[];
  mozaik: boolean;
  migrated: boolean;
  nowIso: string;
  /** Previews: no requests, no phone queue. */
  demo?: boolean;
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
  const label = item.state === "gagal" ? t("momen.own.failed") : t("momen.own.queued");
  return <button type="button" className={css.tile} onClick={onOpen} aria-label={item.state === "gagal" ? t("momen.own.notSent") : t("momen.own.waitingSend")}>
    {/* eslint-disable-next-line @next/next/no-img-element -- a photo on this phone */}
    <img className={css.img} src={url} alt="" />
    <span className={css.state} aria-hidden>{label}</span>
  </button>;
}

/** The "Muat lagi" under a grid with more pages (the first page is 30), and its failure. */
function More({ next, loading, failed, onMore }: { next: string | null; loading: boolean; failed: boolean; onMore: () => void }) {
  const t = useT();
  if (!next) return null;
  return <div className={css.more}>
    {failed && <p className={css.failed} role="alert">{t("momen.gal.loadFailed")}</p>}
    <Button variant="text" loading={loading} loadingLabel={t("momen.loadingShort")} onClick={onMore}>{failed ? t("shell.retry") : t("momen.gal.loadMore")}</Button>
  </div>;
}

/** Pages of a list: the first from the server, the rest by cursor ("Muat lagi"). */
function usePaged<T extends { id: string }>(first: Page<T>, ask: (cursor: string) => Promise<{ items: T[]; next: string | null }>, demo?: boolean) {
  const [items, setItems] = useState(first.items);
  const [next, setNext] = useState(first.next);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [removed, setRemoved] = useState(0);
  const more = useCallback(async () => {
    if (!next || loading || demo) return;
    setLoading(true);
    try {
      const page = await ask(next);
      setItems(list => [...list, ...page.items.filter(item => !list.some(other => other.id === item.id))]);
      setNext(page.next);
      setFailed(false);
    } catch { setFailed(true); } finally { setLoading(false); }
  }, [next, loading, demo, ask]);
  const remove = useCallback((id: string) => { setItems(list => list.filter(item => item.id !== id)); setRemoved(count => count + 1); }, []);
  return { items, next, loading, failed, more, remove, total: Math.max(0, first.total - removed) };
}

/**
 * Fotoku: my own photos (any status: Ditinjau, Disembunyikan), those still waiting on this phone first (Antre, Gagal). A tap opens
 * the viewer "Fotomu" with Simpan foto and Hapus foto (or the queue's sheet for a waiting one).
 */
function OwnTab({ page, sessions, mozaik, now, demo }: { page: Page<FeedPhoto>; sessions: GalleryProps["sessions"]; mozaik: boolean; now: Date; demo?: boolean }) {
  const t = useT();
  const known = useKnown();
  const toast = useToast();
  const { lang } = useLang();
  const queue = useMomenQueue();
  const ask = useCallback((cursor: string) => praWamRequest<FeedAnswer>(mainWamApi.photos({ lihat: "saya", sebelum: cursor })).then(({ data }) => data), []);
  const list = usePaged(page, ask, demo);
  const [open, setOpen] = useState<FeedPhoto | null>(null);
  const [queued, setQueued] = useState<QueueItem | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const waiting = demo ? [] : queue.items;

  async function removeMine() {
    if (!open) return;
    setDeleting(true);
    try {
      if (!demo) await praWamRequest(mainWamApi.photo(open.id), { method: "DELETE" });
      list.remove(open.id);
      setConfirm(false); setOpen(null);
      toast.show({ text: t("momen.photoDeleted"), tone: "success" });
    } catch (error) {
      // 409: the photo stays (nominated for Awarding); trying again would not change it.
      if (refusedForGood(error)) { setConfirm(false); setOpen(null); }
      toast.show({ text: known(errorText(error)), tone: "error" });
    } finally { setDeleting(false); }
  }

  const count = list.total + waiting.length;
  if (!list.items.length && !waiting.length) {
    return <EmptyState icon={Images} title={t("momen.gal.emptyMine")} action={<Button variant="tonal" size="m" icon={Camera} href={mainWamPath.camera()}>{t("momen.takePhoto")}</Button>}>{t("momen.gal.emptyMineBody")}</EmptyState>;
  }
  return <div className={css.panel}>
    <p className={css.caption}>{t("momen.photosN", { n: count })}</p>
    <ul className={css.grid} aria-label={t("momen.gal.listMine")}>
      {waiting.map(item => <li key={item.clientId}><QueuedTile item={item} onOpen={() => setQueued(item)} /></li>)}
      {list.items.map(photo => {
        const label = `${t("momen.altMine")}${photo.status !== "tampil" ? t("momen.own.hiding") : ""}`;
        return <li key={photo.id}>
          <Pressable className={css.tile} onClick={() => setOpen(photo)} aria-label={label} title={photoAlt(photo, now, lang)}>
            <PhotoFill tone={tone(photo.id)} className={css.fill} />
            <GridImg photo={photo} />
            {photo.status !== "tampil" && <span className={css.state} aria-hidden>{photo.status === "ditinjau" ? t("momen.own.reviewing") : t("momen.own.hidden")}</span>}
          </Pressable>
        </li>;
      })}
    </ul>
    <More next={list.next} loading={list.loading} failed={list.failed} onMore={() => void list.more()} />

    <PhotoViewerSheet open={!!open && !confirm} onClose={() => setOpen(null)}
      target={open ? { id: open.id, file: isDemoFile(open.src.besar) ? open.src.besar : null, detail: { id: open.id, owner: { name: open.owner.name }, mine: true, sessionTitle: titleOf(sessions, open.sessionId, t("momen.general")), takenAt: open.takenAt } } : null}
      actions={<>
        {open && open.status !== "tampil" && <div className={css.statusPill}><Pill tone="warning">{open.status === "ditinjau" ? t("momen.own.pillReviewing") : t("momen.own.pillHidden")}</Pill></div>}
        <List plain label={t("momen.photoOptions")}>
          <ListRow icon={<Trash2 className={css.danger} />} title={<span className={css.danger}>{t("momen.deletePhoto")}</span>} chevron={false} onClick={() => setConfirm(true)} />
        </List>
      </>} />
    <DeletePhotoDialog open={confirm} busy={deleting} mozaik={mozaik} onCancel={() => setConfirm(false)} onConfirm={removeMine} />
    <QueuedSheet item={queued} onClose={() => setQueued(null)} />
  </div>;
}

/** A session's name for a photo's details; "Umum" when it has none; null when the session is not known (not shown). */
function titleOf(sessions: GalleryProps["sessions"], sessionId: string | null, general: string): string | null {
  return sessionId ? sessions.find(item => item.id === sessionId)?.title ?? null : general;
}

/**
 * Ditandai: photos of others that tag me (only shown ones, the same access as everywhere in Momen). A tap opens the viewer with the
 * name of who took it, "Bersama …", Simpan foto and Lepas tag (after a question).
 */
function TaggedTab({ page, sessions, now, demo }: { page: TaggedAnswer; sessions: GalleryProps["sessions"]; now: Date; demo?: boolean }) {
  const t = useT();
  const known = useKnown();
  const toast = useToast();
  const { lang } = useLang();
  const ask = useCallback((cursor: string) => praWamRequest<TaggedAnswer>(mainWamApi.taggedPhotos(cursor)).then(({ data }) => data), []);
  const list = usePaged<TaggedPhoto>({ ...page, total: page.total ?? page.items.length }, ask, demo);
  const [open, setOpen] = useState<TaggedPhoto | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function lift() {
    if (!open) return;
    setBusy(true);
    try {
      if (!demo) await praWamRequest(mainWamApi.missionUntag(open.id), { method: "DELETE" });
      list.remove(open.id);
      setConfirm(false); setOpen(null);
      toast.show({ text: t("momen.gal.untagged"), tone: "success" });
    } catch (error) {
      toast.show({ text: known(errorText(error)), tone: "error" });
    } finally { setBusy(false); }
  }

  if (!page.migrated) return <EmptyState icon={Hourglass} title={t("peserta.waiting.title")}>{t("momen.gal.taggedWaiting")}</EmptyState>;
  if (!list.items.length) return <EmptyState icon={Tag} title={t("momen.gal.emptyTagged")}>{t("momen.gal.emptyTaggedBody")}</EmptyState>;
  return <div className={css.panel}>
    <p className={css.caption}>{t("momen.photosN", { n: list.total })}</p>
    <ul className={css.grid} aria-label={t("momen.gal.listTagged")}>
      {list.items.map(photo => <li key={photo.id}>
        <Pressable className={css.tile} onClick={() => setOpen(photo)} aria-label={t("momen.altBy", { name: photo.owner.name })} title={photoAlt(photo, now, lang)}>
          <PhotoFill tone={tone(photo.id)} className={css.fill} />
          <GridImg photo={photo} />
          <span className={css.by} aria-hidden>{photo.owner.name}</span>
        </Pressable>
      </li>)}
    </ul>
    <More next={list.next} loading={list.loading} failed={list.failed} onMore={() => void list.more()} />

    <PhotoViewerSheet open={!!open && !confirm} onClose={() => setOpen(null)}
      target={open ? { id: open.id, file: isDemoFile(open.src.besar) ? open.src.besar : null, detail: { id: open.id, owner: { name: open.owner.name }, mine: false, sessionTitle: titleOf(sessions, open.sessionId, t("momen.general")), takenAt: open.takenAt } } : null}
      actions={open ? <>
        <p className={css.together}>{t("momen.gal.together", { names: togetherNames(t("momen.gal.you"), open.withNames) })}</p>
        <List plain label={t("momen.photoOptions")}>
          <ListRow icon={<UserRoundX className={css.danger} />} title={<span className={css.danger}>{t("momen.gal.untag")}</span>} chevron={false} onClick={() => setConfirm(true)} />
        </List>
      </> : undefined} />
    <ConfirmDialog open={confirm} onCancel={() => setConfirm(false)} onConfirm={lift} tone="danger" icon={<UserRoundX />} title={t("momen.gal.untagTitle")}
      body={t("momen.gal.untagBody")} confirmLabel={t("momen.gal.untag")} busy={busy} busyLabel={t("momen.gal.untagging")} />
  </div>;
}

/**
 * M05 Galeri (the icon in Momen's bar): two tabs, Fotoku (my photos, with their status) and Ditandai (photos of others that tag me),
 * each a grid of three with "Muat lagi" past 30 and a friendly empty state. The Mozaik keeps its own small Fotoku section.
 */
export function Gallery(props: GalleryProps) {
  const t = useT();
  const [tab, setTab] = useState<Tab>(props.tab);
  const [now] = useState(() => new Date(props.nowIso));

  function choose(next: Tab) {
    setTab(next);
    // Keep it in the address (Back, a shared link), without a navigation.
    window.history.replaceState(window.history.state, "", mainWamPath.gallery(next === "ditandai" ? "ditandai" : undefined));
  }

  let body: ReactNode;
  if (!props.migrated) body = <EmptyState icon={Hourglass} title={t("peserta.waiting.title")}>{t("momen.gal.waitingBody")}</EmptyState>;
  else body = tab === "fotoku"
    ? <OwnTab page={props.own} sessions={props.sessions} mozaik={props.mozaik} now={now} demo={props.demo} />
    : <TaggedTab page={props.tagged} sessions={props.sessions} now={now} demo={props.demo} />;

  return <ScreenContent>
    {!props.demo && <MomenQueueRunner />}
    <Stack>
      <Segmented className={css.tabs} label={t("momen.gal.tabsLabel")} value={tab} onChange={choose}
        options={[{ value: "fotoku", label: t("momen.gal.tabMine") }, { value: "ditandai", label: t("momen.gal.tabTagged") }]} />
      {body}
    </Stack>
  </ScreenContent>;
}
