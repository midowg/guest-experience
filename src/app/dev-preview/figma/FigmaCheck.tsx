"use client";

import { useEffect, useState } from "react";
import { PosterCanvas } from "@/components/poster/PosterCanvas";
import { backgroundPng, importInBrowser } from "@/components/admin/editor/blocks/figma-import";
import { emptyPoster, posterFormatSetups, type PosterSettings } from "@/lib/poster";

/** Runs the real import on a sample SVG (?berkas= from public/dev/): boxes measured by the browser, background drawn to PNG (kept local). */
export function FigmaCheck() {
  const [poster, setPoster] = useState<PosterSettings | null>(null);
  const [report, setReport] = useState("");
  useEffect(() => {
    (async () => {
      try {
        // ?berkas=nama.svg picks another file from public/dev/ (development only).
        const picked = new URLSearchParams(location.search).get("berkas") ?? "contoh-figma.svg";
        const result = importInBrowser(await (await fetch(`/dev/${encodeURIComponent(picked.replace(/[^\w.-]/g, ""))}`)).text());
        const png = await backgroundPng(result.background, result.format);
        const url = URL.createObjectURL(png);
        const overlay = result.overlay ? URL.createObjectURL(await backgroundPng(result.overlay, result.format)) : "";
        setPoster({ ...emptyPoster(), enabled: true, formats: { ...posterFormatSetups([]), [result.format]: { enabled: true, background: { url, alt: "", srcset: [] }, overlay: { url: overlay, alt: "", srcset: [] } } }, fields: result.fields });
        setReport(JSON.stringify({ format: result.format, png: png.size, overlay: !!result.overlay, notes: result.notes, fields: result.fields.map(field => ({ key: field.key, kind: field.kind, box: field.box[result.format], font: field.font, size: field.sizeMax, lines: field.maxLines, align: field.align, color: field.color })) }, null, 1));
      } catch (error) { setReport(`GAGAL: ${(error as Error).message}`); }
    })();
  }, []);
  return <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 420px", gap: 24 }}>
    <pre id="figma-report" style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{report || "Membaca…"}</pre>
    <div>{poster && <PosterCanvas poster={poster} values={{ text: {}, photos: {} }} format="post" editing={false} hints selected={null} onSelect={() => {}} onFrame={() => {}} fontsVersion={1} />}</div>
  </div>;
}
