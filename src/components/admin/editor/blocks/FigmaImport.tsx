"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { uploadPhoto } from "@/components/admin/shared/PhotoField";
import { errorMessage } from "@/components/admin/shared/api";
import { posterSizes, type PosterFormat, type PosterField, type PosterPart } from "@/lib/poster";
import type { PlainImage } from "@/lib/types";
import { backgroundPng, importInBrowser, mergeImport, nameMarks, NoLayersError, sanitizeSvg, type FigmaImport as Imported, type Mark } from "./figma-import";
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

/** "Post 4:5", "Post 4:5 dan A4", "Post 4:5, Story 9:16, dan A4". */
const sizeList = (formats: PosterFormat[]) => {
  const labels = [...new Set(formats)].map(format => posterSizes[format].label);
  return labels.length < 3 ? labels.join(" dan ") : `${labels.slice(0, -1).join(", ")}, dan ${labels[labels.length - 1]}`;
};
const describe = (error: unknown) => error instanceof Error && !("status" in error) ? error.message : errorMessage(error);

/**
 * One button: frames exported from Figma as SVG become the card, one size per file (several
 * files may be chosen at once, read in the order chosen). The layers named isi_… and foto_…
 * become the guests' fields; the rest is drawn to an image and uploaded as the background.
 * A file without such names is not turned away: the admin taps the parts on the design instead,
 * and the next file waits until that is done (or skipped with Batal).
 * `fields`: the boxes an earlier Figma import made for another size, offered by name while
 * marking, so both sizes fill one form; within a batch, the earlier files' boxes join them.
 * `onImport` returns false when the admin keeps the design they had: the rest of the batch stops.
 */
export function FigmaImport({ fields = [], onImport }: { fields?: PosterField[]; onImport: (result: FigmaResult) => boolean | void }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; notes: string[] } | null>(null);
  const [marking, setMarking] = useState<{ id: number; source: string; existing: PosterField[] } | null>(null);
  const answer = useRef<((marks: Mark[] | null) => void) | null>(null);
  // A batch outlives the render it started in: each file goes to the newest onImport.
  const latest = useRef(onImport);
  useEffect(() => { latest.current = onImport; });

  /** Opens the marker on a file and waits for the admin: the marks, or null on Batal. */
  const ask = (source: string, existing: PosterField[]) => new Promise<Mark[] | null>(resolve => {
    answer.current = resolve;
    setMarking(now => ({ id: (now?.id ?? 0) + 1, source, existing }));
  });
  const reply = (marks: Mark[] | null) => { const resolve = answer.current; answer.current = null; resolve?.(marks); };

  async function readAll(files: File[]) {
    if (!files.length) return;
    setPending(true); setMessage(null);
    const many = files.length > 1;
    let known = fields;
    const sizes: PosterFormat[] = [], keys = new Set<string>(), notes: string[] = [], failed: string[] = [];
    try {
      for (const file of files) {
        let made: { imported: Imported; result: FigmaResult } | null;
        try {
          made = await readOne(file, known, sizes);
        } catch (error) {
          failed.push(many ? `${file.name} tidak diunggah: ${describe(error)}` : describe(error));
          continue;
        }
        if (!made) { if (many) notes.push(`${file.name} dilewati.`); continue; }
        const { imported, result } = made;
        if (latest.current(result) === false) break;
        known = mergeImport(known, true, imported);
        sizes.push(imported.format);
        for (const field of imported.fields) keys.add(field.key);
        notes.push(...imported.notes.map(note => many ? `${posterSizes[imported.format].label}: ${note}` : note));
      }
    } catch (error) {
      failed.push(describe(error));
    } finally {
      answer.current = null;
      setMarking(null);
      setPending(false);
      if (input.current) input.current.value = "";
    }
    const listed = [...new Set([...failed, ...notes])];
    if (sizes.length) setMessage({ tone: "ok", text: `${keys.size} kolom ditemukan untuk ukuran ${sizeList(sizes)}. Periksa di bawah, lalu simpan.`, notes: listed });
    else if (failed.length) setMessage({ tone: "error", text: failed[0], notes: listed.filter(note => note !== failed[0]) });
    else setMessage(null);
  }

  /** One file read, imported (marked by hand when it has no layer names) and uploaded; null when skipped. */
  async function readOne(file: File, known: PosterField[], done: PosterFormat[]): Promise<{ imported: Imported; result: FigmaResult } | null> {
    if (!/\.svg$/i.test(file.name) && file.type !== "image/svg+xml") throw new Error("Pilih berkas .svg hasil ekspor Figma.");
    if (file.size > 15_000_000) throw new Error("SVG lebih dari 15 MB. Kecilkan foto di dalam desain, lalu ekspor ulang.");
    const source = sanitizeSvg(await readText(file));
    try {
      const imported = importInBrowser(source);
      return { imported, result: await upload(imported) };
    } catch (error) {
      // No isi_/foto_ layers: let the admin mark the parts on the design.
      if (!(error instanceof NoLayersError)) throw error;
    }
    if (done.length) setMessage({ tone: "ok", text: `${sizeList(done)} sudah terbaca. Tandai bagian di ${file.name}.`, notes: [] });
    // A marked design that fails to import keeps the marker open, so the admin can try again.
    for (;;) {
      const marks = await ask(source, known);
      if (!marks) { setMarking(null); return null; }
      try {
        const imported = importInBrowser(nameMarks(source, marks));
        const result = await upload(imported);
        setMarking(null);
        return { imported, result };
      } catch (error) {
        setMessage({ tone: "error", text: describe(error), notes: [] });
      }
    }
  }

  async function upload(imported: Imported): Promise<FigmaResult> {
    const png = await backgroundPng(imported.background, imported.format);
    const background = await uploadPhoto(new File([png], `latar-${imported.format}.png`, { type: "image/png" }));
    // The overlay keeps its transparency: uploaded as PNG, drawn over the guest's photos.
    const image = async (svg: string | null, name: string): Promise<PlainImage> => {
      if (!svg) return { url: "", alt: "", srcset: [] };
      const uploaded = await uploadPhoto(new File([await backgroundPng(svg, imported.format)], `${name}-${imported.format}.png`, { type: "image/png" }));
      return { ...uploaded, alt: "" };
    };
    const overlay = await image(imported.overlay, "atas");
    // Each box's own pictures: transparent PNGs the size of the card, like the overlay; a stacked item's heading is its label.
    const parts: PosterPart[] = [];
    for (const part of imported.parts) parts.push({ key: part.key, art: await image(part.art, "petunjuk"), slot: await image(part.slot, "slot"), label: await image(part.label, "label") });
    return { format: imported.format, background: { ...background, alt: "" }, overlay, parts, fields: imported.fields, notes: imported.notes };
  }

  return <div className={s.figma}>
    <label className={`button button--primary ${s.figmaButton}`} aria-disabled={pending || undefined}>
      <FileUp size={18} aria-hidden="true" /> {pending && !marking ? "Membaca desain…" : "Unggah desain dari Figma (SVG)"}
      <input ref={input} type="file" accept=".svg,image/svg+xml" multiple className="sr-only" disabled={pending} onChange={event => void readAll([...(event.target.files ?? [])])} />
    </label>
    <ol className={s.figmaSteps}>
      <li>Ukuran frame sama dengan ukuran kartu, misalnya 1080×1350 (Post) atau 1080×1920 (Story).</li>
      <li>Pilih frame → Export → SVG, centang <strong>Outline text</strong>, lalu unggah di sini. Boleh pilih beberapa SVG sekaligus, satu untuk tiap ukuran (misalnya Post dan A4); kolom bernama sama menjadi satu form.</li>
      <li>Setelah diunggah, ketuk bagian yang boleh diganti peserta. Lebih cepat lagi: di Figma beri nama layernya <code>isi_judul</code>, <code>isi_nama</code>, <code>foto_utama</code>, dan seterusnya, lalu centang <strong>Include “id” attribute</strong> saat ekspor; kolomnya langsung terbaca.</li>
    </ol>
    {marking && <FigmaMarker key={marking.id} source={marking.source} existing={marking.existing} onDone={marks => reply(marks)} onCancel={() => reply(null)} />}
    {message && <div role={message.tone === "error" ? "alert" : "status"} className={s.figmaResult} data-tone={message.tone}>
      <p>{message.text}</p>
      {message.notes.length > 0 && <ul>{message.notes.map(note => <li key={note}>{note}</li>)}</ul>}
    </div>}
  </div>;
}
