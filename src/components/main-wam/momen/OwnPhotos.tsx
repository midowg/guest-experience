"use client";

import { useEffect, useMemo } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { useKnown, useLang, useT } from "@/components/main-wam/i18n";
import { List, ListRow, PhotoFill, Sheet } from "@/components/main-wam/ui";
import type { QueueItem } from "@/lib/main-wam/momen/queue";
import { photoAlt } from "@/lib/main-wam/momen/stack";
import type { FeedPhoto } from "@/lib/main-wam/momen/types";
import { momenQueue } from "./upload/sender";
import { useFreshAddress } from "./useFreshAddress";
import css from "./mosaic.module.css";

const tone = (id: string) => ((parseInt(id.replace(/[^0-9a-f]/gi, "").slice(-4) || "0", 16) % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6;

/** A kept photo's small copy (a fresh address once, when the list's one has run out). */
function OwnImg({ photo }: { photo: FeedPhoto }) {
  const small = useFreshAddress(photo.id, "kecil", photo.src.kecil);
  if (!small.src) return null;
  // eslint-disable-next-line @next/next/no-img-element -- short-lived storage addresses from the server
  return <img className={css.mineImg} src={small.src} alt="" loading="lazy" decoding="async" onError={small.onError} />;
}

/** A queued photo's small copy, shown from this phone while it waits (object URL, freed after). */
function QueuedTile({ item, onOpen }: { item: QueueItem; onOpen: () => void }) {
  const t = useT();
  const url = useMemo(() => URL.createObjectURL(new Blob([item.kecil], { type: "image/jpeg" })), [item.kecil]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const label = item.state === "gagal" ? t("momen.own.failed") : t("momen.own.queued");
  return <button type="button" className={css.mineThumb} onClick={onOpen} aria-label={item.state === "gagal" ? t("momen.own.notSent") : t("momen.own.waitingSend")}>
    {/* eslint-disable-next-line @next/next/no-img-element -- a photo on this phone */}
    <img className={css.mineImg} src={url} alt="" />
    <span className={css.ownState} aria-hidden>{label}</span>
  </button>;
}

/**
 * Fotoku in the Mozaik: the person's own photos as a small row (also the ones not in the mosaic yet: In review, Hidden), the
 * ones still waiting on this phone first, marked Antre or Gagal. A tap opens the viewer (with Hapus foto) or the queue's sheet.
 */
export function OwnPhotos({ photos, waiting, total, now, onOpen, onOpenQueued }: {
  photos: FeedPhoto[]; waiting: QueueItem[]; total: number; now: Date; onOpen: (photo: FeedPhoto) => void; onOpenQueued: (item: QueueItem) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  if (!photos.length && !waiting.length) return null;
  return <section className={css.ownBox} aria-labelledby="mw-own-photos">
    <h2 id="mw-own-photos" className={css.ownTitle}>{t("momen.myPhotos")}<span className={css.ownCount}>{t("momen.photosN", { n: total + waiting.length })}</span></h2>
    <ul className={css.own} aria-label={t("momen.myPhotos")}>
      {waiting.map(item => <li key={item.clientId}><QueuedTile item={item} onOpen={() => onOpenQueued(item)} /></li>)}
      {photos.map(photo => {
        const label = `${t("momen.altMine")}${photo.status !== "tampil" ? t("momen.own.hiding") : ""}`;
        return <li key={photo.id}>
          <button type="button" className={css.mineThumb} onClick={() => onOpen(photo)} aria-label={label} title={photoAlt(photo, now, lang)}>
            <PhotoFill tone={tone(photo.id)} className={css.fill} />
            <OwnImg photo={photo} />
            {photo.status !== "tampil" && <span className={css.ownState} aria-hidden>{photo.status === "ditinjau" ? t("momen.own.reviewing") : t("momen.own.hidden")}</span>}
          </button>
        </li>;
      })}
    </ul>
  </section>;
}

/** What a photo still waiting on this phone can do: Coba lagi (when it failed) and Batalkan. */
export function QueuedSheet({ item, onClose }: { item: QueueItem | null; onClose: () => void }) {
  const t = useT();
  const known = useKnown();
  return <Sheet open={!!item} onClose={onClose} title={t("momen.yourPhoto")} subtitle={item?.state === "gagal" ? known(item.error ?? "") || t("srv.momen.notSentYet") : t("momen.own.waitSignal")} flush>
    <List plain inset={68} label={t("momen.photoOptions")}>
      {item?.state === "gagal" && <ListRow icon={<RotateCcw />} title={t("shell.retry")} chevron={false} onClick={() => { void momenQueue().retry(item.clientId); onClose(); }} />}
      <ListRow icon={<Trash2 className={css.danger} />} title={<span className={css.danger}>{t("momen.own.cancel")}</span>} chevron={false} onClick={() => { if (item) void momenQueue().discard(item.clientId); onClose(); }} />
    </List>
  </Sheet>;
}
