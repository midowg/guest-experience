"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, Download, MapPin, Send, Tag } from "lucide-react";
import { useT } from "@/components/main-wam/i18n";
import { Button, IconButton, Segmented, Skeleton, SkeletonGroup } from "@/components/main-wam/ui";
import { useModal } from "@/components/main-wam/ui/useModal";
import type { Lang } from "@/lib/main-wam/i18n";
import type { TagCandidate } from "@/lib/main-wam/misi/rules";
import { CAMERA_TONE_IDS, cssFilter, toneTint, type CameraToneId } from "@/lib/main-wam/momen/camera-filters";
import { DEFAULT_SIGN, SIGN_IDS, type SignId } from "@/lib/main-wam/momen/camera-templates";
import { changeLook, clampIndex, DEFAULT_LOOK, knownIds, lookToAll, type Look } from "@/lib/main-wam/momen/editor";
import { EditorTagSheet, Person } from "./EditorTagSheet";
import { TemplateOverlay } from "./TemplateOverlay";
import type { ShareMode } from "./useShareLocation";
import css from "./photo-editor.module.css";

/*
 * "Foto baru" (docs/main-wam/KONTRAK.md §40): the screen between the shutter (or the gallery pick) and Kirim, in the style of a posting app, on the app's own
 * theme (light or dark), drawn to fit one screen with no scrolling:
 *   top bar     back arrow = Ulangi (back to the camera, the photo dropped), the title, "2/4" when there are several photos, the "Simpan asli di HP" toggle (a download icon, tonal when on; none for gallery files)
 *   the photo   as big as the space left (4:5, small corners), the sign and the filter drawn live over the plain picture (nothing is changed in it: the
 *               look is drawn only when Kirim is pressed); several photos: a small strip of thumbnails under it (the shown one ringed in gold)
 *   style       a small [Sign | Filter] switch (and the chip "Terapkan ke semua foto" beside it when there are several photos) over ONE row of preview
 *               tiles to swipe: your photo with each sign or each filter, the chosen one ringed in gold
 *   chips       [Tag orang] (opens the bottom sheet, EditorTagSheet), and [Tandai lokasi] (a toggle, only when it is relevant,
 *               the last not for pictures from the gallery)
 *   bottom bar  Kirim, full width, gold, always in view ("Kirim · 4 foto · 7 tag")
 * A full-screen dialog (useModal: focus kept inside, Esc and the phone's Back button give Ulangi). It opens at once after the shutter: while the frame is
 * still being made the photo is a skeleton and Kirim waits.
 */

export type EditorPhoto = { id: string; /** What is shown: an object URL of the plain picture (or a sample in the preview). */ url: string; fromGallery: boolean };
export type EditorResult = { /** One look per photo, in the order of `photos`. */ looks: Look[]; /** The people chosen, each once. */ tags: string[] };
export type EditorGeo = { mode: ShareMode; toggle: () => void };
type Panel = "sign" | "filter";

export function PhotoEditor({ photos, pending, candidates, lang, taken, ask, onAskChange, keep, onKeepChange, canKeep, geo, sending, demo, onSend, onRetake }: {
  /** The photos ready to look at (the plain pictures). */
  photos: readonly EditorPhoto[];
  /** How many more are still being made (a skeleton each; Kirim waits). */
  pending: number;
  /** The people the person may tag: active participants. None = no Tag chip. */
  candidates: readonly TagCandidate[];
  lang: Lang;
  /** When the photos were taken (ISO): the signs print the date and time. */
  taken: string;
  /** "Tanya setiap foto": on = the Tag sheet opens by itself with each photo. */
  ask: boolean;
  onAskChange: (ask: boolean) => void;
  /** "Simpan asli di HP". */
  keep: boolean;
  onKeepChange: (keep: boolean) => void;
  /** At least one photo comes from the camera (a picture from the gallery is already on the phone: nothing to keep). */
  canKeep: boolean;
  /** "Tandai lokasi", when some mission takes detection and the photo is from the camera. */
  geo: EditorGeo | null;
  /** Kirim was pressed: the photos are being made ready. */
  sending: boolean;
  /** Preview only: a state to look at. */
  demo?: { tags?: string[]; cur?: number; all?: boolean; query?: string; looks?: Look[]; panel?: Panel };
  onSend: (result: EditorResult) => void;
  /** Ulangi (also the back arrow, Esc and the phone's Back button): back to the camera, these photos dropped. */
  onRetake: () => void;
}) {
  const t = useT();
  const { dialogRef, titleRef, onKeyDown, onCancel: onDialogCancel } = useModal({ open: true, onClose: onRetake, locked: sending });
  const [cur, setCur] = useState(demo?.cur ?? 0);
  const [all, setAll] = useState(demo?.all ?? false);
  const [looks, setLooks] = useState<Record<string, Look>>(() => Object.fromEntries((demo?.looks ?? []).flatMap((look, index) => (photos[index] ? [[photos[index].id, look]] : []))));
  const [tags, setTags] = useState<string[]>(demo?.tags ?? []);
  const [panel, setPanel] = useState<Panel>(demo?.panel ?? "sign");
  const [sheet, setSheet] = useState(false);
  const thumbs = useRef<HTMLButtonElement | null>(null);
  const hasTags = candidates.length > 0;

  // "Tanya setiap foto" on: the Tag sheet opens by itself once the editor is up (after it, so it lies on top).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- opens after the first paint, on purpose
  useEffect(() => { if (ask && hasTags) setSheet(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only when the editor opens

  const items = photos.map(photo => ({ ...photo, ...(looks[photo.id] ?? DEFAULT_LOOK) }));
  const at = clampIndex(cur, items.length);
  const photo = items[at];
  const total = items.length + pending;
  const chosen = tags.filter(id => candidates.some(person => person.id === id));
  const byId = new Map(candidates.map(person => [person.id, person]));

  const store = (next: typeof items) => setLooks(Object.fromEntries(next.map(item => [item.id, { sign: item.sign, tone: item.tone }])));
  const pick = (change: Partial<Look>) => store(changeLook(items, at, change, all));
  const applyAll = () => { const on = !all; setAll(on); if (on) store(lookToAll(items, at)); };
  useEffect(() => { thumbs.current?.scrollIntoView?.({ inline: "center", block: "nearest" }); }, [at]);

  const send = () => onSend({ looks: items.map(item => ({ sign: item.sign, tone: item.tone })), tags: knownIds(tags, candidates) });
  const sendLabel = total > 1 ? t("momen.edit.sendMany", { n: total }) : t("momen.edit.send");
  const ready = pending === 0 && items.length > 0;
  const tone = photo?.tone ?? DEFAULT_LOOK.tone;
  const sign = photo?.sign ?? DEFAULT_LOOK.sign;
  const geoLabel = geo?.mode === "ditolak" ? t("momen.edit.geoBlocked") : t("momen.cam.geo.off");

  return <>
    <dialog ref={dialogRef} className={css.editor} aria-labelledby="momen-edit-title" aria-busy={sending || undefined} onKeyDown={onKeyDown} onCancel={onDialogCancel} data-momen-editor="">
      <div className={css.inner}>
        <div className={css.top}>
          <IconButton icon={ChevronLeft} label={t("momen.edit.back")} onClick={onRetake} disabled={sending} />
          <h2 id="momen-edit-title" ref={titleRef} tabIndex={-1} className={css.title}>{t("momen.edit.title")}</h2>
          {total > 1 && <span className={css.counter} role="status" aria-label={t("momen.edit.photoOf", { n: Math.min(at + 1, total), total })}>{Math.min(at + 1, total)}/{total}</span>}
          {canKeep && <IconButton icon={Download} label={t("momen.edit.keep")} title={t("momen.edit.keepSub")} pressed={keep} variant={keep ? "tonal" : "standard"} onClick={() => onKeepChange(!keep)} disabled={sending} />}
        </div>

        <div className={css.main}>
          <div className={css.stage}>
            <div className={css.view}>
              <div className={css.frame}>
                {photo
                  ? <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- the plain picture just made on this phone (object URL) or a sample */}
                    <img className={css.picture} src={photo.url} alt={total > 1 ? t("momen.edit.photoN", { n: at + 1 }) : t("momen.edit.photo")} style={{ filter: cssFilter(tone) }} />
                    {toneTint(tone) && <span className={css.matte} style={{ background: toneTint(tone) ?? undefined }} aria-hidden />}
                    <TemplateOverlay sign={sign} lang={lang} taken={taken} className={css.overlay} />
                  </>
                  : <SkeletonGroup label={t("momen.edit.preparing")} className={css.skeleton}><Skeleton shape="block" className={css.skeletonFill} /></SkeletonGroup>}
              </div>
            </div>
          </div>

          {total > 1 && <div className={css.thumbs} role="group" aria-label={t("momen.edit.thumbs")}>
            {items.map((item, index) => <button key={item.id} ref={index === at ? thumbs : undefined} type="button" className={css.thumb} aria-pressed={index === at} aria-label={t("momen.edit.thumb", { n: index + 1 })} onClick={() => setCur(index)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a picture on this phone */}
              <img src={item.url} alt="" style={{ filter: cssFilter(item.tone) }} />
            </button>)}
            {Array.from({ length: pending }, (_, index) => <span key={`wait-${index}`} className={css.thumbWait} aria-hidden />)}
          </div>}

          <div className={css.style}>
            <div className={css.segRow}>
              <Segmented label={t("momen.edit.segments")} value={panel} onChange={setPanel} className={css.seg}
                options={[{ value: "sign", label: t("momen.cam.signLabel") }, { value: "filter", label: t("momen.cam.toneLabel") }]} />
              {total > 1 && <button type="button" role="switch" aria-checked={all} className={css.all} disabled={sending} onClick={applyAll}>{t("momen.edit.all")}</button>}
            </div>
            <div className={css.tiles} role="radiogroup" aria-label={panel === "sign" ? t("momen.cam.signs") : t("momen.cam.tones")}>
              {panel === "sign"
                ? SIGN_IDS.map(id => <Tile key={id} label={t(`momen.cam.sign.${id}`)} checked={sign === id} disabled={!photo || sending} onClick={() => pick({ sign: id as SignId })}
                  url={photo?.url} tone={tone} sign={id} lang={lang} taken={taken} />)
                : CAMERA_TONE_IDS.map(id => <Tile key={id} label={t(`momen.cam.tone.${id}`)} checked={tone === id} disabled={!photo || sending} onClick={() => pick({ tone: id as CameraToneId })}
                  url={photo?.url} tone={id} sign={DEFAULT_SIGN} lang={lang} taken={taken} />)}
            </div>
          </div>

          <div className={css.chips}>
            {hasTags && <button type="button" className={css.chip} data-on={chosen.length ? "" : undefined} aria-haspopup="dialog" disabled={sending} onClick={() => setSheet(true)}>
              <Tag aria-hidden />{chosen.length ? t(chosen.length === 1 ? "momen.edit.tagChipOne" : "momen.edit.tagChip", { n: chosen.length }) : t("momen.edit.tag")}
              {chosen.length > 0 && <span className={css.stack} aria-hidden>{chosen.slice(0, 3).map(id => <Person key={id} person={byId.get(id)!} size={20} />)}</span>}
            </button>}
            {geo && <button type="button" role="switch" aria-checked={geo.mode === "aktif"} className={css.chip} data-on={geo.mode === "aktif" ? "" : undefined} disabled={sending}
              title={geo.mode === "ditolak" ? t("momen.cam.geo.blockedNote") : t("momen.cam.geo.note")} onClick={geo.toggle}>
              {geo.mode === "aktif" ? <Check aria-hidden /> : <MapPin aria-hidden />}{geoLabel}
            </button>}
          </div>
        </div>

        <div className={css.bar}>
          <Button block icon={Send} disabled={!ready} loading={sending} loadingLabel={t("momen.edit.sending")} onClick={send}>
            {ready ? (chosen.length ? t("momen.edit.sendTags", { label: sendLabel, n: chosen.length }) : sendLabel) : t("momen.edit.waitPhoto")}
          </Button>
        </div>
      </div>
    </dialog>
    {hasTags && <EditorTagSheet open={sheet} onClose={() => setSheet(false)} candidates={candidates} tags={tags} onTags={setTags} ask={ask} onAskChange={onAskChange} initialQuery={demo?.query} />}
  </>;
}

/** A tile of the row: your photo with that sign or that filter (a small card) and its name under it; the chosen one ringed in gold. */
function Tile({ label, checked, disabled, onClick, url, tone, sign, lang, taken }: { label: string; checked: boolean; disabled: boolean; onClick: () => void; url?: string; tone: CameraToneId; sign: SignId; lang: Lang; taken: string }) {
  const node = useRef<HTMLButtonElement>(null);
  // The chosen tile comes into view (along the row only), when the screen opens and when the choice changes.
  useEffect(() => { if (checked) node.current?.scrollIntoView?.({ inline: "center", block: "nearest" }); }, [checked]);
  return <button ref={node} type="button" role="radio" aria-checked={checked} className={css.tile} disabled={disabled} onClick={onClick}>
    <span className={css.tilePic} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- the plain picture on this phone (object URL) or a sample */}
      {url && <img src={url} alt="" style={{ filter: cssFilter(tone) }} />}
      {toneTint(tone) && <span className={css.matte} style={{ background: toneTint(tone) ?? undefined }} />}
      <TemplateOverlay sign={sign} lang={lang} taken={taken} className={css.tileOverlay} />
    </span>
    <span className={css.tileName}>{label}</span>
  </button>;
}
