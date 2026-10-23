"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { uploadPhoto } from "@/components/admin/shared/PhotoField";
import { errorMessage } from "@/components/admin/shared/api";
import { posterSizes, type PosterFormat, type PosterField, type PosterPart } from "@/lib/poster";
import type { PlainImage } from "@/lib/types";
import { backgroundPng, importInBrowser, nameMarks, NoLayersError, sanitizeSvg, type FigmaImport as Imported, type Mark } from "./figma-import";
import { FigmaMarker } from "./FigmaMarker";
import s from "./card-figma.module.css";

/** The file as text; FileReader works in every browser (File.text() is newer). */
const readText = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result ?? ""));
  reader.onerror = () => reject(new Error("Berkas tidak terbaca. Coba pilih lagi."));
  reader.readAsText(file);
});

export type FigmaResult = { format: PosterFormat; background: PlainImage; overlay: PlainImage; parts: PosterPart[]; fields: PosterField[]; notes: string[] };

/**
 * One button: a frame exported from Figma as SVG becomes the card. The layers named isi_… and
 * foto_… become the guests' fields; the rest is drawn to an image and uploaded as the background.
 * A file without such names is not turned away: the admin taps the parts on the design instead.
 */
export function FigmaImport({ onImport }: { onImport: (result: FigmaResult) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; notes: string[] } | null>(null);
  const [marking, setMarking] = useState<string | null>(null);

  async function read(file: File) {
    await run(async () => {
      if (!/\.svg$/i.test(file.name) && file.type !== "image/svg+xml") throw new Error("Pilih berkas .svg hasil ekspor Figma.");
      if (file.size > 15_000_000) throw new Error("SVG lebih dari 15 MB. Kecilkan foto di dalam desain, lalu ekspor ulang.");
      const source = sanitizeSvg(await readText(file));
      try {
        await finish(importInBrowser(source));
      } catch (error) {
        // No isi_/foto_ layers: let the admin mark the parts on the design.
        if (!(error instanceof NoLayersError)) throw error;
        setMarking(source);
      }
    });
  }

  async function marked(source: string, marks: Mark[]) {
    await run(async () => { await finish(importInBrowser(nameMarks(source, marks))); setMarking(null); });
  }

  async function run(task: () => Promise<void>) {
    setPending(true); setMessage(null);
    try {
      await task();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error && !("status" in error) ? error.message : errorMessage(error), notes: [] });
    } finally {
      setPending(false);
      if (input.current) input.current.value = "";
    }
  }

  async function finish(imported: Imported) {
    const png = await backgroundPng(imported.background, imported.format);
    const background = await uploadPhoto(new File([png], `latar-${imported.format}.png`, { type: "image/png" }));
    // The overlay keeps its transparency: uploaded as PNG, drawn over the guest's photos.
    const image = async (svg: string | null, name: string): Promise<PlainImage> => {
      if (!svg) return { url: "", alt: "", srcset: [] };
      const uploaded = await uploadPhoto(new File([await backgroundPng(svg, imported.format)], `${name}-${imported.format}.png`, { type: "image/png" }));
      return { ...uploaded, alt: "" };
    };
    const overlay = await image(imported.overlay, "atas");
    // Each box's own pictures: transparent PNGs the size of the card, like the overlay.
    const parts: PosterPart[] = [];
    for (const part of imported.parts) parts.push({ key: part.key, art: await image(part.art, "petunjuk"), slot: await image(part.slot, "slot") });
    onImport({ format: imported.format, background: { ...background, alt: "" }, overlay, parts, fields: imported.fields, notes: imported.notes });
    setMessage({ tone: "ok", text: `${imported.fields.length} kolom ditemukan untuk ukuran ${posterSizes[imported.format].label}. Periksa di bawah, lalu simpan.`, notes: imported.notes });
  }

  return <div className={s.figma}>
    <label className={`button button--primary ${s.figmaButton}`} aria-disabled={pending || undefined}>
      <FileUp size={18} aria-hidden="true" /> {pending ? "Membaca desain…" : "Unggah desain dari Figma (SVG)"}
      <input ref={input} type="file" accept=".svg,image/svg+xml" className="sr-only" disabled={pending} onChange={event => { const file = event.target.files?.[0]; if (file) void read(file); }} />
    </label>
    <ol className={s.figmaSteps}>
      <li>Ukuran frame sama dengan ukuran kartu, misalnya 1080×1350 (Post) atau 1080×1920 (Story).</li>
      <li>Pilih frame → Export → SVG, centang <strong>Outline text</strong>, lalu unggah di sini. Unggah lagi untuk ukuran lain.</li>
      <li>Setelah diunggah, ketuk bagian yang boleh diganti peserta. Lebih cepat lagi: di Figma beri nama layernya <code>isi_judul</code>, <code>isi_nama</code>, <code>foto_utama</code>, dan seterusnya, lalu centang <strong>Include “id” attribute</strong> saat ekspor; kolomnya langsung terbaca.</li>
    </ol>
    {marking && <FigmaMarker source={marking} onDone={marks => void marked(marking, marks)} onCancel={() => setMarking(null)} />}
    {message && <div role={message.tone === "error" ? "alert" : "status"} className={s.figmaResult} data-tone={message.tone}>
      <p>{message.text}</p>
      {message.notes.length > 0 && <ul>{message.notes.map(note => <li key={note}>{note}</li>)}</ul>}
    </div>}
  </div>;
}
