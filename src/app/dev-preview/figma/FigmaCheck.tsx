"use client";

import { useEffect, useRef, useState } from "react";
import { PosterCanvas } from "@/components/poster/PosterCanvas";
import { designImage, importInBrowser, mergeImport, nameMarks, NoLayersError, sanitizeSvg } from "@/components/admin/editor/blocks/figma-import";
import { FigmaMarker } from "@/components/admin/editor/blocks/FigmaMarker";
import { emptyPoster, posterFormatSetups, posterFormats, posterSizes, type PosterFormat, type PosterSettings } from "@/lib/poster";

/** Local files only: ?berkas= from public/dev/, or ?url= (and ?url2= for a second size) from a server on this machine. */
const local = (url: string | null) => url && /^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(url) ? url : null;

/**
 * Runs the real import on sample SVGs: boxes measured by the browser, background drawn to PNG
 * (kept local). A second file (?url2=) is read as another size of the same card, as the admin
 * would upload it, and merged into the same fields.
 */
export function FigmaCheck() {
  const [poster, setPoster] = useState<PosterSettings | null>(null);
  const [format, setFormat] = useState<PosterFormat>("post");
  const [report, setReport] = useState("");
  const [marking, setMarking] = useState<string | null>(null);
  const [second, setSecond] = useState(() => typeof location === "undefined" ? null : local(new URLSearchParams(location.search).get("url2")));
  const current = useRef<PosterSettings | null>(null);
  const run = async (source: string) => {
    try {
      const result = importInBrowser(source);
      const image = async (svg: string | null) => ({ url: svg ? URL.createObjectURL(await designImage(svg, result.format)) : "", alt: "", srcset: [] });
      const background = await image(result.background), overlay = await image(result.overlay);
      const parts = await Promise.all(result.parts.map(async part => ({ key: part.key, art: await image(part.art), slot: await image(part.slot), label: await image(part.label) })));
      const before = current.current;
      const next: PosterSettings = {
        ...(before ?? { ...emptyPoster(), enabled: true, formats: posterFormatSetups([]) }),
        fields: mergeImport(before?.fields ?? [], !!before, result),
      };
      next.formats = { ...next.formats, [result.format]: { enabled: true, background, overlay, parts } };
      current.current = next;
      setPoster(next); setFormat(result.format);
      setReport(JSON.stringify({ formats: posterFormats.filter(item => next.formats[item].enabled), parts: result.parts.map(part => `${part.key}:${part.art ? "petunjuk" : ""}${part.slot ? "+slot" : ""}${part.label ? "+label" : ""}`), notes: result.notes, fields: next.fields.map(field => ({ key: field.key, kind: field.kind, list: !!field.list, optional: !!field.optional, lines: field.maxLines, size: field.sizeMax, stack: field.stack, labelBox: field.labelBox, boxes: posterFormats.filter(item => field.box[item]).map(item => `${item}:${JSON.stringify(field.box[item])}`) })) }, null, 1));
    } catch (error) {
      if (error instanceof NoLayersError) setMarking(source);
      else setReport(`GAGAL: ${(error as Error).message}`);
    }
  };
  const read = (url: string) => fetch(url).then(response => response.text()).then(text => run(sanitizeSvg(text)));
  const first = useRef(read);
  useEffect(() => {
    const params = new URLSearchParams(location.search), picked = params.get("berkas") ?? "contoh-figma.svg";
    void first.current(local(params.get("url")) ?? `/dev/${encodeURIComponent(picked.replace(/[^\w.-]/g, ""))}`);
  }, []);
  if (marking) return <FigmaMarker source={marking} existing={poster?.fields ?? []} onDone={marks => { setMarking(null); void run(nameMarks(marking, marks)); }} onCancel={() => setMarking(null)} />;
  const formats = poster ? posterFormats.filter(item => poster.formats[item].enabled) : [];
  return <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 420px", gap: 24 }}>
    <pre id="figma-report" style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{report || "Membaca…"}</pre>
    <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
      {second && poster && <button type="button" className="button button--primary" onClick={() => { const url = second; setSecond(null); void read(url); }}>Unggah desain kedua</button>}
      {formats.length > 1 && <div role="group" aria-label="Ukuran" style={{ display: "flex", gap: 8 }}>{formats.map(item => <button key={item} type="button" className="button button--secondary" aria-pressed={format === item} onClick={() => setFormat(item)}>{posterSizes[item].label}</button>)}</div>}
      {poster && <PosterCanvas poster={poster} values={{ text: {}, photos: {} }} format={format} editing={false} hints selected={null} onSelect={() => {}} onFrame={() => {}} fontsVersion={1} />}
    </div>
  </div>;
}
