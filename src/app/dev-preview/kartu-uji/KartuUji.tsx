"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { PosterStudio } from "@/components/poster/PosterStudio";
import { canvasBlob, renderPoster } from "@/components/poster/export";
import { loadDraft } from "@/components/poster/draft";
import { designImage, importInBrowser, mergeImport, nameMarks, NoLayersError, sanitizeSvg, type Mark } from "@/components/admin/editor/blocks/figma-import";
import { FigmaMarker } from "@/components/admin/editor/blocks/FigmaMarker";
import { emptyPoster, posterFormatSetups, posterFormats, posterSizes, type PosterFormat, type PosterSettings } from "@/lib/poster";

/** ?url= and ?url2= may name SVGs on a server on this machine, read in that order (development only). */
const local = (url: string | null) => url && /^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(url) ? url : null;

/**
 * The admin's steps and the guest's page on one screen, kept in this browser: an SVG per size is
 * imported (or marked, when it has no layer names), each further size joins the same fields, and
 * the card below is the real page a guest fills and downloads. Nothing is uploaded or saved.
 */
export function KartuUji() {
  const [poster, setPoster] = useState<PosterSettings | null>(null);
  const [marking, setMarking] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [queued, setQueued] = useState<string[]>([]);
  const [rendered, setRendered] = useState<{ format: PosterFormat; url: string }[]>([]);
  const current = useRef<PosterSettings | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const answer = useRef<((marks: Mark[] | null) => void) | null>(null);
  /** Opens the marker and waits: the marks, or null on Batal. */
  const ask = (source: string) => new Promise<Mark[] | null>(resolve => { answer.current = resolve; setMarking(source); });
  const reply = (marks: Mark[] | null) => { const resolve = answer.current; answer.current = null; setMarking(null); resolve?.(marks); };

  /** One SVG into the card; resolves once it is in (after marking, when it has no layer names). Its lines for the notes, or its error. */
  async function run(source: string): Promise<{ notes: string[]; error: string }> {
    try {
      let result: ReturnType<typeof importInBrowser>;
      try {
        result = importInBrowser(source);
      } catch (problem) {
        if (!(problem instanceof NoLayersError)) throw problem;
        const marks = await ask(source);
        if (!marks) return { notes: [], error: "" };
        result = importInBrowser(nameMarks(source, marks));
      }
      const image = async (svg: string | null) => ({ url: svg ? URL.createObjectURL(await designImage(svg, result.format)) : "", alt: "", srcset: [] });
      const parts = await Promise.all(result.parts.map(async part => ({ key: part.key, art: await image(part.art), slot: await image(part.slot), label: await image(part.label) })));
      const before = current.current;
      const next: PosterSettings = { ...(before ?? { ...emptyPoster(), enabled: true, formats: posterFormatSetups([]) }), fields: mergeImport(before?.fields ?? [], !!before, result) };
      next.formats = { ...next.formats, [result.format]: { enabled: true, background: await image(result.background), overlay: await image(result.overlay), parts } };
      current.current = next;
      setPoster(next);
      return { notes: [`${posterSizes[result.format].label}: ${result.fields.length} kolom.`, ...result.notes], error: "" };
    } catch (problem) {
      return { notes: [], error: (problem as Error).message };
    }
  }
  /** Files read one after another in the order chosen, each joining the fields of the ones before. */
  async function runAll(sources: (() => Promise<string>)[], names: string[]) {
    setError(""); setNotes([]);
    const notes: string[] = [], errors: string[] = [];
    for (const [index, source] of sources.entries()) {
      const done = await source().then(text => run(sanitizeSvg(text)), (problem: Error) => ({ notes: [], error: problem.message }));
      notes.push(...done.notes);
      if (done.error) errors.push(sources.length > 1 ? `${names[index]}: ${done.error}` : done.error);
    }
    setNotes(notes); setError(errors.join(" "));
  }
  // The download as the guest's button draws it (export.ts), from the draft the page keeps, shown here instead of saved.
  async function renderAll() {
    if (!poster) return;
    const draft = await loadDraft("uji-kartu");
    const values = { text: draft?.text ?? {}, photos: Object.fromEntries(Object.entries(draft?.photos ?? {}).map(([key, photo]) => [key, { url: URL.createObjectURL(photo.blob), frame: photo.frame }])), palette: draft?.palette };
    const sizes = posterFormats.filter(format => poster.formats[format].enabled);
    setRendered(await Promise.all(sizes.map(async format => ({ format, url: URL.createObjectURL(await canvasBlob(await renderPoster(poster, values, format))) }))));
  }
  const pick = (files: File[]) => runAll(files.map(file => () => file.text()), files.map(file => file.name));
  const fetchSvg = (url: string) => runAll([() => fetch(url).then(response => response.text())], [url]);
  const start = useRef(fetchSvg);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urls = [local(params.get("url")), local(params.get("url2"))].filter((url): url is string => !!url);
    if (!urls.length) return;
    void start.current(urls[0]).then(() => setQueued(urls.slice(1)));
  }, []);

  if (marking) return <FigmaMarker key={marking} source={marking} existing={poster?.fields ?? []} onDone={marks => reply(marks)} onCancel={() => reply(null)} />;
  const sizes = poster ? posterFormats.filter(format => poster.formats[format].enabled) : [];
  return <div style={{ display: "grid", gap: 24 }}>
    <section style={{ display: "grid", gap: 12, padding: 16, border: "1px solid #c9d3e3", borderRadius: 14, background: "#f7f9fd" }}>
      <h2 style={{ margin: 0 }}>1 · Admin: desain dari Figma</h2>
      <p style={{ margin: 0 }}>Pilih SVG ukuran pertama (misalnya Post 1080×1350), atau beberapa SVG sekaligus (misalnya Post dan A4): dibaca berurutan, dan kolom bernama sama menjadi satu form peserta.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <label className="button button--primary" style={{ cursor: "pointer" }}>
          <FileUp size={18} aria-hidden="true" /> {sizes.length ? "Tambah ukuran lain (SVG)" : "Pilih SVG desain"}
          <input ref={input} type="file" accept=".svg,image/svg+xml" multiple className="sr-only" onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ""; if (files.length) void pick(files); }} />
        </label>
        {queued.length > 0 && poster && <button type="button" className="button button--secondary" onClick={() => { const [url, ...rest] = queued; setQueued(rest); void fetchSvg(url); }}>Unggah desain berikutnya</button>}
        {sizes.length > 0 && <span>Ukuran siap: <strong>{sizes.map(format => posterSizes[format].label).join(" · ")}</strong></span>}
      </div>
      {error && <p role="alert" style={{ margin: 0, color: "#9a273d" }}>{error}</p>}
      {notes.length > 0 && <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>{notes.map(note => <li key={note}>{note}</li>)}</ul>}
    </section>
    {poster && <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>2 · Peserta: isi form, pilih ukuran, unduh</h2>
      <PosterStudio key={sizes.join("-")} eventId="uji-kartu" eventTitle="Uji kartu" poster={poster} />
    </section>}
    {poster && <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>3 · Hasil unduhan</h2>
      <p style={{ margin: 0 }}>Gambar yang sama dengan tombol Unduh, untuk setiap ukuran. Isian diambil dari form di atas.</p>
      <button type="button" className="button button--secondary" style={{ justifySelf: "start" }} onClick={() => void renderAll()}>Lihat hasil unduhan</button>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "start" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL */}
        {rendered.map(item => <figure key={item.format} style={{ margin: 0, display: "grid", gap: 4 }}><img id={`hasil-${item.format}`} src={item.url} alt={`Hasil unduhan ${posterSizes[item.format].label}`} style={{ width: 360, height: "auto", border: "1px solid #ddd" }} /><figcaption>{posterSizes[item.format].label}</figcaption></figure>)}
      </div>
    </section>}
  </div>;
}
