"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, RotateCcw, Search, Send, Tag, X } from "lucide-react";
import { useT } from "@/components/main-wam/i18n";
import { Button, IconButton, initials, Skeleton, SkeletonGroup, SwitchRow } from "@/components/main-wam/ui";
import { useModal } from "@/components/main-wam/ui/useModal";
import type { Lang } from "@/lib/main-wam/i18n";
import type { TagCandidate } from "@/lib/main-wam/misi/rules";
import { CAMERA_TONE_IDS, cssFilter, type CameraToneId } from "@/lib/main-wam/momen/camera-filters";
import { SIGN_IDS, type SignId } from "@/lib/main-wam/momen/camera-templates";
import { changeLook, clampIndex, DEFAULT_LOOK, knownIds, listPeople, lookToAll, toggleId, type Look } from "@/lib/main-wam/momen/editor";
import { TemplateOverlay } from "./TemplateOverlay";
import type { ShareMode } from "./useShareLocation";
import css from "./photo-editor.module.css";

/*
 * "Periksa fotomu" (docs/main-wam/KONTRAK.md §40): the screen between the shutter (or the gallery pick) and Kirim. The photo is shown big with the
 * sign and the colour tone drawn live over the plain picture (nothing is changed in it: the look is drawn only when Kirim is pressed). Below it: Sign,
 * Warna, "Terapkan ke semua foto" (several photos, a strip of thumbnails), Tag orang (one list of everyone, a search, the people chosen as chips,
 * no limit), Tandai lokasi, Tanya setiap foto and Simpan asli di HP. At the bottom, always in view: Batal, Ulangi (back to the camera) and Kirim.
 * A full-screen dialog (useModal: focus kept inside, Esc and the phone's Back button give Ulangi). It opens at once after the shutter: while the frame
 * is still being made the photo is a skeleton and Kirim waits.
 */

export type EditorPhoto = { id: string; /** What is shown: an object URL of the plain picture (or a sample in the preview). */ url: string; fromGallery: boolean };
export type EditorResult = { /** One look per photo, in the order of `photos`. */ looks: Look[]; /** The people chosen, each once. */ tags: string[] };
export type EditorGeo = { mode: ShareMode; toggle: () => void };

/** The five colours a person without a photo gets (container and ink of the kit's own tokens), by the first letter of the name. */
const TINTS = ["primary", "success", "warning", "momen", "awarding"] as const;
const tintOf = (name: string) => TINTS[(name.codePointAt(0) ?? 0) % TINTS.length];

function Person({ person, size }: { person: TagCandidate; size: number }) {
  return <span className={css.avatar} data-tint={tintOf(person.name)} style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }} aria-hidden>
    {initials(person.name).slice(0, 1) || "?"}
    {/* Over the initials: a photo that fails to load shows nothing, so the initials stay. */}
    {/* eslint-disable-next-line @next/next/no-img-element -- signed storage addresses, shown as they are */}
    {person.photo && <img src={person.photo} alt="" loading="lazy" decoding="async" />}
  </span>;
}

export function PhotoEditor({ photos, pending, candidates, lang, ask, onAskChange, keep, onKeepChange, canKeep, geo, sending, demo, onSend, onRetake, onCancel }: {
  /** The photos ready to look at (the plain pictures). */
  photos: readonly EditorPhoto[];
  /** How many more are still being made (a skeleton each; Kirim waits). */
  pending: number;
  /** The people the person may tag: active participants. None = no tag block. */
  candidates: readonly TagCandidate[];
  lang: Lang;
  /** "Tanya setiap foto": on = the tag block is open; off = folded into one row. */
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
  demo?: { tags?: string[]; cur?: number; all?: boolean; query?: string; looks?: Look[] };
  onSend: (result: EditorResult) => void;
  /** Ulangi (also Esc and the phone's Back button): back to the camera, these photos dropped. */
  onRetake: () => void;
  /** Batal: leave the camera, these photos dropped. */
  onCancel: () => void;
}) {
  const t = useT();
  const { dialogRef, titleRef, onKeyDown, onCancel: onDialogCancel } = useModal({ open: true, onClose: onRetake, locked: sending });
  const [cur, setCur] = useState(demo?.cur ?? 0);
  const [all, setAll] = useState(demo?.all ?? false);
  const [looks, setLooks] = useState<Record<string, Look>>(() => Object.fromEntries((demo?.looks ?? []).flatMap((look, index) => (photos[index] ? [[photos[index].id, look]] : []))));
  const [tags, setTags] = useState<string[]>(demo?.tags ?? []);
  const [query, setQuery] = useState(demo?.query ?? "");
  const [tagOpen, setTagOpen] = useState(ask);
  const thumbs = useRef<HTMLButtonElement | null>(null);

  const items = photos.map(photo => ({ ...photo, ...(looks[photo.id] ?? DEFAULT_LOOK) }));
  const at = clampIndex(cur, items.length);
  const photo = items[at];
  const total = items.length + pending;
  const byId = useMemo(() => new Map(candidates.map(person => [person.id, person])), [candidates]);
  const list = useMemo(() => listPeople(candidates, query), [candidates, query]);
  const chosen = tags.filter(id => byId.has(id));
  const hasTags = candidates.length > 0;

  const store = (next: typeof items) => setLooks(Object.fromEntries(next.map(item => [item.id, { sign: item.sign, tone: item.tone }])));
  const pick = (change: Partial<Look>) => store(changeLook(items, at, change, all));
  const applyAll = (on: boolean) => { setAll(on); if (on) store(lookToAll(items, at)); };
  useEffect(() => { thumbs.current?.scrollIntoView?.({ inline: "center", block: "nearest" }); }, [at]);

  const send = () => onSend({ looks: items.map(item => ({ sign: item.sign, tone: item.tone })), tags: knownIds(tags, candidates) });
  const sendLabel = total > 1 ? t("momen.edit.sendMany", { n: total }) : t("momen.edit.send");
  const ready = pending === 0 && items.length > 0;

  return <dialog ref={dialogRef} className={css.editor} aria-labelledby="momen-edit-title" aria-busy={sending || undefined} onKeyDown={onKeyDown} onCancel={onDialogCancel} data-momen-editor="">
    <div className={css.inner}>
      <header className={css.head}>
        <IconButton variant="tonal" icon={ChevronLeft} label={t("momen.edit.back")} onClick={onRetake} disabled={sending} />
        <h2 id="momen-edit-title" ref={titleRef} tabIndex={-1} className={css.title}>{t("momen.edit.title")}</h2>
        {total > 1 && <span className={css.counter}>{t("momen.edit.photoOf", { n: Math.min(at + 1, total), total })}</span>}
      </header>

      <div className={css.stage}>
        <div className={css.frame}>
          {photo
            ? <>
              {/* eslint-disable-next-line @next/next/no-img-element -- the plain picture just made on this phone (object URL) or a sample */}
              <img className={css.picture} src={photo.url} alt={total > 1 ? t("momen.edit.photoN", { n: at + 1 }) : t("momen.edit.photo")} style={{ filter: cssFilter(photo.tone) }} />
              <TemplateOverlay sign={photo.sign} lang={lang} className={css.overlay} />
            </>
            : <SkeletonGroup label={t("momen.edit.preparing")} className={css.skeleton}><Skeleton shape="block" className={css.skeletonFill} /></SkeletonGroup>}
        </div>
      </div>

      {total > 1 && <div className={css.thumbs} role="group" aria-label={t("momen.edit.thumbs")}>
        {items.map((item, index) => <button key={item.id} ref={index === at ? thumbs : undefined} type="button" className={css.thumb} aria-pressed={index === at} aria-label={t("momen.edit.thumb", { n: index + 1 })} onClick={() => setCur(index)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a picture on this phone */}
          <img src={item.url} alt="" style={{ filter: cssFilter(item.tone) }} />
        </button>)}
        {Array.from({ length: pending }, (_, index) => <span key={`wait-${index}`} className={css.thumbWait} aria-hidden />)}
      </div>}

      <div className={css.panel}>
        <Chips label={t("momen.cam.signLabel")} name={t("momen.cam.signs")} ids={SIGN_IDS} value={photo?.sign ?? DEFAULT_LOOK.sign} word={id => t(`momen.cam.sign.${id}`)} disabled={!photo || sending} onPick={(sign: SignId) => pick({ sign })} />
        <Chips label={t("momen.cam.toneLabel")} name={t("momen.cam.tones")} ids={CAMERA_TONE_IDS} value={photo?.tone ?? DEFAULT_LOOK.tone} word={id => t(`momen.cam.tone.${id}`)} disabled={!photo || sending} onPick={(tone: CameraToneId) => pick({ tone })} />
        {total > 1 && <SwitchRow className={css.card} title={t("momen.edit.all")} sub={t("momen.edit.allSub")} checked={all} onChange={applyAll} disabled={sending} />}

        {hasTags && (!tagOpen
          ? <div className={css.folded}>
            <Tag aria-hidden className={css.foldedIcon} />
            <div className={css.foldedText}><b>{t("momen.edit.tag")}</b><span>{t("momen.edit.folded")}</span></div>
            <button type="button" className={css.link} onClick={() => setTagOpen(true)} aria-expanded="false">{t("momen.edit.open")}</button>
          </div>
          : <section className={css.tags} aria-labelledby="momen-edit-tag">
            <div className={css.tagHead}>
              <h3 id="momen-edit-tag" className={css.label}>{t("momen.edit.tag")}</h3>
              <span className={css.count} aria-live="polite">{t("momen.edit.tagCount", { n: chosen.length })}</span>
            </div>
            {chosen.length > 0 && <ul className={css.chosen} aria-label={t("momen.edit.chosen")}>
              {chosen.map(id => { const person = byId.get(id)!; return <li key={id}>
                <button type="button" className={css.chip} aria-label={t("momen.edit.remove", { name: person.name })} disabled={sending} onClick={() => setTags(current => toggleId(current, id))}>
                  <Person person={person} size={22} /><span>{person.name}</span><X aria-hidden />
                </button>
              </li>; })}
            </ul>}
            <label className={css.search}>
              <Search aria-hidden />
              <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("momen.edit.search")} aria-label={t("momen.edit.searchLabel")} enterKeyHint="search" autoComplete="off" />
            </label>
            {list.length > 0
              ? <ul className={css.people} aria-label={t("momen.edit.people")}>
                {list.map(person => { const on = tags.includes(person.id); return <li key={person.id}>
                  <button type="button" role="checkbox" aria-checked={on} className={css.person} disabled={sending} onClick={() => setTags(current => toggleId(current, person.id))}>
                    <Person person={person} size={38} />
                    <span className={css.personText}><b>{person.name}</b><small>{person.department || "–"}</small></span>
                    {person.bod && <span className={css.bod}>{t("momen.edit.bod")}</span>}
                    <span className={css.mark} aria-hidden>{on ? <Check /> : null}</span>
                  </button>
                </li>; })}
              </ul>
              : <p className={css.none} role="status">{t("momen.edit.none")}</p>}
            <p className={css.note}>{t("momen.edit.tagNote")}</p>
            {!ask && <button type="button" className={css.link} onClick={() => setTagOpen(false)} aria-expanded="true">{t("momen.edit.fold")}</button>}
          </section>)}

        {geo && <SwitchRow className={css.card} title={t("momen.cam.geo.off")} checked={geo.mode === "aktif"} onChange={() => geo.toggle()} disabled={sending}
          sub={geo.mode === "aktif" ? t("momen.cam.geo.note") : geo.mode === "ditolak" ? t("momen.cam.geo.blockedNote") : t("momen.edit.geoOff")} />}
        {hasTags && <SwitchRow className={css.card} title={t("momen.edit.ask")} sub={t("momen.edit.askSub")} checked={ask} disabled={sending}
          onChange={next => { onAskChange(next); setTagOpen(next); }} />}
        {canKeep && <SwitchRow className={css.card} title={t("momen.edit.keep")} sub={t("momen.edit.keepSub")} checked={keep} onChange={onKeepChange} disabled={sending} />}
      </div>

      <div className={css.bar}>
        <Button variant="secondary" size="m" className={css.barSide} onClick={onCancel} disabled={sending}>{t("momen.edit.cancel")}</Button>
        <Button variant="secondary" size="m" icon={RotateCcw} className={css.barSide} onClick={onRetake} disabled={sending}>{t("momen.edit.retake")}</Button>
        <Button icon={Send} className={css.barSend} disabled={!ready} loading={sending} loadingLabel={t("momen.edit.sending")} onClick={send}>
          {ready ? (chosen.length ? t("momen.edit.sendTags", { label: sendLabel, n: chosen.length }) : sendLabel) : t("momen.edit.waitPhoto")}
        </Button>
      </div>
    </div>
  </dialog>;
}

/** One strip of small choices with its label: a radio group; the choices wrap rather than scroll, so every one is in view. */
function Chips<Id extends string>({ label, name, ids, value, word, onPick, disabled }: { label: string; name: string; ids: readonly Id[]; value: Id; word: (id: Id) => string; onPick: (id: Id) => void; disabled: boolean }) {
  return <div className={css.chips}>
    <span className={css.label} aria-hidden>{label}</span>
    <div className={css.chipRow} role="radiogroup" aria-label={name}>
      {ids.map(id => <button key={id} type="button" role="radio" aria-checked={value === id} className={css.choice} disabled={disabled} onClick={() => onPick(id)}>{word(id)}</button>)}
    </div>
  </div>;
}
