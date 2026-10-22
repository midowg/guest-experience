"use client";

import { useEffect, useState } from "react";
import { ExternalLink, ImagePlus, Type } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui";
import { PhotoField } from "@/components/admin/shared/PhotoField";
import { EventLink } from "@/components/admin/editor/blocks/EventLink";
import type { EditorKit } from "@/components/admin/editor/kit";
import { PosterCanvas } from "@/components/poster/PosterCanvas";
import { POSTER_LABEL, posterFormats, posterSizes, type PosterField, type PosterFormat, type PosterSettings } from "@/lib/poster";
import { posterPresets, presetOf, presetPoster } from "@/lib/poster-presets";
import { posterPath } from "@/lib/routes";
import { PosterFieldRow } from "./PosterFieldRow";
import { loadPosterFonts } from "@/components/poster/layout";
import s from "./poster-block.module.css";

/**
 * Studio Poster in the editor: which design, its backgrounds from Figma, and the boxes on it. A
 * tap on a box in the preview opens its row. Guests only change the boxes marked editable.
 */
export function PosterBlock({ kit }: { kit: EditorKit }) {
  const { event, update, errors, origin } = kit;
  const poster = event.poster;
  const [format, setFormat] = useState<PosterFormat>("post");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [fontsVersion, setFontsVersion] = useState(0);
  useEffect(() => { loadPosterFonts(poster.fields).then(() => setFontsVersion(version => version + 1)); }, [poster.fields]);
  const set = (next: Partial<PosterSettings>) => update("poster", { ...poster, ...next });
  const setField = (index: number, field: PosterField) => set({ fields: poster.fields.map((item, at) => at === index ? field : item) });

  function applyPreset(key: string) {
    if (poster.fields.length && !window.confirm("Pakai desain ini? Kotak dan posisi yang sudah diatur akan diganti dengan bawaan desain.")) return;
    const next = presetPoster(key, event, poster.enabled);
    set({ preset: next.preset, fields: next.fields });
  }
  function addField(kind: PosterField["kind"]) {
    const used = new Set(poster.fields.map(field => field.key));
    let n = 1;
    while (used.has(`${kind === "photo" ? "foto" : "teks"}_${n}`)) n++;
    const key = `${kind === "photo" ? "foto" : "teks"}_${n}`;
    const field: PosterField = {
      key, label: kind === "photo" ? `Foto ${n}` : `Teks ${n}`, hint: kind === "photo" ? "Unggah foto" : "Tulis di sini", kind, editable: true, value: "", maxLength: 120,
      font: "nunito", weight: 600, color: "#1f2a24", align: "left", uppercase: false, letterSpacing: 0, sizeMax: 32, sizeMin: 16, lineHeight: 1.25, maxLines: 2, radius: 0, fill: "#e9dfcb",
      box: { post: { x: 100, y: 100, w: 400, h: kind === "photo" ? 300 : 100 }, story: { x: 100, y: 100, w: 400, h: kind === "photo" ? 300 : 100 } },
    };
    set({ fields: [...poster.fields, field] });
    setOpenRow(key);
  }
  function openFromPreview(key: string) {
    setOpenRow(key);
    requestAnimationFrame(() => document.querySelector(`[data-field-row="${key}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }

  // In the preview every box answers a tap and shows its hint, locked or not.
  const preview: PosterSettings = { ...poster, fields: poster.fields.map(field => ({ ...field, editable: true })) };
  const usable = posterFormats.filter(item => poster.formats[item].enabled);

  return <div className="stack">
    <p>Peserta membuka tautan di bawah, mengisi kotak di poster, mengatur foto, lalu mengunduh poster sebagai gambar atau PDF. Isian peserta tidak dikirim ke server; hanya pengaturan di sini yang disimpan.</p>
    <EventLink event={event} origin={origin} path={posterPath(event)} label={`Tautan ${POSTER_LABEL}`} hint="Bagikan tautan ini ke pengisi sesi." />
    {event.code && event.status === "published" && poster.enabled && <ButtonLink variant="secondary" href={posterPath(event)} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" /> Buka {POSTER_LABEL}<span className="sr-only"> (tab baru)</span></ButtonLink>}

    <fieldset className={s.designs}>
      <legend>Desain poster</legend>
      {posterPresets.map(preset => <div key={preset.key} className={s.design} data-current={poster.preset === preset.key || undefined}>
        <div><strong>{preset.name}</strong><p className="field-hint">{preset.description}</p></div>
        <Button type="button" variant={poster.preset === preset.key ? "secondary" : "primary"} onClick={() => applyPreset(preset.key)}>{poster.preset === preset.key ? "Atur ulang ke bawaan" : "Pakai desain ini"}</Button>
      </div>)}
    </fieldset>

    <div className={s.formats}>
      {posterFormats.map(item => <fieldset key={item} className={s.format}>
        <legend><label className={s.check}><input type="checkbox" role="switch" checked={poster.formats[item].enabled} onChange={change => set({ formats: { ...poster.formats, [item]: { ...poster.formats[item], enabled: change.target.checked } } })} /> {posterSizes[item].label} ({posterSizes[item].width}×{posterSizes[item].height})</label></legend>
        {poster.formats[item].enabled && <PhotoField name={`poster.formats.${item}.background.url`} label="Latar dari Figma (opsional)" value={poster.formats[item].background.url} srcset={poster.formats[item].background.srcset}
          hint={`Ekspor PNG/JPG berukuran ${posterSizes[item].width}×${posterSizes[item].height} tanpa teks yang diisi peserta. Kosongkan untuk memakai latar bawaan desain${presetOf(poster.preset) ? ` ${presetOf(poster.preset)!.name}` : ""}.`}
          onChange={value => set({ formats: { ...poster.formats, [item]: { ...poster.formats[item], background: { ...poster.formats[item].background, ...value } } } })} error={errors[`poster.formats.${item}.background.url`]?.join(" ")} />}
      </fieldset>)}
    </div>

    {poster.fields.length > 0 && usable.length > 0 && <div className={s.preview}>
      <div className={s.previewBar}>
        <strong>Pratinjau</strong>
        {usable.length > 1 && <div className={s.tabs} role="group" aria-label="Ukuran pratinjau">{usable.map(item => <button key={item} type="button" aria-pressed={(usable.includes(format) ? format : usable[0]) === item} onClick={() => setFormat(item)}>{posterSizes[item].label}</button>)}</div>}
      </div>
      <p className="field-hint">Garis putus-putus = kotak. Ketuk kotak untuk membuka pengaturannya.</p>
      <div className={s.previewStage} data-format={usable.includes(format) ? format : usable[0]}>
        <PosterCanvas poster={preview} values={{ text: {}, photos: {} }} format={usable.includes(format) ? format : usable[0]} editing hints selected={openRow} onSelect={openFromPreview} onFrame={() => {}} fontsVersion={fontsVersion} />
      </div>
    </div>}

    <div className={s.rows}>
      <p className={s.sub}>Kotak di poster ({poster.fields.length})</p>
      {poster.fields.map((field, index) => <PosterFieldRow key={field.key} field={field} index={index} open={openRow === field.key} errors={errors}
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
