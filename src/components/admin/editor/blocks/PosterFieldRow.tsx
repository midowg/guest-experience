"use client";

import type { ChangeEvent } from "react";
import { Image as ImageIcon, Trash2, Type } from "lucide-react";
import { posterFonts, posterSizes, type PaletteRole, type PosterBox, type PosterField, type PosterFont, type PosterFormat } from "@/lib/poster";
import s from "./poster-block.module.css";

/** Palette roles a text can follow, so it changes with the chosen colours; "" keeps its own colour. */
const toneOptions: [PaletteRole | "", string][] = [["primary", "Tema: utama"], ["accent", "Tema: aksen"], ["text", "Tema: teks"], ["muted", "Tema: teks redup"], ["onPrimary", "Tema: di atas warna utama"], ["background", "Tema: latar"], ["", "Warna sendiri"]];

type Props = {
  field: PosterField; index: number; open: boolean;
  /** The sizes switched on: only those get position inputs. */
  formats: PosterFormat[];
  onToggle: (open: boolean) => void;
  onChange: (field: PosterField) => void;
  onRemove: () => void;
  errors: Record<string, string[]>;
};

/**
 * One box of the poster in the admin's table: whether guests may change it, its text, and (folded)
 * where it sits per format and how its text looks. Positions are the design pixels Figma shows.
 */
export function PosterFieldRow({ field, index, formats, open, onToggle, onChange, onRemove, errors }: Props) {
  const path = `poster.fields.${index}`;
  const set = <K extends keyof PosterField>(key: K, value: PosterField[K]) => onChange({ ...field, [key]: value });
  const number = (value: string, fallback: number) => { const parsed = Number(value.replace(",", ".")); return Number.isFinite(parsed) ? parsed : fallback; };
  const numberInput = (id: string, label: string, value: number, apply: (value: number) => void, step = 1) =>
    <label key={id} className={s.num}><span>{label}</span><input id={id} className="input" type="number" inputMode="decimal" step={step} value={value} onChange={(event: ChangeEvent<HTMLInputElement>) => apply(number(event.target.value, value))} aria-invalid={!!errors[id] || undefined} /></label>;
  const rowErrors = Object.entries(errors).filter(([key]) => key === path || key.startsWith(`${path}.`)).flatMap(([, list]) => list);

  return <details className={s.row} open={open} onToggle={event => onToggle((event.currentTarget as HTMLDetailsElement).open)} data-field-row={field.key}>
    <summary>
      <span className={s.kind} aria-hidden="true">{field.kind === "photo" ? <ImageIcon size={16} /> : <Type size={16} />}</span>
      <span className={s.rowTitle}>{field.label}<small>{field.editable ? "Diisi peserta" : "Terkunci"}{field.kind === "text" && field.value ? ` · ${field.value.split("\n")[0].slice(0, 40)}` : ""}</small></span>
      {rowErrors.length > 0 && <span className={s.rowError}>Perlu diperbaiki</span>}
    </summary>
    <div className={s.rowBody}>
      <label className={s.check}><input type="checkbox" role="switch" checked={field.editable} onChange={event => set("editable", event.target.checked)} /> Boleh diedit peserta</label>
      <div className={s.grid2}>
        <label className={s.field}><span>Nama kotak</span><input id={`${path}.label`} className="input" value={field.label} maxLength={80} onChange={event => set("label", event.target.value)} /></label>
        <label className={s.field}><span>Teks petunjuk</span><input id={`${path}.hint`} className="input" value={field.hint} maxLength={200} onChange={event => set("hint", event.target.value)} /></label>
      </div>
      {field.kind === "text" && <>
        <label className={s.field}><span>{field.editable ? "Isi awal (peserta boleh mengubah)" : "Isi tetap"}</span>
          <textarea id={`${path}.value`} className="textarea" rows={2} value={field.value} maxLength={2000} onChange={event => set("value", event.target.value)} /></label>
        {numberInput(`${path}.maxLength`, "Batas huruf", field.maxLength, value => set("maxLength", Math.max(1, Math.round(value))))}
      </>}

      <p className={s.sub}>Posisi (piksel desain, dari Figma)</p>
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

      {field.kind === "text" ? <>
        <p className={s.sub}>Huruf</p>
        <div className={s.grid4}>
          <label className={s.field}><span>Font</span><select className="select" value={field.font} onChange={event => { const font = event.target.value as PosterFont; onChange({ ...field, font, weight: posterFonts[font].weights.includes(field.weight as never) ? field.weight : posterFonts[font].weights[0] }); }}>
            {Object.entries(posterFonts).map(([key, font]) => <option key={key} value={key}>{font.label}</option>)}
          </select></label>
          <label className={s.field}><span>Tebal</span><select className="select" value={field.weight} onChange={event => set("weight", Number(event.target.value))}>
            {posterFonts[field.font].weights.map(weight => <option key={weight} value={weight}>{weight}</option>)}
          </select></label>
          <label className={s.field}><span>Warna</span><select className="select" value={field.tone} onChange={event => set("tone", event.target.value as PaletteRole | "")}>
            {toneOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          {!field.tone && <label className={s.field}><span>Warna sendiri</span><span className={s.color}><input type="color" value={field.color} onChange={event => set("color", event.target.value)} aria-label="Pilih warna" /><input id={`${path}.color`} className="input" value={field.color} maxLength={7} onChange={event => set("color", event.target.value)} /></span></label>}
          <label className={s.field}><span>Rata</span><select className="select" value={field.align} onChange={event => set("align", event.target.value as PosterField["align"])}>
            <option value="left">Kiri</option><option value="center">Tengah</option><option value="right">Kanan</option>
          </select></label>
          {numberInput(`${path}.sizeMax`, "Ukuran maks", field.sizeMax, value => set("sizeMax", value))}
          {numberInput(`${path}.sizeMin`, "Ukuran min", field.sizeMin, value => set("sizeMin", value))}
          {numberInput(`${path}.maxLines`, "Maks baris", field.maxLines, value => set("maxLines", Math.max(1, Math.round(value))))}
          {numberInput(`${path}.lineHeight`, "Jarak baris", field.lineHeight, value => set("lineHeight", value), 0.05)}
          {numberInput(`${path}.letterSpacing`, "Jarak huruf (em)", field.letterSpacing, value => set("letterSpacing", value), 0.01)}
        </div>
        <label className={s.check}><input type="checkbox" checked={field.uppercase} onChange={event => set("uppercase", event.target.checked)} /> Huruf besar semua</label>
        <p className="field-hint">Teks panjang mengecil sendiri dari ukuran maks sampai ukuran min; kalau masih tidak muat, akhirnya terpotong “…”.</p>
      </> : <div className={s.grid4}>
        {numberInput(`${path}.radius`, "Sudut", field.radius, value => set("radius", Math.max(0, value)))}
        <label className={s.field}><span>Warna kosong</span><span className={s.color}><input type="color" value={field.fill} onChange={event => set("fill", event.target.value)} aria-label="Pilih warna" /><input id={`${path}.fill`} className="input" value={field.fill} maxLength={7} onChange={event => set("fill", event.target.value)} /></span></label>
      </div>}
      {rowErrors.length > 0 && <p className="field-error">{rowErrors.join(" ")}</p>}
      <button type="button" className={s.remove} onClick={onRemove}><Trash2 size={15} aria-hidden="true" /> Hapus kotak ini</button>
    </div>
  </details>;
}
