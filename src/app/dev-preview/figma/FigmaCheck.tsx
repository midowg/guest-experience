"use client";

import { useEffect, useState } from "react";
import { PosterCanvas } from "@/components/poster/PosterCanvas";
import { backgroundPng, importInBrowser, nameMarks, NoLayersError, sanitizeSvg } from "@/components/admin/editor/blocks/figma-import";
import { FigmaMarker } from "@/components/admin/editor/blocks/FigmaMarker";
import { emptyPoster, posterFormatSetups, type PosterSettings } from "@/lib/poster";

/** Runs the real import on a sample SVG (?berkas= from public/dev/): boxes measured by the browser, background drawn to PNG (kept local). */
export function FigmaCheck() {
  const [poster, setPoster] = useState<PosterSettings | null>(null);
  const [report, setReport] = useState("");
  const [marking, setMarking] = useState<string | null>(null);
  const run = async (source: string) => {
    try {
      const result = importInBrowser(source);
      const png = await backgroundPng(result.background, result.format);
      const url = URL.createObjectURL(png);
      const overlay = result.overlay ? URL.createObjectURL(await backgroundPng(result.overlay, result.format)) : "";
      const image = async (svg: string | null) => ({ url: svg ? URL.createObjectURL(await backgroundPng(svg, result.format)) : "", alt: "", srcset: [] });
      const parts = await Promise.all(result.parts.map(async part => ({ key: part.key, art: await image(part.art), slot: await image(part.slot) })));
      setPoster({ ...emptyPoster(), enabled: true, formats: { ...posterFormatSetups([]), [result.format]: { enabled: true, background: { url, alt: "", srcset: [] }, overlay: { url: overlay, alt: "", srcset: [] }, parts } }, fields: result.fields });
      setReport(JSON.stringify({ format: result.format, png: png.size, overlay: !!result.overlay, parts: result.parts.map(part => `${part.key}:${part.art ? "petunjuk" : ""}${part.slot ? "+slot" : ""}`), notes: result.notes, fields: result.fields.map(field => ({ key: field.key, kind: field.kind, box: field.box[result.format], font: field.font, size: field.sizeMax, lines: field.maxLines, optional: !!field.optional, max: field.maxLength, align: field.align, color: field.color })) }, null, 1));
    } catch (error) {
      if (error instanceof NoLayersError) setMarking(source);
      else setReport(`GAGAL: ${(error as Error).message}`);
    }
  };
  useEffect(() => {
    // ?berkas=nama.svg picks another file from public/dev/ (development only).
    // ?url= reads a file from a server on this machine instead (development only).
    const params = new URLSearchParams(location.search), picked = params.get("berkas") ?? "contoh-figma.svg", local = params.get("url");
    void fetch(local && /^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(local) ? local : `/dev/${encodeURIComponent(picked.replace(/[^\w.-]/g, ""))}`).then(response => response.text()).then(text => run(sanitizeSvg(text)));
  }, []);
  if (marking) return <FigmaMarker source={marking} onDone={marks => { setMarking(null); void run(nameMarks(marking, marks)); }} onCancel={() => setMarking(null)} />;
  return <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 420px", gap: 24 }}>
    <pre id="figma-report" style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{report || "Membaca…"}</pre>
    <div>{poster && <PosterCanvas poster={poster} values={{ text: {}, photos: {} }} format="post" editing={false} hints selected={null} onSelect={() => {}} onFrame={() => {}} fontsVersion={1} />}</div>
  </div>;
}
