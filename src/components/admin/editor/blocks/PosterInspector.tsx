"use client";

import type { ChangeEvent } from "react";
import { AlignCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, Bold, CaseUpper, Circle, Image as ImageIcon, Trash2, Type, X } from "lucide-react";
import { posterFonts, posterSizes, type PaletteRole, type PosterBox, type PosterField, type PosterFont, type PosterFormat, type PosterPalette } from "@/lib/poster";
import s from "./card-editor.module.css";

type Props = {
  field: PosterField; index: number;
  /** The sizes switched on: only those get position inputs. */
  formats: PosterFormat[];
  palette: PosterPalette;
  errors: Record<string, string[]>;
  onChange: (field: PosterField) => void;
  onRemove: () => void;
  onClose: () => void;
};

/** Palette roles a text can follow, so it changes with the chosen colours. */
const tones: [PaletteRole, string][] = [["primary", "Utama"], ["accent", "Aksen"], ["text", "Teks"], ["muted", "Redup"], ["onPrimary", "Di atas warna utama"], ["background", "Latar"]];
const ROUND = 500;

/**
 * The selected box, kept short: what it says, whether guests fill it, and a few looks (size,
 * bold, colour, alignment). Moving and resizing happen on the card itself; exact numbers (from
 * Figma) and the finer type settings wait under "Pengaturan lanjutan".
 */
export function PosterInspector({ field, index, formats, palette, errors, onChange, onRemove, onClose }: Props) {
  const path = `poster.fields.${index}`;
  const set = <K extends keyof PosterField>(key: K, value: PosterField[K]) => onChange({ ...field, [key]: value });
  const number = (value: string, fallback: number) => { const parsed = Number(value.replace(",", ".")); return Number.isFinite(parsed) ? parsed : fallback; };
  const numberInput = (id: string, label: string, value: number, apply: (value: number) => void, step = 1) =>
    <label key={id} className={s.num}><span>{label}</span><input id={id} className="input" type="number" inputMode="decimal" step={step} value={value} onChange={(event: ChangeEvent<HTMLInputElement>) => apply(number(event.target.value, value))} aria-invalid={!!errors[id] || undefined} /></label>;
  const fieldErrors = Object.entries(errors).filter(([key]) => key === path || key.startsWith(`${path}.`)).flatMap(([, list]) => list);
  const weights = posterFonts[field.font].weights as readonly number[];
  const bold = field.weight >= 700 || field.weight === Math.max(...weights) && weights.length > 1;
  // A new largest size keeps the smallest in proportion, so long text still shrinks the same way.
  const resize = (sizeMax: number) => onChange({ ...field, sizeMax, sizeMin: Math.max(6, Math.min(sizeMax, Math.round(sizeMax * field.sizeMin / Math.max(field.sizeMax, 1)))) });

  return <div className={s.inspector} role="group" aria-label={`Kotak ${field.label}`}>
    <div className={s.inspectorHead}>
      <span className={s.kind} aria-hidden="true">{field.kind === "photo" ? <ImageIcon size={16} /> : <Type size={16} />}</span>
      <input className={`input ${s.inspectorName}`} value={field.label} maxLength={80} onChange={event => set("label", event.target.value)} aria-label="Nama kotak" />
      <button type="button" className={s.iconButton} onClick={onClose} aria-label="Tutup pengaturan kotak"><X size={18} aria-hidden="true" /></button>
    </div>

    <label className={s.check}><input type="checkbox" role="switch" checked={field.editable} onChange={event => set("editable", event.target.checked)} /> Diisi peserta</label>
    {field.kind === "text" && <label className={s.field}><span>{field.editable ? "Isi awal (peserta boleh mengubah)" : "Isi tetap"}</span>
      <textarea id={`${path}.value`} className="textarea" rows={2} value={field.value} maxLength={2000} onChange={event => set("value", event.target.value)} placeholder={field.editable ? "Kosongkan agar peserta mengisi sendiri" : ""} /></label>}
    {field.editable && <label className={s.field}><span>Petunjuk untuk peserta</span><input id={`${path}.hint`} className="input" value={field.hint} maxLength={200} onChange={event => set("hint", event.target.value)} /></label>}

    {field.kind === "text" ? <>
      <label className={s.range}><span>Ukuran huruf <strong>{Math.round(field.sizeMax)}</strong></span>
        <input type="range" min={8} max={200} step={1} value={field.sizeMax} onChange={event => resize(Number(event.target.value))} /></label>
      <div className={s.tools}>
        <div className={s.segment} role="group" aria-label="Font">
          {(Object.entries(posterFonts) as [PosterFont, (typeof posterFonts)[PosterFont]][]).map(([key, font]) => <button key={key} type="button" aria-pressed={field.font === key} title={font.label} aria-label={font.label} style={{ fontFamily: font.family }}
            onClick={() => onChange({ ...field, font: key, weight: (font.weights as readonly number[]).includes(field.weight) ? field.weight : font.weights[0] })}>Aa</button>)}
        </div>
        <div className={s.segment} role="group" aria-label="Gaya">
          <button type="button" aria-pressed={bold} aria-label="Tebal" title="Tebal" onClick={() => set("weight", bold ? weights[0] : weights[weights.length - 1])}><Bold size={16} aria-hidden="true" /></button>
          <button type="button" aria-pressed={field.uppercase} aria-label="Huruf besar semua" title="Huruf besar semua" onClick={() => set("uppercase", !field.uppercase)}><CaseUpper size={16} aria-hidden="true" /></button>
        </div>
        <div className={s.segment} role="group" aria-label="Rata">
          {([["left", AlignLeft, "Rata kiri"], ["center", AlignCenter, "Rata tengah"], ["right", AlignRight, "Rata kanan"]] as const).map(([value, Icon, label]) =>
            <button key={value} type="button" aria-pressed={field.align === value} aria-label={label} title={label} onClick={() => set("align", value)}><Icon size={16} aria-hidden="true" /></button>)}
        </div>
        <div className={s.segment} role="group" aria-label="Rata vertikal">
          {([["top", AlignVerticalJustifyStart, "Rata atas"], ["middle", AlignVerticalJustifyCenter, "Rata tengah vertikal"], ["bottom", AlignVerticalJustifyEnd, "Rata bawah"]] as const).map(([value, Icon, label]) =>
            <button key={value} type="button" aria-pressed={(field.valign ?? "top") === value} aria-label={label} title={label} onClick={() => set("valign", value)}><Icon size={16} aria-hidden="true" /></button>)}
        </div>
      </div>
      <div className={s.tones} role="group" aria-label="Warna teks">
        {tones.map(([tone, label]) => <button key={tone} type="button" aria-pressed={field.tone === tone} title={label} aria-label={`Warna ${label}`} onClick={() => set("tone", tone)}><i style={{ background: palette.colors[tone] }} /></button>)}
        <label className={s.ownColor} title="Warna sendiri" data-on={!field.tone || undefined}><input type="color" value={field.tone ? palette.colors[field.tone] : field.color} onChange={event => onChange({ ...field, tone: "", color: event.target.value })} aria-label="Warna sendiri" /></label>
      </div>
    </> : <div className={s.tools}>
      <div className={s.segment} role="group" aria-label="Bentuk foto">
        <button type="button" aria-pressed={field.radius < ROUND} onClick={() => set("radius", field.radius >= ROUND ? 0 : field.radius)}>Kotak</button>
        <button type="button" aria-pressed={field.radius >= ROUND} onClick={() => set("radius", ROUND)}><Circle size={14} aria-hidden="true" /> Bundar</button>
      </div>
    </div>}

    <details className={s.advanced}>
      <summary>Pengaturan lanjutan (angka dari Figma)</summary>
      <p className={s.sub}>Posisi dalam piksel desain</p>
      {formats.map(format => {
        const box = field.box[format];
        const place = (next: PosterBox | null) => set("box", { ...field.box, [format]: next });
        return <fieldset key={format} className={s.box}>
          <legend><label className={s.check}><input type="checkbox" checked={!!box} onChange={event => place(event.target.checked ? { x: 0, y: 0, w: Math.round(posterSizes[format].width / 2), h: 80 } : null)} /> {posterSizes[format].label}</label></legend>
          {box && <div className={s.grid4}>
            {(["x", "y", "w", "h"] as const).map(key => numberInput(`${path}.box.${format}.${key}`, { x: "X", y: "Y", w: "Lebar", h: "Tinggi" }[key], box[key], value => place({ ...box, [key]: value })))}
          </div>}
        </fieldset>;
      })}
      {field.kind === "text" ? <div className={s.grid4}>
        {numberInput(`${path}.sizeMax`, "Ukuran maks", field.sizeMax, value => set("sizeMax", value))}
        {numberInput(`${path}.sizeMin`, "Ukuran min", field.sizeMin, value => set("sizeMin", value))}
        {numberInput(`${path}.maxLines`, "Maks baris", field.maxLines, value => set("maxLines", Math.max(1, Math.round(value))))}
        {numberInput(`${path}.lineHeight`, "Jarak baris", field.lineHeight, value => set("lineHeight", value), 0.05)}
        {numberInput(`${path}.letterSpacing`, "Jarak huruf (em)", field.letterSpacing, value => set("letterSpacing", value), 0.01)}
        {numberInput(`${path}.maxLength`, "Batas huruf", field.maxLength, value => set("maxLength", Math.max(1, Math.round(value))))}
        <label className={s.field}><span>Tebal</span><select className="select" value={field.weight} onChange={event => set("weight", Number(event.target.value))}>
          {weights.map(weight => <option key={weight} value={weight}>{weight}</option>)}
        </select></label>
        {!field.tone && <label className={s.field}><span>Kode warna</span><input id={`${path}.color`} className="input" value={field.color} maxLength={7} onChange={event => set("color", event.target.value)} /></label>}
      </div> : <div className={s.grid4}>
        {numberInput(`${path}.radius`, "Sudut", field.radius, value => set("radius", Math.min(ROUND, Math.max(0, value))))}
        <label className={s.field}><span>Warna kosong</span><input id={`${path}.fill`} className="input" value={field.fill} maxLength={7} onChange={event => set("fill", event.target.value)} /></label>
      </div>}
      <p className="field-hint">Teks panjang mengecil sendiri dari ukuran maks sampai ukuran min; kalau masih tidak muat, akhirnya terpotong “…”.</p>
    </details>
    {fieldErrors.length > 0 && <p className="field-error">{fieldErrors.join(" ")}</p>}
    <button type="button" className={s.remove} onClick={onRemove}><Trash2 size={15} aria-hidden="true" /> Hapus kotak ini</button>
  </div>;
}
