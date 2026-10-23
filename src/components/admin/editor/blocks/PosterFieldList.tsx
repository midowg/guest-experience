"use client";

import { Image as ImageIcon, Type } from "lucide-react";
import type { PosterField } from "@/lib/poster";
import base from "./card-editor.module.css";
import s from "./card-figma.module.css";

/**
 * The card's boxes as a short list: a name, whether guests fill it, and then either the fixed
 * text (filled by the committee) or the hint guests see, with how many letters they may type.
 * Everything else waits under "Lanjutan".
 */
export function PosterFieldList({ fields, onChange }: { fields: PosterField[]; onChange: (key: string, field: PosterField) => void }) {
  return <ul className={s.fieldList} aria-label="Kolom kartu">
    {fields.map((field, index) => {
      const set = <K extends keyof PosterField>(name: K, value: PosterField[K]) => onChange(field.key, { ...field, [name]: value });
      const path = `poster.fields.${index}`;
      return <li key={field.key} className={s.fieldRow} data-locked={!field.editable || undefined}>
        <div className={s.fieldRowHead}>
          <span className={base.kind} aria-hidden="true">{field.kind === "photo" ? <ImageIcon size={16} /> : <Type size={16} />}</span>
          <input id={`${path}.label`} className={`input ${s.fieldName}`} value={field.label} maxLength={80} onChange={event => set("label", event.target.value)} aria-label="Nama kolom" />
          <label className={base.check}><input type="checkbox" role="switch" checked={field.editable} onChange={event => set("editable", event.target.checked)} aria-label={`${field.label} diisi peserta`} /> Diisi peserta</label>
          {field.editable && <label className={base.check} title="Boleh dikosongkan peserta. Bila kosong, kotaknya tidak ikut di hasil unduhan."><input type="checkbox" checked={!!field.optional} onChange={event => set("optional", event.target.checked)} aria-label={`${field.label} opsional`} /> Opsional</label>}
        </div>
        {field.editable
          ? <div className={s.fieldGuide}>
            <input id={`${path}.hint`} className="input" value={field.hint} maxLength={200} onChange={event => set("hint", event.target.value)} placeholder="Petunjuk untuk peserta (opsional)" aria-label={`Petunjuk ${field.label}`} />
            {field.kind === "text" && <label className={s.fieldLimit}>Maks. huruf
              <input id={`${path}.maxLength`} className="input" type="number" inputMode="numeric" min={1} max={1000} value={field.maxLength}
                onChange={event => { const value = Math.round(Number(event.target.value)); if (value >= 1 && value <= 1000) set("maxLength", value); }} />
            </label>}
          </div>
          : field.kind === "text" && <textarea id={`${path}.value`} className="textarea" rows={1} value={field.value} maxLength={2000} onChange={event => set("value", event.target.value)} placeholder="Isi tetap dari panitia" aria-label={`Isi tetap ${field.label}`} />}
      </li>;
    })}
  </ul>;
}
