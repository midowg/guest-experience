"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, Download, Frame, MapPin, Palette, Send, Tag, X } from "lucide-react";
import { useT } from "@/components/main-wam/i18n";
import { Button, IconButton, Skeleton, SkeletonGroup } from "@/components/main-wam/ui";
import { MainWamTheme } from "@/components/main-wam/theme";
import { useModal } from "@/components/main-wam/ui/useModal";
import type { Lang } from "@/lib/main-wam/i18n";
import type { TagCandidate } from "@/lib/main-wam/misi/rules";
import { CAMERA_TONE_IDS, cssFilter, type CameraToneId } from "@/lib/main-wam/momen/camera-filters";
import { DEFAULT_SIGN, SIGN_IDS, type SignId } from "@/lib/main-wam/momen/camera-templates";
import { changeLook, clampIndex, DEFAULT_LOOK, knownIds, lookToAll, type Look } from "@/lib/main-wam/momen/editor";
import { EditorTagSheet, Person } from "./EditorTagSheet";
import { TemplateOverlay } from "./TemplateOverlay";
import type { ShareMode } from "./useShareLocation";
import css from "./photo-editor.module.css";

/*
 * "Periksa fotomu" (docs/main-wam/KONTRAK.md §40): the screen between the shutter (or the gallery pick) and Kirim, drawn to fit one screen with no scrolling.
 *   top bar     back arrow = Ulangi (back to the camera, the photo dropped), a small title with "1/3" when there are several photos, ✕ = Batal
 *   the photo   as big as the space left (4:5), the sign and the colour tone drawn live over the plain picture (nothing is changed in it: the look is
 *               drawn only when Kirim is pressed); several photos: a small strip of thumbnails right under it
 *   tool row    ONE row: Sign, Warna, Tag (a count), Lokasi, Simpan asli. Sign and Warna open ONE small panel under the row (swipeable tiles that preview
 *               the same photo with each choice; "Terapkan ke semua foto" there when there are several); Tag opens the bottom sheet (EditorTagSheet);
 *               Lokasi and Simpan asli are toggles right in the row, their one-line notes appear briefly over the photo
 *   bottom bar  Kirim, full width, always in view ("Kirim · 3 foto · 7 tag")
 * A full-screen dialog (useModal: focus kept inside, Esc and the phone's Back button give Ulangi). It opens at once after the shutter: while the frame is
 * still being made the photo is a skeleton and Kirim waits.
 * Look: a dark stage, always (a nested dark theme root, like the camera and the splash), the photo as the star (large corners, one soft shadow) over a
 * blurred copy of itself that glows behind it (the ambient, crossfading with the photo and the tone), glass chrome (top bar, tool dock, thumbnails),
 * gold only for the active tool, the chosen tile and Kirim. Motion is short and off with reduced motion.
 */

export type EditorPhoto = { id: string; /** What is shown: an object URL of the plain picture (or a sample in the preview). */ url: string; fromGallery: boolean };
export type EditorResult = { /** One look per photo, in the order of `photos`. */ looks: Look[]; /** The people chosen, each once. */ tags: string[] };
export type EditorGeo = { mode: ShareMode; toggle: () => void };
type Panel = "sign" | "warna";

/** How long the one-line note of Lokasi or Simpan asli stays over the photo. */
const NOTE_MS = 3500;
/** The crossfade of the photo, its sign and the ambient glow behind it (ms; the CSS says the same). */
const FADE_MS = 260;

/** A value that changes by crossfading: the layer that is going away stays under the new one for a moment. */
function useCrossfade<T>(value: T, key: string, ms: number): { cur: T; prev: T | null; key: string } {
  const [state, setState] = useState<{ cur: T; prev: T | null; key: string }>({ cur: value, prev: null, key });
  const latest = useRef(value);
  useEffect(() => { latest.current = value; });
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the old layer is kept for the fade: a change of key is an event to react to
  useEffect(() => { setState(now => (now.key === key ? now : { cur: latest.current, prev: now.cur, key })); }, [key]);
  useEffect(() => {
    if (!state.prev) return;
    const timer = window.setTimeout(() => setState(now => ({ ...now, prev: null })), ms);
    return () => window.clearTimeout(timer);
  }, [state.prev, state.key, ms]);
  return state;
}
/** A short tick under the finger when a tile is chosen, where the phone has one. */
const tick = () => { try { navigator.vibrate?.(8); } catch { /* not available */ } };

export function PhotoEditor({ photos, pending, candidates, lang, ask, onAskChange, keep, onKeepChange, canKeep, geo, sending, demo, onSend, onRetake, onCancel }: {
  /** The photos ready to look at (the plain pictures). */
  photos: readonly EditorPhoto[];
  /** How many more are still being made (a skeleton each; Kirim waits). */
  pending: number;
  /** The people the person may tag: active participants. None = no Tag tool. */
  candidates: readonly TagCandidate[];
  lang: Lang;
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
  /** Batal (✕): leave the camera, these photos dropped. */
  onCancel: () => void;
}) {
  const t = useT();
  const { dialogRef, titleRef, onKeyDown, onCancel: onDialogCancel } = useModal({ open: true, onClose: onRetake, locked: sending });
  const [cur, setCur] = useState(demo?.cur ?? 0);
  const [all, setAll] = useState(demo?.all ?? false);
  const [looks, setLooks] = useState<Record<string, Look>>(() => Object.fromEntries((demo?.looks ?? []).flatMap((look, index) => (photos[index] ? [[photos[index].id, look]] : []))));
  const [tags, setTags] = useState<string[]>(demo?.tags ?? []);
  const [panel, setPanel] = useState<Panel>(demo?.panel ?? "sign");
  const [sheet, setSheet] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const thumbs = useRef<HTMLButtonElement | null>(null);
  const hasTags = candidates.length > 0;

  // "Tanya setiap foto" on: the Tag sheet opens by itself once the editor is up (after it, so it lies on top).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- opens after the first paint, on purpose
  useEffect(() => { if (ask && hasTags) setSheet(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only when the editor opens
  // A note says itself away.
  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(null), NOTE_MS);
    return () => window.clearTimeout(timer);
  }, [note]);

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
  const tagLabel = chosen.length ? `${t("momen.edit.tag")}, ${t("momen.edit.tagCount", { n: chosen.length })}` : t("momen.edit.tag");
  const geoNote = geo ? (geo.mode === "ditolak" ? t("momen.cam.geo.blockedNote") : t("momen.cam.geo.note")) : "";
  const tone = photo?.tone ?? DEFAULT_LOOK.tone;
  const sign = photo?.sign ?? DEFAULT_LOOK.sign;

  const photoLayers = useCrossfade({ url: photo?.url ?? "", sign }, `${photo?.url ?? ""}|${sign}`, FADE_MS);
  const glow = useCrossfade(photo?.url ?? "", photo?.url ?? "", FADE_MS);
  // The glow wears the tone too (so it follows the colour chosen), then the blur: the filters are one list.
  const glowFilter = `${tone === DEFAULT_LOOK.tone ? "" : `${cssFilter(tone)} `}blur(40px) saturate(1.7)`;
  const [reduce, setReduce] = useState(false);
  // The person's own "Kurangi gerak" (a cookie, read by the app's theme root): the dark stage is a theme root of its own, so it is told too.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read from the page after the first paint
  useEffect(() => { setReduce(!!document.querySelector("[data-main-wam][data-mw-reduce]")); }, []);

  return <>
    <dialog ref={dialogRef} className={css.editor} aria-labelledby="momen-edit-title" aria-busy={sending || undefined} onKeyDown={onKeyDown} onCancel={onDialogCancel} data-momen-editor="">
      <MainWamTheme mode="dark" reduceMotion={reduce} className={css.theme}>
        <div className={css.glow} aria-hidden>
          {glow.prev && <img key={`p${glow.key}`} className={`${css.glowImg} ${css.out}`} src={glow.prev} alt="" style={{ filter: glowFilter }} />}
          {glow.cur && <img key={`c${glow.key}`} className={`${css.glowImg} ${glow.prev ? css.in : ""}`} src={glow.cur} alt="" style={{ filter: glowFilter }} />}
        </div>
        <div className={css.inner}>
          <div className={css.head}>
            <IconButton variant="tonal" icon={ChevronLeft} label={t("momen.edit.back")} className={css.round} onClick={onRetake} disabled={sending} />
            <h2 id="momen-edit-title" ref={titleRef} tabIndex={-1} className={css.title}>{t("momen.edit.title")}</h2>
            {total > 1 && <span className={css.counter} role="status" aria-label={t("momen.edit.photoOf", { n: Math.min(at + 1, total), total })}>{Math.min(at + 1, total)}/{total}</span>}
            <IconButton variant="tonal" icon={X} label={t("momen.edit.cancel")} className={css.round} onClick={onCancel} disabled={sending} />
          </div>

          <div className={css.stage}>
            <div className={css.view}>
              <div className={css.frame}>
                {photo
                  ? <>
                    {photoLayers.prev && photoLayers.prev.url && <Picture layer={photoLayers.prev} className={css.out} tone={tone} lang={lang} alt="" />}
                    <Picture layer={photoLayers.cur} className={photoLayers.prev ? css.in : ""} tone={tone} lang={lang} alt={total > 1 ? t("momen.edit.photoN", { n: at + 1 }) : t("momen.edit.photo")} key={`c${photoLayers.key}`} />
                  </>
                  : <SkeletonGroup label={t("momen.edit.preparing")} className={css.skeleton}><Skeleton shape="block" className={css.skeletonFill} /></SkeletonGroup>}
              </div>
            </div>
            {note && <p className={css.note} role="status">{note}</p>}
          </div>

          {total > 1 && <div className={css.thumbsRow}><div className={css.thumbs} role="group" aria-label={t("momen.edit.thumbs")}>
            {items.map((item, index) => <button key={item.id} ref={index === at ? thumbs : undefined} type="button" className={css.thumb} aria-pressed={index === at} aria-label={t("momen.edit.thumb", { n: index + 1 })} onClick={() => setCur(index)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a picture on this phone */}
              <img src={item.url} alt="" style={{ filter: cssFilter(item.tone) }} />
            </button>)}
            {Array.from({ length: pending }, (_, index) => <span key={`wait-${index}`} className={css.thumbWait} aria-hidden />)}
          </div></div>}

          <div className={css.tools} role="toolbar" aria-label={t("momen.edit.tools")}>
            <Tool icon={<Frame />} label={t("momen.cam.signLabel")} expanded={panel === "sign"} controls="momen-edit-panel" onClick={() => setPanel("sign")} />
            <Tool icon={<Palette />} label={t("momen.cam.toneLabel")} expanded={panel === "warna"} controls="momen-edit-panel" onClick={() => setPanel("warna")} />
            {hasTags && <Tool label={t("momen.edit.toolTag")} name={tagLabel} onClick={() => setSheet(true)} disabled={sending}
              icon={chosen.length ? <span className={css.stack} aria-hidden>{chosen.slice(0, 3).map(id => <Person key={id} person={byId.get(id)!} size={18} />)}</span> : <Tag />} badge={chosen.length || undefined} />}
            {geo && <Tool icon={<MapPin />} label={t("momen.edit.toolGeo")} name={t("momen.cam.geo.off")} pressed={geo.mode === "aktif"} blocked={geo.mode === "ditolak"} disabled={sending} title={geoNote}
              onClick={() => { if (geo.mode === "aktif") { geo.toggle(); setNote(null); } else { geo.toggle(); setNote(geoNote); } }} />}
            {canKeep && <Tool icon={<Download />} label={t("momen.edit.toolKeep")} name={t("momen.edit.keep")} pressed={keep} disabled={sending} title={t("momen.edit.keepSub")}
              onClick={() => { onKeepChange(!keep); setNote(keep ? null : t("momen.edit.keepSub")); }} />}
          </div>

          <div className={css.panel} id="momen-edit-panel" data-many={total > 1 || undefined}>
            <div className={css.slide} key={panel}>
              {panel === "sign"
                ? <div className={css.tiles} role="radiogroup" aria-label={t("momen.cam.signs")}>
                  {SIGN_IDS.map(id => <TileButton key={id} label={t(`momen.cam.sign.${id}`)} checked={sign === id} disabled={!photo || sending} onClick={() => { tick(); pick({ sign: id as SignId }); }}
                    url={photo?.url} tone={tone} sign={id} lang={lang} />)}
                </div>
                : <div className={css.tiles} role="radiogroup" aria-label={t("momen.cam.tones")}>
                  {CAMERA_TONE_IDS.map(id => <TileButton key={id} round label={t(`momen.cam.tone.${id}`)} checked={tone === id} disabled={!photo || sending} onClick={() => { tick(); pick({ tone: id as CameraToneId }); }}
                    url={photo?.url} tone={id} sign={DEFAULT_SIGN} lang={lang} />)}
                </div>}
            </div>
            {total > 1 && <button type="button" role="switch" aria-checked={all} className={css.all} disabled={sending} onClick={() => { tick(); applyAll(); }}>{t("momen.edit.all")}</button>}
          </div>

          <div className={css.bar}>
            <div className={css.sendWrap} data-waiting={!ready || sending || undefined}>
              <Button icon={Send} className={`${css.send} ${sending ? css.sending : ""}`} disabled={!ready} aria-busy={sending || undefined} onClick={send}>
                {sending ? t("momen.edit.sending") : ready ? (chosen.length ? t("momen.edit.sendTags", { label: sendLabel, n: chosen.length }) : sendLabel) : t("momen.edit.waitPhoto")}
              </Button>
            </div>
          </div>
        </div>
      </MainWamTheme>
    </dialog>
    {hasTags && <MainWamTheme mode="dark" reduceMotion={reduce} className={css.contents}>
      <EditorTagSheet open={sheet} onClose={() => setSheet(false)} candidates={candidates} tags={tags} onTags={setTags} ask={ask} onAskChange={onAskChange} initialQuery={demo?.query} />
    </MainWamTheme>}
  </>;
}

/** The big photo (or one layer of its crossfade): the plain picture in its tone, the sign drawn over it as it will be sent. */
function Picture({ layer, tone, lang, className, alt }: { layer: { url: string; sign: SignId }; tone: CameraToneId; lang: Lang; className?: string; alt: string }) {
  return <span className={`${css.layer} ${className ?? ""}`}>
    {/* eslint-disable-next-line @next/next/no-img-element -- the plain picture just made on this phone (object URL) or a sample */}
    <img className={css.picture} src={layer.url} alt={alt} aria-hidden={alt ? undefined : true} style={{ filter: cssFilter(tone) }} />
    <TemplateOverlay sign={layer.sign} lang={lang} className={css.overlay} />
  </span>;
}

/** One tool of the row: an icon over a short label, 44 wide at least and 56 tall. A toggle (`pressed`), a panel opener (`expanded`), or (neither) the opener of the Tag sheet. */
function Tool({ icon, label, name, expanded, controls, pressed, blocked, badge, disabled, title, onClick }: {
  icon: ReactNode; label: string; name?: string; expanded?: boolean; controls?: string; pressed?: boolean; blocked?: boolean; badge?: number; disabled?: boolean; title?: string; onClick: () => void;
}) {
  const state = expanded !== undefined ? { "aria-expanded": expanded, "aria-controls": controls } : pressed !== undefined ? { "aria-pressed": pressed } : { "aria-haspopup": "dialog" as const };
  return <button type="button" className={css.tool} aria-label={name} title={title} disabled={disabled} data-on={expanded || pressed || undefined} data-blocked={blocked || undefined} onClick={onClick} {...state}>
    <span className={css.toolIcon}>{icon}{badge ? <span className={css.badge} aria-hidden>{badge}</span> : null}</span>
    <span className={css.toolLabel}>{label}</span>
  </button>;
}

/** A tile of the panel: the same photo with that sign (a small card) or that tone (a circle), and its name under it. */
function TileButton({ label, checked, disabled, onClick, url, tone, sign, lang, round }: { label: string; checked: boolean; disabled: boolean; onClick: () => void; url?: string; tone: CameraToneId; sign: SignId; lang: Lang; round?: boolean }) {
  return <button type="button" role="radio" aria-checked={checked} className={css.tile} disabled={disabled} onClick={onClick}>
    <span className={css.tilePic} data-round={round || undefined} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- the plain picture on this phone (object URL) or a sample */}
      {url && <img src={url} alt="" style={{ filter: cssFilter(tone) }} />}
      {!round && <TemplateOverlay sign={sign} lang={lang} className={css.tileOverlay} />}
    </span>
    <span className={css.tileName}>{label}</span>
  </button>;
}
