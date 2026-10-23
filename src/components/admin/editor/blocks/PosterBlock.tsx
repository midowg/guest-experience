"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, ImagePlus, MousePointerClick, Type } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { PhotoField } from "@/components/admin/shared/PhotoField";
import { EventLink } from "@/components/admin/editor/blocks/EventLink";
import type { EditorKit } from "@/components/admin/editor/kit";
import { PosterCanvas } from "@/components/poster/PosterCanvas";
import { loadPosterFonts } from "@/components/poster/layout";
import { boxes, cardTypes, paletteOf, POSTER_LABEL, posterFormats, posterFormatSetups, posterPalettes, posterSizes, type CardType, type PosterBox, type PosterField, type PosterFormat, type PosterSettings } from "@/lib/poster";
import { posterPresets, presetOf, presetPoster } from "@/lib/poster-presets";
import { eventPath, posterPath } from "@/lib/routes";
import { PosterInspector } from "./PosterInspector";
import { PosterFieldList } from "./PosterFieldList";
import { FigmaImport, type FigmaResult } from "./FigmaImport";
import { mergeImport } from "./figma-import";
import { PosterDesignLibrary } from "./PosterDesignLibrary";
import s from "./card-editor.module.css";
import f from "./card-figma.module.css";

const noop = () => {};
const empty = { text: {}, photos: {} };

/**
 * Studio Poster in the editor, in two steps: pick a design from the gallery, then arrange the
 * card on the card itself (drag a box to move it, its corner to resize it, tap it for its few
 * settings). Exact Figma numbers, sizes and uploaded backgrounds wait in folded parts. On a card
 * event (event_kind "kartu") this block is the whole editor, so it also holds the card's name.
 */
export function PosterBlock({ kit }: { kit: EditorKit }) {
  const { event, update, errors, origin, posterDesigns, superAdmin, text } = kit;
  const poster = event.poster;
  const card = event.event_kind === "kartu";
  const [type, setType] = useState<CardType>(poster.cardType);
  const [format, setFormat] = useState<PosterFormat>(posterFormats.find(item => poster.formats[item].enabled) ?? "post");
  const [selected, setSelected] = useState<string | null>(null);
  const [fontsVersion, setFontsVersion] = useState(0);
  useEffect(() => { loadPosterFonts(poster.fields).then(() => setFontsVersion(version => version + 1)); }, [poster.fields]);
  const set = (next: Partial<PosterSettings>) => update("poster", { ...poster, ...next });
  const setField = (key: string, next: (field: PosterField) => PosterField) => set({ fields: poster.fields.map(field => field.key === key ? next(field) : field) });

  const usable = posterFormats.filter(item => poster.formats[item].enabled);
  const shown = usable.includes(format) ? format : usable[0];
  const palette = paletteOf(poster.palette);
  const link = card ? eventPath(event) : posterPath(event);
  const current = poster.fields.find(field => field.key === selected) ?? null;

  function applyPreset(key: string) {
    if (poster.preset === key) return;
    if (poster.fields.length && !window.confirm("Pakai desain ini? Ukuran, kotak, dan posisi yang sudah diatur akan diganti dengan bawaan desain.")) return;
    const next = presetPoster(key, event, poster.enabled);
    set({ cardType: next.cardType, preset: next.preset, palette: next.palette, formats: next.formats, fields: next.fields });
    setFormat(posterFormats.find(item => next.formats[item].enabled) ?? "post");
    setSelected(null);
  }
  function addField(kind: PosterField["kind"]) {
    const used = new Set(poster.fields.map(field => field.key));
    let n = 1;
    while (used.has(`${kind === "photo" ? "foto" : "teks"}_${n}`)) n++;
    const key = `${kind === "photo" ? "foto" : "teks"}_${n}`;
    // A new box lands in the middle of each size, where it is easy to see and drag.
    const start = Object.fromEntries(usable.map(item => {
      const { width, height } = posterSizes[item];
      const w = Math.round(width * (kind === "photo" ? 0.35 : 0.6)), h = kind === "photo" ? w : Math.round(height * 0.08);
      return [item, { x: Math.round((width - w) / 2), y: Math.round((height - h) / 2), w, h }];
    }));
    const field: PosterField = {
      key, label: kind === "photo" ? `Foto ${n}` : `Teks ${n}`, hint: kind === "photo" ? "Unggah foto" : "Tulis di sini", kind, editable: true, value: "", maxLength: 120,
      font: "nunito", weight: 600, tone: kind === "photo" ? "" : "text", color: "#1f2a24", align: "center", uppercase: false, letterSpacing: 0, sizeMax: 48, sizeMin: 20, lineHeight: 1.25, maxLines: 2, radius: 0, fill: palette.colors.photo,
      box: boxes(start),
    };
    set({ fields: [...poster.fields, field] });
    setSelected(key);
  }

  /**
   * A design from Figma: a first import (or one over a gallery design) replaces the boxes and
   * sizes; a further one, for another size, adds that size to the boxes of the same name.
   */
  function applyFigma(result: FigmaResult) {
    const again = poster.preset === "" && poster.fields.length > 0;
    if (!again && poster.fields.length && !window.confirm("Pakai desain dari Figma ini? Kotak dan ukuran desain sebelumnya akan diganti.")) return;
    const formats = again ? poster.formats : posterFormatSetups([]);
    set({
      preset: "", fields: mergeImport(poster.fields, again, { ...result, background: "", overlay: null, parts: [] }),
      formats: { ...formats, [result.format]: { enabled: true, background: result.background, overlay: result.overlay, parts: result.parts } },
    });
    setFormat(result.format);
    setSelected(null);
  }

  // In the preview every box shows its hint, locked or not, so the admin sees each one.
  // Every box shows, an optional or stacked one too, so the admin sees where each sits.
  const preview: PosterSettings = { ...poster, fields: poster.fields.map(field => ({ ...field, editable: true, optional: false })) };

  return <div className="stack">
    {card && text("title", "Nama kartu", 180, false, "Tampil sebagai judul halaman dan nama berkas unduhan.")}
    <EventLink event={event} origin={origin} path={link} label={card ? "Tautan kartu" : `Tautan ${POSTER_LABEL}`} hint="Bagikan tautan ini ke orang yang mengisi kartu. Isian mereka hanya tersimpan di perangkat masing-masing." />
    {event.code && event.status === "published" && poster.enabled && <ButtonLink variant="secondary" href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" /> Buka halaman kartu<span className="sr-only"> (tab baru)</span></ButtonLink>}

    <section className={s.step} aria-labelledby="poster-step-design">
      <h3 id="poster-step-design"><span className={s.stepNumber}>1</span> Desain</h3>
      {/* An earlier Figma import's boxes, so a design for another size can be marked onto them. */}
      <FigmaImport fields={poster.preset === "" ? poster.fields : []} onImport={applyFigma} />
      <details className={f.builtIn}>
      <summary>atau pakai desain bawaan</summary>
      <div className={s.types} role="group" aria-label="Jenis kartu">
        {cardTypes.map(item => <button key={item.key} type="button" aria-pressed={type === item.key} onClick={() => setType(item.key)}>{item.label}</button>)}
      </div>
      <div className={s.gallery}>
        {posterPresets.filter(preset => preset.type === type).map(preset => {
          const sample = presetPoster(preset.key, event);
          const here = poster.preset === preset.key;
          return <button key={preset.key} type="button" className={s.tile} aria-pressed={here} onClick={() => applyPreset(preset.key)} aria-label={`${preset.name}: ${preset.description}`}>
            <span className={s.tilePreview} aria-hidden="true">
              <PosterCanvas poster={{ ...sample, fields: sample.fields.map(field => ({ ...field, editable: true })) }} values={empty} format={preset.formats[0]} editing={false} hints selected={null} onSelect={noop} onFrame={noop} fontsVersion={fontsVersion} />
            </span>
            <span className={s.tileName}>{here && <Check size={16} aria-hidden="true" />}{preset.name}</span>
            <span className={s.tileSizes}>{preset.formats.map(item => posterSizes[item].label).join(" · ")}</span>
          </button>;
        })}
      </div>
      <PosterDesignLibrary poster={poster} initial={posterDesigns.filter(design => (design.template.cardType ?? "poster") === type)} superAdmin={superAdmin} onApply={design => {
        if (poster.fields.length && !window.confirm(`Pakai desain “${design.name}”? Latar, kotak, dan posisi kartu ini akan diganti.`)) return;
        set({ cardType: design.template.cardType ?? "poster", preset: design.template.preset, palette: design.template.palette ?? poster.palette, paletteChoice: design.template.paletteChoice ?? poster.paletteChoice, formats: design.template.formats, fields: design.template.fields });
        setSelected(null);
      }} />
      </details>
    </section>

    {poster.fields.length > 0 && shown && <section className={s.step} aria-labelledby="poster-step-fields">
      <h3 id="poster-step-fields"><span className={s.stepNumber}>2</span> Kolom untuk peserta</h3>
      <p className="field-hint">Kolom yang diisi peserta tampil di form mereka. Matikan <strong>Diisi peserta</strong> untuk teks tetap dari panitia, misalnya tautan reservasi.</p>
      <div className={s.workspace}>
        <PosterFieldList fields={poster.fields} onChange={(key, next) => setField(key, () => next)} />
        <div className={s.side}>
          {usable.length > 1 && <div className={s.tabs} role="group" aria-label="Ukuran pratinjau">{usable.map(item => <button key={item} type="button" aria-pressed={shown === item} onClick={() => setFormat(item)}>{posterSizes[item].label}</button>)}</div>}
          <div className={s.canvas} style={{ maxWidth: posterSizes[shown].width > posterSizes[shown].height ? "100%" : `${Math.min(22, Math.round(34 * posterSizes[shown].width / posterSizes[shown].height))}rem` }}>
            <PosterCanvas poster={preview} values={empty} format={shown} editing={false} hints selected={null} onSelect={noop} onFrame={noop} fontsVersion={fontsVersion} />
          </div>
        </div>
      </div>
    </section>}

    <details className={s.more}>
      <summary>Lanjutan: posisi kotak, warna, ukuran, dan latar</summary>
    {poster.fields.length > 0 && shown && <section aria-label="Atur posisi kotak">
      <div className={s.arrangeBar}>
        {usable.length > 1 && <div className={s.tabs} role="group" aria-label="Ukuran yang diatur">{usable.map(item => <button key={item} type="button" aria-pressed={shown === item} onClick={() => setFormat(item)}>{posterSizes[item].label}</button>)}</div>}
        <div className={s.swatches} role="group" aria-label="Warna kartu">
          {posterPalettes.map(item => <button key={item.key} type="button" aria-pressed={palette.key === item.key} title={item.name} aria-label={`Warna ${item.name}`} onClick={() => set({ palette: item.key })}>
            <i style={{ background: item.colors.background }} /><i style={{ background: item.colors.primary }} /><i style={{ background: item.colors.accent }} />
          </button>)}
        </div>
        <label className={s.check}><input type="checkbox" role="switch" checked={poster.paletteChoice} onChange={change => set({ paletteChoice: change.target.checked })} /> Peserta boleh pilih warna</label>
      </div>
      <div className={s.workspace}>
        <div className={s.canvas} style={{ maxWidth: posterSizes[shown].width > posterSizes[shown].height ? "44rem" : `${Math.min(30, Math.round(44 * posterSizes[shown].width / posterSizes[shown].height))}rem` }}>
          <PosterCanvas poster={preview} values={empty} format={shown} editing={false} hints selected={selected} onSelect={key => setSelected(key)} onFrame={noop} fontsVersion={fontsVersion}
            onArrange={(key, box: PosterBox) => setField(key, field => ({ ...field, box: { ...field.box, [shown]: box } }))} />
        </div>
        <div className={s.side}>
          {current
            ? <PosterInspector key={current.key} field={current} index={poster.fields.indexOf(current)} formats={usable} palette={palette} errors={errors}
              onChange={next => setField(current.key, () => next)} onClose={() => setSelected(null)}
              onRemove={() => { if (window.confirm(`Hapus kotak “${current.label}”?`)) { set({ fields: poster.fields.filter(field => field.key !== current.key) }); setSelected(null); } }} />
            : <div className={s.tips}>
              <p><MousePointerClick size={18} aria-hidden="true" /> <strong>Geser</strong> kotak untuk memindahkan, tarik <strong>titik di sudut</strong> untuk mengubah ukuran, dan <strong>ketuk</strong> kotak untuk mengatur isinya. Panah keyboard menggeser 1 px (Shift: 10 px).</p>
              <p className="field-hint">Garis biru: diisi peserta. Garis abu-abu: isi tetap dari panitia.</p>
            </div>}
          <div className={s.boxList} role="group" aria-label="Kotak di kartu">
            {poster.fields.map(field => <button key={field.key} type="button" aria-pressed={selected === field.key} data-locked={!field.editable || undefined} onClick={() => setSelected(field.key)}>{field.label}</button>)}
          </div>
          <div className={s.add}>
            <button type="button" className={s.addButton} onClick={() => addField("text")}><Type size={16} aria-hidden="true" /> Teks</button>
            <button type="button" className={s.addButton} onClick={() => addField("photo")}><ImagePlus size={16} aria-hidden="true" /> Foto</button>
          </div>
        </div>
      </div>
    </section>}
      {(["digital", "print"] as const).map(group => <div key={group} className={s.sizeGroup}>
        <p className={s.sub}>{group === "digital" ? "Untuk dibagikan" : "Untuk dicetak (PDF seukuran kertas)"}</p>
        <div className={s.sizes}>{posterFormats.filter(item => posterSizes[item].group === group).map(item => <label key={item} className={s.size} data-on={poster.formats[item].enabled || undefined}>
          <input type="checkbox" checked={poster.formats[item].enabled} onChange={change => set({ formats: { ...poster.formats, [item]: { ...poster.formats[item], enabled: change.target.checked } } })} />
          <span>{posterSizes[item].label}<small>{posterSizes[item].width}×{posterSizes[item].height}{presetOf(poster.preset) && !presetOf(poster.preset)!.layouts[item] ? " · atur kotak sendiri" : ""}</small></span>
        </label>)}</div>
      </div>)}
      {usable.map(item => <PhotoField key={item} name={`poster.formats.${item}.background.url`} label={`Latar ${posterSizes[item].label} (opsional)`} value={poster.formats[item].background.url} srcset={poster.formats[item].background.srcset}
        hint={`Ekspor PNG/JPG ${posterSizes[item].width}×${posterSizes[item].height} tanpa teks yang diisi peserta. Kosongkan untuk memakai latar bawaan desain.`}
        onChange={value => set({ formats: { ...poster.formats, [item]: { ...poster.formats[item], background: { ...poster.formats[item].background, ...value } } } })} error={errors[`poster.formats.${item}.background.url`]?.join(" ")} />)}
    </details>
  </div>;
}
