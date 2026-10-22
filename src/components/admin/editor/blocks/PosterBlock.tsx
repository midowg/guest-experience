"use client";

import { useEffect, useState } from "react";
import { ExternalLink, ImagePlus, Type } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui";
import { PhotoField } from "@/components/admin/shared/PhotoField";
import { EventLink } from "@/components/admin/editor/blocks/EventLink";
import type { EditorKit } from "@/components/admin/editor/kit";
import { PosterCanvas } from "@/components/poster/PosterCanvas";
import { loadPosterFonts } from "@/components/poster/layout";
import { boxes, cardTypes, paletteOf, POSTER_LABEL, posterFormats, posterPalettes, posterSizes, type CardType, type PosterField, type PosterFormat, type PosterSettings } from "@/lib/poster";
import { posterPresets, presetOf, presetPoster } from "@/lib/poster-presets";
import { eventPath, posterPath } from "@/lib/routes";
import { PosterFieldRow } from "./PosterFieldRow";
import { PosterDesignLibrary } from "./PosterDesignLibrary";
import s from "./poster-block.module.css";

/**
 * Studio Poster in the editor: the kind of card and its design, the colours, the sizes (with
 * backgrounds from Figma), and the boxes on it. A tap on a box in the preview opens its row.
 * Guests only change the boxes marked editable. On a card event (event_kind "kartu") this block
 * is the whole editor, so it also holds the card's name.
 */
export function PosterBlock({ kit }: { kit: EditorKit }) {
  const { event, update, errors, origin, posterDesigns, superAdmin, text } = kit;
  const poster = event.poster;
  const card = event.event_kind === "kartu";
  const [type, setType] = useState<CardType>(poster.cardType);
  const [format, setFormat] = useState<PosterFormat>(posterFormats.find(item => poster.formats[item].enabled) ?? "post");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [fontsVersion, setFontsVersion] = useState(0);
  useEffect(() => { loadPosterFonts(poster.fields).then(() => setFontsVersion(version => version + 1)); }, [poster.fields]);
  const set = (next: Partial<PosterSettings>) => update("poster", { ...poster, ...next });
  const setField = (index: number, field: PosterField) => set({ fields: poster.fields.map((item, at) => at === index ? field : item) });

  function applyPreset(key: string) {
    if (poster.fields.length && !window.confirm("Pakai desain ini? Ukuran, kotak, dan posisi yang sudah diatur akan diganti dengan bawaan desain.")) return;
    const next = presetPoster(key, event, poster.enabled);
    set({ cardType: next.cardType, preset: next.preset, palette: next.palette, formats: next.formats, fields: next.fields });
    setFormat(posterFormats.find(item => next.formats[item].enabled) ?? "post");
  }
  function addField(kind: PosterField["kind"]) {
    const used = new Set(poster.fields.map(field => field.key));
    let n = 1;
    while (used.has(`${kind === "photo" ? "foto" : "teks"}_${n}`)) n++;
    const key = `${kind === "photo" ? "foto" : "teks"}_${n}`;
    const start = Object.fromEntries(posterFormats.filter(item => poster.formats[item].enabled).map(item => [item, { x: 80, y: 80, w: Math.round(posterSizes[item].width / 2), h: kind === "photo" ? 300 : 100 }]));
    const field: PosterField = {
      key, label: kind === "photo" ? `Foto ${n}` : `Teks ${n}`, hint: kind === "photo" ? "Unggah foto" : "Tulis di sini", kind, editable: true, value: "", maxLength: 120,
      font: "nunito", weight: 600, tone: kind === "photo" ? "" : "text", color: "#1f2a24", align: "left", uppercase: false, letterSpacing: 0, sizeMax: 32, sizeMin: 16, lineHeight: 1.25, maxLines: 2, radius: 0, fill: "#e9dfcb",
      box: boxes(start),
    };
    set({ fields: [...poster.fields, field] });
    setOpenRow(key);
  }
  function openFromPreview(key: string) {
    setOpenRow(key);
    requestAnimationFrame(() => document.querySelector(`[data-field-row="${key}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }
  const toggleFormat = (item: PosterFormat, on: boolean) => set({ formats: { ...poster.formats, [item]: { ...poster.formats[item], enabled: on } } });

  // In the preview every box answers a tap and shows its hint, locked or not.
  const preview: PosterSettings = { ...poster, fields: poster.fields.map(field => ({ ...field, editable: true })) };
  const usable = posterFormats.filter(item => poster.formats[item].enabled);
  const shown = usable.includes(format) ? format : usable[0];
  const link = card ? eventPath(event) : posterPath(event);

  return <div className="stack">
    {card && text("title", "Nama kartu", 180, false, "Tampil sebagai judul halaman dan nama berkas unduhan.")}
    <p>Peserta membuka tautan di bawah, mengisi kotak di kartu, mengatur foto, lalu mengunduhnya sebagai gambar atau PDF. Isian peserta tidak dikirim ke server; hanya pengaturan di sini yang disimpan.</p>
    <EventLink event={event} origin={origin} path={link} label={card ? "Tautan kartu" : `Tautan ${POSTER_LABEL}`} hint="Bagikan tautan ini ke orang yang mengisi kartu." />
    {event.code && event.status === "published" && poster.enabled && <ButtonLink variant="secondary" href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" /> Buka halaman kartu<span className="sr-only"> (tab baru)</span></ButtonLink>}

    <fieldset className={s.designs}>
      <legend>Jenis kartu dan desain</legend>
      <div className={s.types} role="group" aria-label="Jenis kartu">
        {cardTypes.map(item => <button key={item.key} type="button" aria-pressed={type === item.key} onClick={() => setType(item.key)}>{item.label}</button>)}
      </div>
      <p className="field-hint">{cardTypes.find(item => item.key === type)?.description}</p>
      {posterPresets.filter(preset => preset.type === type).map(preset => <div key={preset.key} className={s.design} data-current={poster.preset === preset.key || undefined}>
        <div><strong>{preset.name}</strong><p className="field-hint">{preset.description} Ukuran: {preset.formats.map(item => posterSizes[item].label).join(", ")}.</p></div>
        <Button type="button" variant={poster.preset === preset.key ? "secondary" : "primary"} onClick={() => applyPreset(preset.key)}>{poster.preset === preset.key ? "Atur ulang ke bawaan" : "Pakai desain ini"}</Button>
      </div>)}
      <PosterDesignLibrary poster={poster} initial={posterDesigns.filter(design => (design.template.cardType ?? "poster") === type)} superAdmin={superAdmin} onApply={design => {
        if (poster.fields.length && !window.confirm(`Pakai desain “${design.name}”? Latar, kotak, dan posisi kartu ini akan diganti.`)) return;
        set({ cardType: design.template.cardType ?? "poster", preset: design.template.preset, palette: design.template.palette ?? poster.palette, paletteChoice: design.template.paletteChoice ?? poster.paletteChoice, formats: design.template.formats, fields: design.template.fields });
      }} />
    </fieldset>

    <fieldset className={s.designs}>
      <legend>Warna</legend>
      <div className={s.palettes} role="group" aria-label="Palet warna">
        {posterPalettes.map(palette => <button key={palette.key} type="button" aria-pressed={paletteOf(poster.palette).key === palette.key} onClick={() => set({ palette: palette.key })}>
          <span className={s.swatch}><i style={{ background: palette.colors.background }} /><i style={{ background: palette.colors.primary }} /><i style={{ background: palette.colors.accent }} /></span>{palette.name}
        </button>)}
      </div>
      <label className={s.check}><input type="checkbox" role="switch" checked={poster.paletteChoice} onChange={change => set({ paletteChoice: change.target.checked })} /> Peserta boleh memilih warna sendiri</label>
      <p className="field-hint">Latar bawaan dan kotak yang memakai “warna tema” ikut berganti. Latar yang diunggah dari Figma tidak berubah warna.</p>
    </fieldset>

    <fieldset className={s.designs}>
      <legend>Ukuran</legend>
      {(["digital", "print"] as const).map(group => <div key={group} className={s.sizeGroup}>
        <p className={s.sub}>{group === "digital" ? "Untuk dibagikan" : "Untuk dicetak (PDF seukuran kertas)"}</p>
        <div className={s.sizes}>{posterFormats.filter(item => posterSizes[item].group === group).map(item => <label key={item} className={s.size} data-on={poster.formats[item].enabled || undefined}>
          <input type="checkbox" checked={poster.formats[item].enabled} onChange={change => toggleFormat(item, change.target.checked)} />
          <span>{posterSizes[item].label}<small>{posterSizes[item].width}×{posterSizes[item].height}{presetOf(poster.preset) && !presetOf(poster.preset)!.layouts[item] ? " · atur kotak sendiri" : ""}</small></span>
        </label>)}</div>
      </div>)}
      {usable.length > 0 && <details className={s.backgrounds}>
        <summary>Latar dari Figma (opsional)</summary>
        {usable.map(item => <PhotoField key={item} name={`poster.formats.${item}.background.url`} label={`Latar ${posterSizes[item].label}`} value={poster.formats[item].background.url} srcset={poster.formats[item].background.srcset}
          hint={`Ekspor PNG/JPG ${posterSizes[item].width}×${posterSizes[item].height} tanpa teks yang diisi peserta. Kosongkan untuk memakai latar bawaan desain.`}
          onChange={value => set({ formats: { ...poster.formats, [item]: { ...poster.formats[item], background: { ...poster.formats[item].background, ...value } } } })} error={errors[`poster.formats.${item}.background.url`]?.join(" ")} />)}
      </details>}
    </fieldset>

    {poster.fields.length > 0 && shown && <div className={s.preview}>
      <div className={s.previewBar}>
        <strong>Pratinjau</strong>
        {usable.length > 1 && <div className={s.tabs} role="group" aria-label="Ukuran pratinjau">{usable.map(item => <button key={item} type="button" aria-pressed={shown === item} onClick={() => setFormat(item)}>{posterSizes[item].label}</button>)}</div>}
      </div>
      <p className="field-hint">Garis putus-putus = kotak. Ketuk kotak untuk membuka pengaturannya.</p>
      <div className={s.previewStage} style={{ maxWidth: posterSizes[shown].width > posterSizes[shown].height ? "40rem" : `${Math.min(26, Math.round(40 * posterSizes[shown].width / posterSizes[shown].height))}rem` }}>
        <PosterCanvas poster={preview} values={{ text: {}, photos: {} }} format={shown} editing hints selected={openRow} onSelect={openFromPreview} onFrame={() => {}} fontsVersion={fontsVersion} />
      </div>
    </div>}

    <div className={s.rows}>
      <p className={s.sub}>Kotak di kartu ({poster.fields.length})</p>
      {poster.fields.map((field, index) => <PosterFieldRow key={field.key} field={field} index={index} formats={usable} open={openRow === field.key} errors={errors}
        onToggle={open => setOpenRow(open ? field.key : openRow === field.key ? null : openRow)}
        onChange={next => setField(index, next)}
        onRemove={() => { if (window.confirm(`Hapus kotak “${field.label}”?`)) set({ fields: poster.fields.filter((_, at) => at !== index) }); }} />)}
      <div className={s.add}>
        <Button type="button" variant="secondary" onClick={() => addField("text")}><Type size={16} aria-hidden="true" /> Tambah kotak teks</Button>
        <Button type="button" variant="secondary" onClick={() => addField("photo")}><ImagePlus size={16} aria-hidden="true" /> Tambah kotak foto</Button>
      </div>
    </div>
  </div>;
}
