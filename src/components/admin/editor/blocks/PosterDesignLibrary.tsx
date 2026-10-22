"use client";

import { useState } from "react";
import { BookmarkPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import type { PosterDesign, PosterSettings } from "@/lib/poster";
import { posterDesignsApi } from "@/lib/routes";
import s from "./poster-block.module.css";

type Props = {
  poster: PosterSettings; initial: PosterDesign[]; superAdmin: boolean;
  onApply: (design: PosterDesign) => void;
};

/**
 * Designs saved from earlier events. Any admin may start a poster from one; the super admin saves
 * the poster on screen as a new design (backgrounds and boxes, not the guests' text) or removes one.
 */
export function PosterDesignLibrary({ poster, initial, superAdmin, onApply }: Props) {
  const [designs, setDesigns] = useState(initial);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    if (name.trim().length < 2) { setMessage("Isi nama desain minimal 2 huruf."); return; }
    setPending(true); setMessage("");
    try {
      const result = await adminRequest<PosterDesign>(posterDesignsApi(), { method: "POST", body: JSON.stringify({ name, description, template: { preset: poster.preset, formats: poster.formats, fields: poster.fields } }) });
      if (result.data) setDesigns(current => [result.data!, ...current]);
      setName(""); setDescription(""); setMessage(result.message);
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setPending(false); }
  }
  async function remove(design: PosterDesign) {
    if (!window.confirm(`Hapus desain “${design.name}” dari pustaka? Acara yang sudah memakainya tidak berubah.`)) return;
    setPending(true); setMessage("");
    try {
      const result = await adminRequest(posterDesignsApi(design.id), { method: "DELETE" });
      setDesigns(current => current.filter(item => item.id !== design.id)); setMessage(result.message);
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setPending(false); }
  }

  return <>
    {designs.map(design => <div key={design.id} className={s.design}>
      <div><strong>{design.name}</strong><p className="field-hint">{design.description || `${design.template.fields.length} kotak`} · disimpan dari acara</p></div>
      <div className={s.add}>
        <Button type="button" variant="secondary" disabled={pending} onClick={() => onApply(design)}>Pakai desain ini</Button>
        {superAdmin && <Button type="button" variant="quiet" disabled={pending} onClick={() => void remove(design)} aria-label={`Hapus desain ${design.name}`}><Trash2 size={16} aria-hidden="true" /></Button>}
      </div>
    </div>)}
    {superAdmin && poster.fields.length > 0 && <details className={s.saveDesign}>
      <summary><BookmarkPlus size={16} aria-hidden="true" /> Simpan sebagai desain baru</summary>
      <p className="field-hint">Latar dan kotak poster ini masuk pustaka, sehingga acara lain bisa memulai dari desain yang sama. Simpan acaranya dulu bila latar baru saja diunggah.</p>
      <label className={s.field}><span>Nama desain</span><input className="input" value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder="JCWF 2026 – sesi kuliner" /></label>
      <label className={s.field}><span>Keterangan (opsional)</span><input className="input" value={description} maxLength={300} onChange={event => setDescription(event.target.value)} /></label>
      <Button type="button" disabled={pending} onClick={() => void save()}>{pending ? "Menyimpan…" : "Simpan ke pustaka"}</Button>
    </details>}
    <p role="status" className="field-hint">{message}</p>
  </>;
}
