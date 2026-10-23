"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { uploadPhoto } from "@/components/admin/shared/PhotoField";
import { errorMessage } from "@/components/admin/shared/api";
import { posterSizes, type PosterFormat, type PosterField } from "@/lib/poster";
import type { PlainImage } from "@/lib/types";
import { backgroundPng, importInBrowser } from "./figma-import";
import s from "./card-figma.module.css";

/** The file as text; FileReader works in every browser (File.text() is newer). */
const readText = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result ?? ""));
  reader.onerror = () => reject(new Error("Berkas tidak terbaca. Coba pilih lagi."));
  reader.readAsText(file);
});

export type FigmaResult = { format: PosterFormat; background: PlainImage; overlay: PlainImage; fields: PosterField[]; notes: string[] };

/**
 * One button: a frame exported from Figma as SVG becomes the card. The layers named isi_… and
 * foto_… become the guests' fields; the rest is drawn to an image and uploaded as the background.
 */
export function FigmaImport({ onImport }: { onImport: (result: FigmaResult) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; notes: string[] } | null>(null);

  async function read(file: File) {
    setPending(true); setMessage(null);
    try {
      if (!/\.svg$/i.test(file.name) && file.type !== "image/svg+xml") throw new Error("Pilih berkas .svg hasil ekspor Figma.");
      if (file.size > 15_000_000) throw new Error("SVG lebih dari 15 MB. Kecilkan foto di dalam desain, lalu ekspor ulang.");
      const imported = importInBrowser(await readText(file));
      const png = await backgroundPng(imported.background, imported.format);
      const background = await uploadPhoto(new File([png], `latar-${imported.format}.png`, { type: "image/png" }));
      // The overlay keeps its transparency: uploaded as PNG, drawn over the guest's photos.
      const overlay = imported.overlay ? await uploadPhoto(new File([await backgroundPng(imported.overlay, imported.format)], `atas-${imported.format}.png`, { type: "image/png" })) : { url: "", srcset: [] };
      onImport({ format: imported.format, background: { ...background, alt: "" }, overlay: { ...overlay, alt: "" }, fields: imported.fields, notes: imported.notes });
      setMessage({ tone: "ok", text: `${imported.fields.length} kolom ditemukan untuk ukuran ${posterSizes[imported.format].label}. Periksa di bawah, lalu simpan.`, notes: imported.notes });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error && !("status" in error) ? error.message : errorMessage(error), notes: [] });
    } finally {
      setPending(false);
      if (input.current) input.current.value = "";
    }
  }

  return <div className={s.figma}>
    <label className={`button button--primary ${s.figmaButton}`} aria-disabled={pending || undefined}>
      <FileUp size={18} aria-hidden="true" /> {pending ? "Membaca desain…" : "Unggah desain dari Figma (SVG)"}
      <input ref={input} type="file" accept=".svg,image/svg+xml" className="sr-only" disabled={pending} onChange={event => { const file = event.target.files?.[0]; if (file) void read(file); }} />
    </label>
    <ol className={s.figmaSteps}>
      <li>Di Figma, beri nama layer yang boleh diganti peserta: <code>isi_judul</code>, <code>isi_nama</code>, <code>foto_utama</code>, dan seterusnya. Agar kolom selebar areanya, kelompokkan teks dengan kotak transparan seukuran area dan beri nama grupnya.</li>
      <li>Ukuran frame sama dengan ukuran kartu, misalnya 1080×1350 (Post) atau 1080×1920 (Story).</li>
      <li>Pilih frame → Export → SVG, centang <strong>Include “id” attribute</strong> dan <strong>Outline text</strong>, lalu unggah di sini. Unggah lagi untuk ukuran lain.</li>
    </ol>
    {message && <div role={message.tone === "error" ? "alert" : "status"} className={s.figmaResult} data-tone={message.tone}>
      <p>{message.text}</p>
      {message.notes.length > 0 && <ul>{message.notes.map(note => <li key={note}>{note}</li>)}</ul>}
    </div>}
  </div>;
}
