"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Image as ImageIcon, Trash2, Type, Wand2 } from "lucide-react";
import { Button } from "@/components/ui";
import { guessLines, SHAPES, type Mark } from "./figma-import";
import s from "./figma-marker.module.css";

type Box = { left: number; top: number; width: number; height: number };

/**
 * A run of text: live <text>, or an outlined line of glyphs, which Figma writes as one path of
 * several letters (moves) and is wider than tall. Icons are about square, so they stay out.
 */
function looksLikeText(element: Element): boolean {
  if (element.closest("defs, clipPath, mask, pattern")) return false;
  const tag = element.tagName.toLowerCase();
  if (tag === "text") return true;
  if (tag !== "path") return false;
  const moves = (element.getAttribute("d") ?? "").match(/[Mm]/g)?.length ?? 0;
  const rect = element.getBoundingClientRect();
  return moves >= 3 && rect.height > 0 && rect.width / rect.height >= 1.8;
}

/** Whether one shape lies within another on screen. */
function inside(element: Element | undefined, box: Element): boolean {
  if (!element) return false;
  const a = element.getBoundingClientRect(), b = box.getBoundingClientRect();
  return a.left >= b.left - 1 && a.top >= b.top - 1 && a.right <= b.right + 1 && a.bottom <= b.bottom + 1;
}

/** Where an element sits over the design, in the holder's own pixels. */
const boxIn = (holder: HTMLElement, element: Element): Box => {
  const frame = holder.getBoundingClientRect(), rect = element.getBoundingClientRect();
  return { left: rect.left - frame.left, top: rect.top - frame.top, width: rect.width, height: rect.height };
};

/**
 * For an SVG whose layers have no isi_/foto_ names: the design is shown and the admin taps the
 * parts guests may change. Each tap marks one shape (one Figma text layer, outlined, is one
 * shape) as a text or a photo box; everything not tapped stays background. `source` must be
 * sanitised (sanitizeSvg) before it reaches here, since it is put into the page.
 */
export function FigmaMarker({ source, onDone, onCancel }: { source: string; onDone: (marks: Mark[]) => void; onCancel: () => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const drawing = useRef<HTMLDivElement>(null);
  const elements = useRef<Element[]>([]);
  const [kind, setKind] = useState<Mark["kind"]>("text");
  const [marks, setMarks] = useState<Mark[]>([]);
  const [hover, setHover] = useState<Box | null>(null);
  const [boxes, setBoxes] = useState<Record<number, Box>>({});
  // Marks on a live <text>: its face, size and lines are read from the SVG, nothing to ask.
  const [live, setLive] = useState<ReadonlySet<number>>(new Set());

  // The design parsed as XML, as nameMarks parses it, so its elements line up one to one with
  // the indexes a tap records.
  useLayoutEffect(() => {
    const node = drawing.current;
    if (!node) return;
    const svg = document.importNode(new DOMParser().parseFromString(source, "image/svg+xml").documentElement, true);
    node.replaceChildren(svg);
    elements.current = [...svg.querySelectorAll("*")];
    return () => node.replaceChildren();
  }, [source]);
  // Marked shapes outlined over the design, measured again whenever it changes size.
  useEffect(() => {
    const node = holder.current;
    if (!node) return;
    const measure = () => setBoxes(Object.fromEntries(marks.flatMap(mark => elements.current[mark.index] ? [[mark.index, boxIn(node, elements.current[mark.index])]] : [])));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [marks]);

  // The smallest shape whose box holds the point, not only the one painted there: outlined text
  // is thin strokes, and a tap between them would otherwise land on the plate behind it.
  const shapeAt = (x: number, y: number) => {
    let best: Element | null = null, least = Infinity;
    for (const shape of drawing.current?.querySelectorAll(SHAPES) ?? []) {
      if (shape.closest("defs, clipPath, mask, pattern")) continue;
      const rect = shape.getBoundingClientRect();
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
      if (rect.width * rect.height < least) { best = shape; least = rect.width * rect.height; }
    }
    return best;
  };
  function tap(x: number, y: number) {
    const shape = shapeAt(x, y);
    if (!shape) return;
    const index = elements.current.indexOf(shape);
    if (index < 0) return;
    if (shape.tagName.toLowerCase() === "text") setLive(current => new Set(current).add(index));
    setMarks(current => current.some(mark => mark.index === index)
      ? current.filter(mark => mark.index !== index)
      // Writing on a photo box ("Foto fasilitator") is its hint, not a field of its own.
      : [...current.filter(mark => kind !== "photo" || mark.kind !== "text" || !inside(elements.current[mark.index], shape)),
        { index, kind, label: `${kind === "photo" ? "Foto" : "Teks"} ${current.filter(mark => mark.kind === kind).length + 1}`, lines: kind === "text" ? guessLines(shape) : 1, font: "sans" }]);
  }
  const change = (index: number, next: Partial<Mark>) => setMarks(current => current.map(mark => mark.index === index ? { ...mark, ...next } : mark));

  // Every piece of text in one go, so the admin only takes back the fixed ones (sponsor lines, the footer).
  function markAllText() {
    const photos = marks.filter(mark => mark.kind === "photo").map(mark => elements.current[mark.index]);
    const found = elements.current.flatMap((element, index) => looksLikeText(element) && !photos.some(photo => inside(element, photo)) ? [index] : []);
    if (found.some(index => elements.current[index].tagName.toLowerCase() === "text")) setLive(current => new Set([...current, ...found.filter(index => elements.current[index].tagName.toLowerCase() === "text")]));
    setMarks(current => {
      let n = current.filter(mark => mark.kind === "text").length;
      const added = found.filter(index => !current.some(mark => mark.index === index)).map(index => ({ index, kind: "text" as const, label: `Teks ${++n}`, lines: guessLines(elements.current[index]), font: "sans" as const }));
      return [...current, ...added];
    });
  }

  return <div className={s.marker}>
    <p className={s.intro}><strong>SVG ini belum punya nama layer.</strong> Ketuk bagian desain yang boleh diganti peserta: judul, nama, tanggal, foto, dan lainnya. Bagian yang tidak diketuk tetap menjadi latar. Ketuk lagi untuk membatalkan.</p>
    <div className={s.mode} role="group" aria-label="Yang ditandai saat diketuk">
      <button type="button" aria-pressed={kind === "text"} onClick={() => setKind("text")}><Type size={16} aria-hidden="true" /> Teks</button>
      <button type="button" aria-pressed={kind === "photo"} onClick={() => setKind("photo")}><ImageIcon size={16} aria-hidden="true" /> Foto</button>
    </div>
    <Button type="button" variant="secondary" className={s.auto} onClick={markAllText}><Wand2 size={16} aria-hidden="true" /> Tandai semua teks otomatis</Button>
    <div className={s.work}>
      <div ref={holder} className={s.design} data-kind={kind} onClick={event => tap(event.clientX, event.clientY)}
        onPointerMove={event => { const shape = shapeAt(event.clientX, event.clientY); setHover(shape && holder.current ? boxIn(holder.current, shape) : null); }} onPointerLeave={() => setHover(null)}>
        <div ref={drawing} className={s.svg} />
        {hover && <span className={s.hover} style={hover} aria-hidden="true" />}
        {marks.map(mark => boxes[mark.index] && <span key={mark.index} className={s.mark} data-kind={mark.kind} style={boxes[mark.index]} aria-hidden="true"><i>{mark.label}</i></span>)}
      </div>
      <div className={s.side}>
        {marks.length === 0 && <p className={s.empty}>Belum ada bagian yang ditandai.</p>}
        <ul className={s.list} aria-label="Bagian yang ditandai">
          {marks.map(mark => <li key={mark.index} data-kind={mark.kind}>
            <span className={s.badge} aria-hidden="true">{mark.kind === "photo" ? <ImageIcon size={14} /> : <Type size={14} />}</span>
            <input className="input" value={mark.label} maxLength={60} onChange={event => change(mark.index, { label: event.target.value })} aria-label="Nama kolom" />
            {mark.kind === "text" && live.has(mark.index) && <span className={s.live}>gaya dari Figma</span>}
            {mark.kind === "text" && !live.has(mark.index) && <>
              <select className="select" value={mark.lines} onChange={event => change(mark.index, { lines: Number(event.target.value) })} aria-label={`Jumlah baris ${mark.label}`}>
                {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} baris</option>)}
              </select>
              <select className="select" value={mark.font} onChange={event => change(mark.index, { font: event.target.value as Mark["font"] })} aria-label={`Gaya huruf ${mark.label}`}>
                <option value="sans">Sans</option><option value="serif">Serif</option>
              </select>
            </>}
            <label className={s.optional}><input type="checkbox" checked={!!mark.optional} onChange={event => change(mark.index, { optional: event.target.checked })} /> Opsional</label>
            <button type="button" className={s.remove} onClick={() => setMarks(current => current.filter(item => item.index !== mark.index))} aria-label={`Hapus tanda ${mark.label}`}><Trash2 size={16} aria-hidden="true" /></button>
          </li>)}
        </ul>
        <div className={s.actions}>
          <Button type="button" disabled={marks.length === 0} onClick={() => onDone(marks)}>Selesai, buat {marks.length || ""} kolom</Button>
          <Button type="button" variant="quiet" onClick={onCancel}>Batal</Button>
        </div>
        <p className="field-hint">Jumlah baris dan gaya huruf membantu menebak ukuran teks yang sudah di-outline. <strong>Opsional</strong>: boleh dikosongkan peserta, dan bila kosong kotaknya tidak ikut di hasil unduhan. Ukuran, font, dan posisi tetap bisa dirapikan di “Lanjutan”.</p>
      </div>
    </div>
  </div>;
}
