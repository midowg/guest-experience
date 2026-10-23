"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Download, Eye, EyeOff, FileText, ImagePlus, RotateCcw, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { activePalette, fieldText, fitText, posterFormats, posterPalettes, posterSizes, type PosterField, type PosterFormat, type PosterSettings, type PosterValues } from "@/lib/poster";
import type { PhotoFrame } from "@/lib/types";
import { PosterCanvas } from "./PosterCanvas";
import { createMeasure, loadPosterFonts } from "./layout";
import { canShareFiles, canvasBlob, downloadBlob, posterFilename, posterPdf, renderPoster, shareBlob } from "./export";
import { clearDraft, loadDraft, preparePhoto, saveDraft } from "./draft";
import styles from "./card-studio.module.css";
import frame from "./card-frame.module.css";
import look from "./card-look.module.css";

type Props = { eventId: string; eventTitle: string; poster: PosterSettings };
const empty: PosterValues = { text: {}, photos: {} };
const noSubscription = () => () => {};
const noop = () => {};

/**
 * The page a guest makes their card on: a form on the left (one field per box the admin opened)
 * and the card on the right, updated as they type. Download is always there. On a phone the card
 * stays small at the top while the form scrolls under it. The draft stays in this browser only.
 */
export function PosterStudio({ eventId, eventTitle, poster }: Props) {
  const formats = posterFormats.filter(format => poster.formats[format].enabled && poster.fields.some(field => field.box[format]));
  const [format, setFormat] = useState<PosterFormat>(formats[0] ?? "post");
  const [values, setValues] = useState<PosterValues>(empty);
  const [fontsVersion, setFontsVersion] = useState(0);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  // A phone can fold the card away to type with more room; it starts open.
  const [hidden, setHidden] = useState(false);
  const canShare = useSyncExternalStore(noSubscription, canShareFiles, () => false);
  const blobs = useRef<Record<string, Blob>>({});
  const loaded = useRef(false);
  const fields = poster.fields.filter(field => field.editable && formats.some(f => field.box[f]));

  useEffect(() => { loadPosterFonts(poster.fields).then(() => setFontsVersion(version => version + 1)); }, [poster.fields]);

  // The draft from an earlier visit, if any.
  useEffect(() => {
    let alive = true;
    loadDraft(eventId).then(draft => {
      loaded.current = true;
      if (!alive || !draft) return;
      const photos: PosterValues["photos"] = {};
      for (const [key, photo] of Object.entries(draft.photos)) { blobs.current[key] = photo.blob; photos[key] = { url: URL.createObjectURL(photo.blob), frame: photo.frame }; }
      setValues({ text: draft.text, photos, palette: draft.palette });
    });
    return () => { alive = false; };
  }, [eventId]);

  // Kept a moment after each change, so a refresh or a closed tab loses nothing.
  useEffect(() => {
    if (!loaded.current) return;
    const timer = window.setTimeout(() => {
      const photos = Object.fromEntries(Object.entries(values.photos).filter(([key]) => blobs.current[key]).map(([key, photo]) => [key, { blob: blobs.current[key], frame: photo.frame }]));
      void saveDraft(eventId, { text: values.text, photos, saved: true, palette: values.palette });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [values, eventId]);

  const setText = (key: string, text: string) => setValues(current => ({ ...current, text: { ...current.text, [key]: text } }));
  const setFrame = (key: string, frame: PhotoFrame) => setValues(current => current.photos[key] ? { ...current, photos: { ...current.photos, [key]: { ...current.photos[key], frame } } } : current);
  async function setPhoto(key: string, file: File | null) {
    const old = values.photos[key];
    if (old) URL.revokeObjectURL(old.url);
    if (!file) {
      delete blobs.current[key];
      setValues(current => { const photos = { ...current.photos }; delete photos[key]; return { ...current, photos }; });
      return;
    }
    const blob = await preparePhoto(file);
    blobs.current[key] = blob;
    setValues(current => ({ ...current, photos: { ...current.photos, [key]: { url: URL.createObjectURL(blob), frame: { x: 50, y: 50, zoom: 1 } } } }));
  }
  async function reset() {
    if (!window.confirm("Hapus semua isian dan foto? Tindakan ini tidak bisa dibatalkan.")) return;
    for (const photo of Object.values(values.photos)) URL.revokeObjectURL(photo.url);
    blobs.current = {};
    setValues(empty); setStatus("Isian dihapus.");
    await clearDraft(eventId);
  }

  // Which boxes end in "…" in the size being made, so the form can say so beside the field.
  const truncated = useMemo(() => {
    void fontsVersion;
    return new Set(fields.filter(field => {
      const box = field.box[format], text = fieldText(field, values).trim();
      return field.kind === "text" && box && text && fitText(createMeasure(field), text, field, box).truncated;
    }).map(field => field.key));
  }, [fields, values, format, fontsVersion]);
  const missing = fields.filter(field => field.kind === "text" ? !fieldText(field, values).trim() : !values.photos[field.key]);

  const title = fieldText(poster.fields.find(field => field.key === "title") ?? ({ editable: false, value: eventTitle } as PosterField), values) || eventTitle;
  async function run(label: string, done: string, task: () => Promise<void>) {
    setBusy(label); setStatus("");
    try {
      await task();
      // Not a block: empty fields simply do not show. Said once, after the file is made.
      setStatus(missing.length ? `${done} Catatan: ${missing.map(field => field.label).join(", ")} masih kosong dan tidak tampil.` : done);
    }
    catch (error) { if ((error as Error)?.name !== "AbortError") setStatus((error as Error)?.message || "Gagal membuat kartu. Coba lagi."); }
    finally { setBusy(""); }
  }
  const png = () => run("png", "Gambar diunduh.", async () => downloadBlob(await canvasBlob(await renderPoster(poster, values, format)), posterFilename(title, format, "png")));
  const pdf = () => run("pdf", "PDF diunduh.", async () => downloadBlob(await posterPdf(poster, values, format), posterFilename(title, format, "pdf")));
  const share = () => run("share", "Siap dibagikan.", async () => shareBlob(await canvasBlob(await renderPoster(poster, values, format)), posterFilename(title, format, "png"), title));
  const ratio = posterSizes[format].width / posterSizes[format].height;

  return <div className={`${styles.split} ${look.studio}`}>
    <form className={styles.form} aria-label="Isi kartu" onSubmit={event => event.preventDefault()}>
      {fields.map(field => field.kind === "text"
        ? <TextField key={field.key} field={field} value={fieldText(field, values)} truncated={truncated.has(field.key)} onChange={text => setText(field.key, text)} />
        : <PhotoField key={field.key} field={field} photo={values.photos[field.key]} onPhoto={file => void setPhoto(field.key, file)} onZoom={zoom => { const photo = values.photos[field.key]; if (photo) setFrame(field.key, { ...photo.frame, zoom }); }} />)}
      {fields.length === 0 && <p className={styles.hint}>Kartu ini tidak punya kolom untuk diisi. Langsung unduh saja.</p>}
      <button type="button" className={styles.reset} onClick={() => void reset()}><RotateCcw size={15} aria-hidden="true" /> Hapus semua isian</button>
    </form>

    {/*
      The card in a frame, with its buttons at the bottom of the frame: beside the form on a wide
      screen, pinned at the top on a phone, where it can be folded down to its buttons.
    */}
    <div className={styles.side}>
      <section className={frame.frame} data-hidden={hidden || undefined} aria-label="Pratinjau kartu">
        <div className={frame.head}>
          <span className={frame.title}>Pratinjau</span>
          <button type="button" className={frame.toggle} aria-expanded={!hidden} aria-controls="kartu-pratinjau" onClick={() => setHidden(value => !value)}>
            {hidden ? <><Eye size={16} aria-hidden="true" /> Tampilkan</> : <><EyeOff size={16} aria-hidden="true" /> Sembunyikan</>}
          </button>
        </div>
        <div id="kartu-pratinjau" className={frame.body}>
          {(formats.length > 1 || poster.paletteChoice) && <div className={styles.choices}>
            {formats.length > 1 && <div className={styles.formats} role="group" aria-label="Ukuran">
              {formats.map(item => <button key={item} type="button" aria-pressed={format === item} onClick={() => setFormat(item)}>{posterSizes[item].label}</button>)}
            </div>}
            {/* Colours, when the admin lets each person pick their own. */}
            {poster.paletteChoice && <div className={styles.palettes} role="group" aria-label="Warna">
              {posterPalettes.map(palette => <button key={palette.key} type="button" aria-pressed={activePalette(poster, values).key === palette.key} title={palette.name} aria-label={`Warna ${palette.name}`}
                onClick={() => setValues(current => ({ ...current, palette: palette.key }))}>
                <span style={{ background: palette.colors.background }} /><span style={{ background: palette.colors.primary }} /><span style={{ background: palette.colors.accent }} />
              </button>)}
            </div>}
          </div>}
          <div className={frame.stage} style={{ "--ratio": ratio } as CSSProperties}>
            <PosterCanvas poster={poster} values={values} format={format} editing={false} hints selected={null} onSelect={noop} onFrame={setFrame} fontsVersion={fontsVersion} movePhotos />
          </div>
        </div>
        <div className={frame.actions}>
          <Button type="button" onClick={png} disabled={!!busy} aria-label="Unduh gambar"><Download size={18} aria-hidden="true" /> {busy === "png" ? "Membuat…" : "Unduh"}</Button>
          <Button type="button" variant="secondary" onClick={pdf} disabled={!!busy}><FileText size={18} aria-hidden="true" /> {busy === "pdf" ? "Membuat…" : "PDF"}</Button>
          {canShare && <Button type="button" variant="secondary" onClick={share} disabled={!!busy}><Share2 size={18} aria-hidden="true" /> Bagikan</Button>}
        </div>
        <p className={frame.status} role="status">{status}</p>
      </section>
    </div>
  </div>;
}

function TextField({ field, value, truncated, onChange }: { field: PosterField; value: string; truncated: boolean; onChange: (text: string) => void }) {
  const id = `kartu-${field.key}`;
  const props = { id, value, placeholder: field.hint, maxLength: field.maxLength, onChange: (event: { target: { value: string } }) => onChange(event.target.value), "aria-describedby": `${id}-info` };
  return <div className={styles.field}>
    <label htmlFor={id}>{field.label}</label>
    {field.maxLines > 1 ? <textarea {...props} className="textarea" rows={Math.min(5, field.maxLines)} /> : <input {...props} className="input" />}
    <p id={`${id}-info`} className={styles.counter}><span>{[...value].length}/{field.maxLength}</span>{truncated && <strong>Terlalu panjang untuk kotaknya; akhirnya terpotong “…”. Persingkat sedikit.</strong>}</p>
  </div>;
}

function PhotoField({ field, photo, onPhoto, onZoom }: { field: PosterField; photo?: PosterValues["photos"][string]; onPhoto: (file: File | null) => void; onZoom: (zoom: number) => void }) {
  const id = `kartu-${field.key}`;
  return <div className={styles.field}>
    <span className={styles.label}>{field.label}</span>
    <div className={styles.photoActions}>
      <label className="button button--secondary" htmlFor={id}><ImagePlus size={18} aria-hidden="true" /> {photo ? "Ganti foto" : "Pilih foto"}</label>
      <input id={id} className="sr-only" type="file" accept="image/*" aria-label={`${photo ? "Ganti" : "Pilih"} ${field.label}`} onChange={event => { onPhoto(event.target.files?.[0] ?? null); event.target.value = ""; }} />
      {photo && <button type="button" className="button button--quiet" onClick={() => onPhoto(null)}><Trash2 size={18} aria-hidden="true" /> Hapus</button>}
    </div>
    {photo && <label className={styles.zoom}>Zoom<input type="range" min={1} max={3} step={0.05} value={photo.frame.zoom} onChange={event => onZoom(Number(event.target.value))} /></label>}
    <p className={styles.counter}>{photo ? "Geser foto di kartu untuk mengatur posisinya." : "Foto hanya diproses di perangkat ini, tidak diunggah ke server."}</p>
  </div>;
}
