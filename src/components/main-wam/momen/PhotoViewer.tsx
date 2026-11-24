"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Download, ImageOff } from "lucide-react";
import { useLang, useT } from "@/components/main-wam/i18n";
import { Button, PhotoFill, Sheet, Skeleton } from "@/components/main-wam/ui";
import { praWamRequest } from "@/components/pra-wam/api";
import { photoTime } from "@/lib/main-wam/momen/stack";
import type { PhotoDetail } from "@/lib/main-wam/momen/types";
import { viewerFile } from "@/lib/main-wam/momen/viewer";
import { mainWamApi } from "@/lib/routes";
import { saveFile } from "./saveFile";
import css from "./viewer.module.css";

/**
 * What the viewer opens: the photo's id, and what is already known of it (the Gallery has the whole photo; a Mozaik tile
 * only has its id). `file` is a sample photo's local picture (Mode demo, previews): then nothing is asked of the server.
 */
export type ViewerTarget = { id: string; detail?: PhotoDetail | null; file?: string | null };

type Loaded = { id: string; detail: PhotoDetail | null; failed: boolean };

/**
 * The photo viewer (Mozaik, Fotoku): a sheet that opens at once with a frame while the photo's details load, the photo large
 * (4:5 as the camera takes it, from the file route, which checks access each time), who took it (the name Momen shows:
 * "Fotomu" for one's own), the session and time, and Simpan foto (the large file as a download). The sheet's ✕ (Tutup), Esc, Back and a tap beside it close it,
 * and focus goes back to where it was. `actions` are extra rows under the buttons (Fotoku: Hapus foto).
 */
export function PhotoViewerSheet({ open, onClose, target, actions }: { open: boolean; onClose: () => void; target: ViewerTarget | null; actions?: ReactNode }) {
  const t = useT();
  const { lang } = useLang();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [imageState, setImageState] = useState<{ id: string; state: "loading" | "loaded" | "failed"; attempt: number } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const id = target?.id ?? null;
  const known = target?.detail ?? null;

  // The details of a photo the caller only knows by its id (a Mozaik tile): asked once the sheet opens.
  useEffect(() => {
    if (!open || !id || known) return;
    let stopped = false;
    praWamRequest<PhotoDetail>(mainWamApi.photo(id))
      .then(({ data }) => { if (!stopped) setLoaded({ id, detail: data, failed: false }); })
      .catch(() => { if (!stopped) setLoaded({ id, detail: null, failed: true }); });
    return () => { stopped = true; };
  }, [open, id, known, attempt]);

  const detail = known ?? (loaded?.id === id ? loaded.detail : null);
  const detailFailed = !known && loaded?.id === id && loaded.failed;
  const file = useMemo(() => (id ? viewerFile(id, target?.file) : null), [id, target?.file]);
  const [now] = useState(() => new Date());
  const image = imageState && imageState.id === id && imageState.attempt === attempt ? imageState.state : "loading";
  const who = detail ? (detail.mine ? t("momen.altMine") : detail.owner.name) : null;
  const when = detail ? [detail.sessionTitle, photoTime(detail.takenAt, now, lang)].filter(Boolean).join(" · ") : null;
  const setImage = (state: "loading" | "loaded" | "failed") => id && setImageState({ id, state, attempt });

  return <Sheet open={open && !!target} onClose={onClose} title={who ?? t("momen.view.title")} subtitle={when ?? undefined} flush>
    {target && file && <div className={css.body}>
      <div className={css.frame} data-testid="viewer-frame">
        <PhotoFill tone={2} className={css.fill} />
        {/* eslint-disable-next-line @next/next/no-img-element -- the large photo through the file route (a redirect to a short-lived storage address) */}
        <img key={`${file.view}:${attempt}`} className={css.photo} src={file.view} alt={who ? (detail?.mine ? t("momen.altMine") : t("momen.altBy", { name: who })) : t("momen.view.photoAlt")} draggable={false} decoding="async"
          data-loaded={image === "loaded" ? "true" : "false"} onLoad={() => setImage("loaded")} onError={() => setImage("failed")} />
        {image === "failed" && <div className={css.fail} role="alert">
          <ImageOff aria-hidden />
          <span>{t("momen.view.failed")}</span>
          <Button variant="tonal" size="m" onClick={() => { setAttempt(count => count + 1); setImageState(null); }}>{t("shell.retry")}</Button>
        </div>}
      </div>
      {!detail && <div className={css.meta} aria-live="polite">
        {detailFailed
          ? <p className={css.error} role="alert">{t("momen.view.detailFailed")} <Button variant="text" size="m" onClick={() => { setLoaded(null); setAttempt(count => count + 1); }}>{t("shell.retry")}</Button></p>
          : <Skeleton className={css.skel} />}
      </div>}
      <div className={css.actions}>
        <Button block icon={Download} onClick={() => saveFile(file.download, file.name)}>{t("momen.view.save")}</Button>
        {actions}
      </div>
    </div>}
  </Sheet>;
}
