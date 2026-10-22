"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Check, Download, FileText, ImagePlus, Pencil, RotateCcw, Share2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui";
import { activePalette, fieldText, fitText, posterFormats, posterPalettes, posterSizes, type PosterField, type PosterFormat, type PosterSettings, type PosterValues } from "@/lib/poster";
import type { PhotoFrame } from "@/lib/types";
import { PosterCanvas } from "./PosterCanvas";
import { createMeasure, loadPosterFonts } from "./layout";
import { canShareFiles, canvasBlob, downloadBlob, posterFilename, posterPdf, renderPoster, shareBlob } from "./export";
import { clearDraft, loadDraft, preparePhoto, saveDraft } from "./draft";
import styles from "./studio.module.css";

type Props = { eventId: string; eventTitle: string; poster: PosterSettings };
const empty: PosterValues = { text: {}, photos: {} };
const noSubscription = () => () => {};
/** Below this the box editor is a sheet at the bottom (studio.module.css). */
const PHONE = "(max-width: 63.99rem)";

/**
 * The page a guest makes their poster on: the poster with grey hints, Edit to fill the boxes the
 * admin opened (text and photos, dragged and zoomed in place), Simpan, then Unduh or Bagikan.
 * The draft stays in this browser only.
 */
export function PosterStudio({ eventId, eventTitle, poster }: Props) {
  const formats = posterFormats.filter(format => poster.formats[format].enabled && poster.fields.some(field => field.box[format]));
  const [format, setFormat] = useState<PosterFormat>(formats[0] ?? "post");
  const [values, setValues] = useState<PosterValues>(empty);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [fontsVersion, setFontsVersion] = useState(0);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const canShare = useSyncExternalStore(noSubscription, canShareFiles, () => false);
  const blobs = useRef<Record<string, Blob>>({});
  const loaded = useRef(false);
  const editable = poster.fields.filter(field => field.editable && formats.some(f => field.box[f]));
  const current = poster.fields.find(field => field.key === selected) ?? null;

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
      setSaved(draft.saved);
    });
    return () => { alive = false; };
  }, [eventId]);

  // Kept a moment after each change, so a refresh or a closed tab loses nothing.
  useEffect(() => {
    if (!loaded.current) return;
    const timer = window.setTimeout(() => {
      const photos = Object.fromEntries(Object.entries(values.photos).filter(([key]) => blobs.current[key]).map(([key, photo]) => [key, { blob: blobs.current[key], frame: photo.frame }]));
      void saveDraft(eventId, { text: values.text, photos, saved, palette: values.palette });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [values, saved, eventId]);

  const setText = (key: string, text: string) => { setValues(current => ({ ...current, text: { ...current.text, [key]: text } })); setSaved(false); };
  const setFrame = (key: string, frame: PhotoFrame) => { setValues(current => current.photos[key] ? { ...current, photos: { ...current.photos, [key]: { ...current.photos[key], frame } } } : current); setSaved(false); };
  async function setPhoto(key: string, file: File | null) {
    const old = values.photos[key];
    if (old) URL.revokeObjectURL(old.url);
    if (!file) {
      delete blobs.current[key];
      setValues(current => { const photos = { ...current.photos }; delete photos[key]; return { ...current, photos }; });
    } else {
      const blob = await preparePhoto(file);
      blobs.current[key] = blob;
      setValues(current => ({ ...current, photos: { ...current.photos, [key]: { url: URL.createObjectURL(blob), frame: { x: 50, y: 50, zoom: 1 } } } }));
    }
    setSaved(false);
  }

  /**
   * Opens a box. On a phone its sheet covers the lower half of the screen, so the page scrolls the
   * box into the half above it.
   */
  function select(key: string | null) {
    setSelected(key);
    if (!key || !window.matchMedia(PHONE).matches) return;
    requestAnimationFrame(() => {
      const box = document.querySelector(`[data-field="${key}"]`)?.getBoundingClientRect();
      if (!box) return;
      const room = window.innerHeight * 0.5;
      window.scrollTo({ top: Math.max(0, window.scrollY + box.top - Math.max(12, (room - box.height) / 2)), behavior: "smooth" });
    });
  }
  function startEditing() { setEditing(true); setStatus(""); select(editable[0]?.key ?? null); }
  function finish() {
    setEditing(false); setSelected(null); setSaved(true);
    const missing = editable.filter(field => field.kind === "text" ? !fieldText(field, values).trim() : !values.photos[field.key]).length;
    setStatus(missing ? `Tersimpan. ${missing} kotak masih kosong dan tidak ikut tampil di poster.` : "Tersimpan. Poster siap diunduh.");
  }
  async function reset() {
    if (!window.confirm("Hapus semua isian dan foto di poster ini? Tindakan ini tidak bisa dibatalkan.")) return;
    for (const photo of Object.values(values.photos)) URL.revokeObjectURL(photo.url);
    blobs.current = {};
    setValues(empty); setSaved(false); setStatus("Isian dihapus.");
    await clearDraft(eventId);
  }

  const title = fieldText(poster.fields.find(field => field.key === "title") ?? ({ editable: false, value: eventTitle } as PosterField), values) || eventTitle;
  async function run(label: string, task: () => Promise<void>) {
    setBusy(label); setStatus("");
    try { await task(); }
    catch (error) { if ((error as Error)?.name !== "AbortError") setStatus((error as Error)?.message || "Gagal membuat poster. Coba lagi."); }
    finally { setBusy(""); }
  }
  const png = () => run("png", async () => { downloadBlob(await canvasBlob(await renderPoster(poster, values, format)), posterFilename(title, format, "png")); setStatus("Gambar diunduh."); });
  const pdf = () => run("pdf", async () => { downloadBlob(await posterPdf(poster, values, format), posterFilename(title, format, "pdf")); setStatus("PDF diunduh."); });
  const share = () => run("share", async () => { await shareBlob(await canvasBlob(await renderPoster(poster, values, format)), posterFilename(title, format, "png"), title); });

  const warnings = useMemo(() => {
    if (!current || current.kind !== "text") return [];
    const text = fieldText(current, values).trim();
    // Read so that a change in it (the real faces are in) measures again.
    void fontsVersion;
    return formats.filter(f => current.box[f] && text && fitText(createMeasure(current), text, current, current.box[f]!).truncated).map(f => posterSizes[f].label);
  }, [current, values, formats, fontsVersion]);

  return <div className={styles.studio}>
    <div className={styles.bar}>
      <div className={styles.choices}>
        {formats.length > 1 && <div className={styles.formats} role="group" aria-label="Ukuran">
          {formats.map(item => <button key={item} type="button" aria-pressed={format === item} onClick={() => setFormat(item)}>{posterSizes[item].label}</button>)}
        </div>}
        {/* Colours, when the admin lets each person pick their own. */}
        {poster.paletteChoice && <div className={styles.palettes} role="group" aria-label="Warna">
          {posterPalettes.map(palette => <button key={palette.key} type="button" aria-pressed={activePalette(poster, values).key === palette.key} title={palette.name} aria-label={`Warna ${palette.name}`}
            onClick={() => { setValues(current => ({ ...current, palette: palette.key })); setSaved(false); }}>
            <span style={{ background: palette.colors.background }} /><span style={{ background: palette.colors.primary }} /><span style={{ background: palette.colors.accent }} />
          </button>)}
        </div>}
      </div>
      <div className={styles.actions}>
        {editing
          ? <Button type="button" onClick={finish}><Check size={18} aria-hidden="true" /> Simpan</Button>
          : <Button type="button" variant={saved ? "secondary" : "primary"} onClick={startEditing}><Pencil size={18} aria-hidden="true" /> Edit</Button>}
        <Button type="button" variant={saved && !editing ? "primary" : "secondary"} onClick={png} disabled={!saved || editing || !!busy} aria-describedby="poster-download-hint"><Download size={18} aria-hidden="true" /> {busy === "png" ? "Membuat…" : "Unduh gambar"}</Button>
        <Button type="button" variant="secondary" onClick={pdf} disabled={!saved || editing || !!busy}><FileText size={18} aria-hidden="true" /> {busy === "pdf" ? "Membuat…" : "PDF"}</Button>
        {canShare && <Button type="button" variant="secondary" onClick={share} disabled={!saved || editing || !!busy}><Share2 size={18} aria-hidden="true" /> Bagikan</Button>}
      </div>
    </div>
    <p id="poster-download-hint" className={styles.status} role="status">{status || (editing ? "Ketuk kotak bergaris di poster untuk mengisinya." : saved ? "" : "Tekan Edit untuk mengisi poster. Setelah Simpan, poster bisa diunduh.")}</p>

    <div className={styles.layout} data-editing={editing || undefined}>
      <div className={styles.stage} style={{ "--ratio": posterSizes[format].width / posterSizes[format].height, "--cap": posterSizes[format].width > posterSizes[format].height ? "60rem" : "36rem" } as CSSProperties}>
        <PosterCanvas poster={poster} values={values} format={format} editing={editing} hints={editing || !saved} selected={selected} onSelect={select} onFrame={setFrame} fontsVersion={fontsVersion} />
      </div>
      {editing && <aside className={styles.panel} aria-label="Isi poster" data-open={current ? "" : undefined}>
        {current
          ? <FieldEditor key={current.key} field={current} values={values} warnings={warnings} onText={text => setText(current.key, text)} onPhoto={file => setPhoto(current.key, file)} onZoom={zoom => { const photo = values.photos[current.key]; if (photo) setFrame(current.key, { ...photo.frame, zoom }); }} onClose={() => select(null)} />
          : <p className={styles.panelHint}>Ketuk kotak bergaris di poster, atau pilih di bawah.</p>}
        <div className={styles.fieldList} role="group" aria-label="Kotak yang bisa diisi">
          {editable.map(field => <button key={field.key} type="button" aria-pressed={selected === field.key} data-filled={(field.kind === "text" ? !!fieldText(field, values).trim() : !!values.photos[field.key]) || undefined} onClick={() => select(field.key)}>{field.label}</button>)}
        </div>
        <button type="button" className={styles.reset} onClick={reset}><RotateCcw size={15} aria-hidden="true" /> Hapus semua isian</button>
      </aside>}
    </div>
  </div>;
}

function FieldEditor({ field, values, warnings, onText, onPhoto, onZoom, onClose }: { field: PosterField; values: PosterValues; warnings: string[]; onText: (text: string) => void; onPhoto: (file: File | null) => void; onZoom: (zoom: number) => void; onClose: () => void }) {
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { input.current?.focus({ preventScroll: true }); }, []);
  const photo = values.photos[field.key];
  const text = fieldText(field, values);
  return <div className={styles.editor}>
    <div className={styles.editorHead}>
      <label htmlFor={`poster-${field.key}`}>{field.label}</label>
      <button type="button" onClick={onClose} aria-label="Tutup"><X size={18} aria-hidden="true" /></button>
    </div>
    {field.kind === "text"
      ? <>
        <textarea ref={input} id={`poster-${field.key}`} className="textarea" rows={field.maxLines > 2 ? 4 : 2} value={text} placeholder={field.hint} maxLength={field.maxLength} onChange={event => onText(event.target.value)} />
        <p className={styles.counter}><span>{[...text].length}/{field.maxLength}</span>{warnings.length > 0 && <strong role="alert">Teks terlalu panjang untuk {warnings.join(" dan ")}; akhirnya terpotong. Persingkat sedikit.</strong>}</p>
      </>
      : <>
        <div className={styles.photoActions}>
          <label className="button button--primary" htmlFor={`poster-${field.key}`}><ImagePlus size={18} aria-hidden="true" /> {photo ? "Ganti foto" : "Unggah foto"}</label>
          <input id={`poster-${field.key}`} className="sr-only" type="file" accept="image/*" onChange={event => { onPhoto(event.target.files?.[0] ?? null); event.target.value = ""; }} />
          {photo && <button type="button" className="button button--quiet" onClick={() => onPhoto(null)}><Trash2 size={18} aria-hidden="true" /> Hapus</button>}
        </div>
        {photo && <label className={styles.zoom}>Zoom<input type="range" min={1} max={3} step={0.05} value={photo.frame.zoom} onChange={event => onZoom(Number(event.target.value))} /></label>}
        <p className={styles.counter}>{photo ? "Geser foto langsung di poster untuk mengatur posisinya. Di HP, cubit dengan dua jari untuk zoom." : "Foto hanya diproses di perangkat ini, tidak diunggah ke server."}</p>
      </>}
  </div>;
}
