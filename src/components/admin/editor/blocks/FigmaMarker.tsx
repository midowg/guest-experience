"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Image as ImageIcon, List, ListPlus, Rows3, Trash2, Type, Wand2 } from "lucide-react";
import { Button } from "@/components/ui";
import type { PosterField } from "@/lib/poster";
import { guessLines, measureInDocument, SHAPES, type Area, type Mark } from "./figma-import";
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
/** The smallest box holding all of these. */
const union = (all: Box[]): Box => {
  const left = Math.min(...all.map(box => box.left)), top = Math.min(...all.map(box => box.top));
  return { left, top, width: Math.max(...all.map(box => box.left + box.width)) - left, height: Math.max(...all.map(box => box.top + box.height)) - top };
};

/** How a mark is shown: its own colour for a list and for a stacked item. */
const kindOf = (mark: Mark) => mark.list ? "list" : mark.stack ? "info" : mark.kind;
/** Every shape a mark stands on: one, or a list's lines and icons. */
const shapesOf = (mark: Mark) => [mark.index, ...(mark.extra ?? [])];

/**
 * A shape's box in the root SVG's own units. The browser measures it through its transforms
 * (getBBox); without that (jsdom), its place on screen is mapped back through the viewBox.
 */
function areaIn(svg: SVGSVGElement, element: Element): Area {
  const measured = measureInDocument(element, svg);
  if (measured) return measured;
  const frame = svg.getBoundingClientRect(), rect = element.getBoundingClientRect();
  const view = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  const [vx, vy, vw, vh] = view.length === 4 && view[2] > 0 && view[3] > 0 ? view
    : [0, 0, Number.parseFloat(svg.getAttribute("width") ?? "") || frame.width, Number.parseFloat(svg.getAttribute("height") ?? "") || frame.height];
  const sx = frame.width > 0 ? vw / frame.width : 1, sy = frame.height > 0 ? vh / frame.height : 1;
  return { x: vx + (rect.left - frame.left) * sx, y: vy + (rect.top - frame.top) * sy, w: rect.width * sx, h: rect.height * sy };
}
const tenth = (n: number) => Math.round(n * 10) / 10;
/** A list's area: its shapes' boxes joined, in the root SVG's units. */
function areaOf(svg: SVGSVGElement, elements: Element[]): Area {
  const all = elements.map(element => areaIn(svg, element));
  const x = Math.min(...all.map(box => box.x)), y = Math.min(...all.map(box => box.y));
  return { x: tenth(x), y: tenth(y), w: tenth(Math.max(...all.map(box => box.x + box.w)) - x), h: tenth(Math.max(...all.map(box => box.y + box.h)) - y) };
}

/**
 * For an SVG whose layers have no isi_/foto_ names: the design is shown and the admin taps the
 * parts guests may change. Each tap marks one shape (one Figma text layer, outlined, is one
 * shape) as a text or a photo box; in "Poin" taps gather shapes into one list of points; in
 * "Info" each tap is one item of a stack (a side panel of small headings, each over its value):
 * the import finds the headings, and an empty item leaves with its heading.
 * Everything not tapped stays background. `existing`: the fields of the design's other sizes,
 * whose names a mark can take to fill the same field. `source` must be sanitised
 * (sanitizeSvg) before it reaches here, since it is put into the page.
 */
export function FigmaMarker({ source, existing = [], onDone, onCancel }: { source: string; existing?: PosterField[]; onDone: (marks: Mark[]) => void; onCancel: () => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const drawing = useRef<HTMLDivElement>(null);
  const elements = useRef<Element[]>([]);
  const root = useRef<SVGSVGElement | null>(null);
  const names = useId();
  const [kind, setKind] = useState<Mark["kind"] | "list" | "info">("text");
  const [marks, setMarks] = useState<Mark[]>([]);
  // The list a tap in "Poin" adds to, by its mark's index; null starts a new one.
  const [gathering, setGathering] = useState<number | null>(null);
  // The stack a tap in "Info" adds to.
  const [stack, setStack] = useState("info");
  const [hover, setHover] = useState<Box | null>(null);
  const [boxes, setBoxes] = useState<Record<number, { box: Box; pieces: Box[] }>>({});
  // Marks on a live <text>: its face, size and lines are read from the SVG, nothing to ask.
  const [live, setLive] = useState<ReadonlySet<number>>(new Set());

  // The design parsed as XML, as nameMarks parses it, so its elements line up one to one with
  // the indexes a tap records.
  useLayoutEffect(() => {
    const node = drawing.current;
    if (!node) return;
    const svg = document.importNode(new DOMParser().parseFromString(source, "image/svg+xml").documentElement, true);
    node.replaceChildren(svg);
    root.current = svg as unknown as SVGSVGElement;
    elements.current = [...svg.querySelectorAll("*")];
    return () => node.replaceChildren();
  }, [source]);
  // Marked shapes outlined over the design, measured again whenever it changes size. A list is
  // one outline round all its shapes, each also outlined on its own.
  useEffect(() => {
    const node = holder.current;
    if (!node) return;
    const measure = () => setBoxes(Object.fromEntries(marks.flatMap(mark => {
      const pieces = shapesOf(mark).flatMap(index => elements.current[index] ? [boxIn(node, elements.current[index])] : []);
      return pieces.length ? [[mark.index, { box: union(pieces), pieces: mark.list ? pieces : [] }]] : [];
    })));
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

  // A name the other sizes' design already has joins that field: the same key, so mergeImport
  // fills one form for both sizes.
  const joined = (mark: Mark): Mark => {
    const same = existing.find(field => field.kind === mark.kind && field.label.trim().toLowerCase() === mark.label.trim().toLowerCase());
    if (same) return { ...mark, key: same.key };
    const rest = { ...mark };
    delete rest.key;
    return rest;
  };
  // A list's lines: each text-like shape's own, summed; its icons add none.
  const listed = (mark: Mark): Mark => {
    const lines = shapesOf(mark).map(index => elements.current[index]).filter(element => element && looksLikeText(element)).reduce((sum, element) => sum + guessLines(element), 0);
    return { ...mark, lines: Math.min(12, Math.max(1, lines)) };
  };
  /** A list without this shape: gone when it was its last one. */
  const without = (mark: Mark, index: number): Mark | null => {
    const rest = shapesOf(mark).filter(item => item !== index);
    return rest.length ? listed({ ...mark, index: rest[0], extra: rest.slice(1) }) : null;
  };

  // Small shapes just left of a line of text and level with it: the ▸ or • the design draws for each point.
  const bulletsOf = (line: Element) => {
    if (!looksLikeText(line) || guessLines(line) > 1) return [];
    const box = line.getBoundingClientRect();
    return [...drawing.current?.querySelectorAll(SHAPES) ?? []].filter(shape => {
      if (shape === line || looksLikeText(shape) || shape.closest("defs, clipPath, mask, pattern")) return false;
      const icon = shape.getBoundingClientRect(), middle = icon.top + icon.height / 2;
      return icon.width > 0 && icon.height <= box.height * 1.6 && icon.width <= box.height * 2 && middle >= box.top && middle <= box.bottom
        && icon.right <= box.left + 2 && icon.left >= box.left - box.height * 4;
    });
  };
  function tap(x: number, y: number) {
    const shape = shapeAt(x, y);
    if (!shape) return;
    const index = elements.current.indexOf(shape);
    if (index < 0) return;
    const owner = marks.find(mark => shapesOf(mark).includes(index));
    // Tapped again, a shape leaves its list, whichever mode is on.
    if (owner?.list) {
      const left = without(owner, index);
      setMarks(marks.flatMap(mark => mark !== owner ? [mark] : left ? [left] : []));
      if (gathering === owner.index) setGathering(left?.index ?? null);
      return;
    }
    if (kind === "list") {
      // A shape marked on its own moves into the list, with the bullet icon in front of its line.
      const rest = marks.filter(mark => mark !== owner);
      const icons = bulletsOf(shape).map(icon => elements.current.indexOf(icon)).filter(icon => icon >= 0 && !rest.some(mark => shapesOf(mark).includes(icon)));
      const list = rest.find(mark => mark.list && mark.index === gathering);
      if (list) { setMarks(rest.map(mark => mark === list ? listed({ ...mark, extra: [...(mark.extra ?? []), index, ...icons] }) : mark)); return; }
      setMarks([...rest, joined(listed({ index, kind: "text", list: true, extra: icons, label: `Poin ${rest.filter(mark => mark.list).length + 1}`, lines: 1, font: "sans" }))]);
      setGathering(index);
      return;
    }
    if (kind === "info") {
      if (shape.tagName.toLowerCase() === "text") setLive(current => new Set(current).add(index));
      // Stacked items are optional: an empty one is what makes the ones below move up.
      setMarks(current => current.some(mark => mark.index === index) ? current.filter(mark => mark.index !== index)
        : [...current, joined({ index, kind: "text", stack, optional: true, label: `Info ${current.filter(mark => mark.stack).length + 1}`, lines: guessLines(shape), font: "sans" })]);
      return;
    }
    const mode = kind;
    if (shape.tagName.toLowerCase() === "text") setLive(current => new Set(current).add(index));
    setMarks(current => current.some(mark => mark.index === index)
      ? current.filter(mark => mark.index !== index)
      // Writing on a photo box ("Foto fasilitator") is its hint, not a field of its own.
      : [...current.filter(mark => mode !== "photo" || mark.kind !== "text" || mark.list || !inside(elements.current[mark.index], shape)),
        joined({ index, kind: mode, label: `${mode === "photo" ? "Foto" : "Teks"} ${current.filter(mark => mark.kind === mode && !mark.list).length + 1}`, lines: mode === "text" ? guessLines(shape) : 1, font: "sans" })]);
  }
  // The next stack's name: info2, info3, … whichever is not taken yet.
  const newStack = () => {
    let n = 2;
    while (marks.some(mark => mark.stack === `info${n}`) || stack === `info${n}`) n++;
    setStack(`info${n}`);
  };
  const change = (index: number, next: Partial<Mark>) => setMarks(current => current.map(mark => mark.index !== index ? mark : "label" in next ? joined({ ...mark, ...next }) : { ...mark, ...next }));
  // A list's area is measured as it is handed over, on the design as it stands.
  const finish = () => onDone(marks.map(mark => mark.list && root.current ? { ...mark, area: areaOf(root.current, shapesOf(mark).map(index => elements.current[index]).filter(Boolean)) } : mark));

  // Every piece of text in one go, so the admin only takes back the fixed ones (sponsor lines, the footer).
  function markAllText() {
    const photos = marks.filter(mark => mark.kind === "photo").map(mark => elements.current[mark.index]);
    const found = elements.current.flatMap((element, index) => looksLikeText(element) && !photos.some(photo => inside(element, photo)) && !marks.some(mark => mark.list && shapesOf(mark).includes(index)) ? [index] : []);
    if (found.some(index => elements.current[index].tagName.toLowerCase() === "text")) setLive(current => new Set([...current, ...found.filter(index => elements.current[index].tagName.toLowerCase() === "text")]));
    setMarks(current => {
      let n = current.filter(mark => mark.kind === "text" && !mark.list).length;
      const added = found.filter(index => !current.some(mark => mark.index === index)).map(index => joined({ index, kind: "text", label: `Teks ${++n}`, lines: guessLines(elements.current[index]), font: "sans" }));
      return [...current, ...added];
    });
  }

  return <div className={s.marker}>
    <p className={s.intro}><strong>SVG ini belum punya nama layer.</strong> Ketuk bagian desain yang boleh diganti peserta: judul, nama, tanggal, foto, dan lainnya. Bagian yang tidak diketuk tetap menjadi latar. Ketuk lagi untuk membatalkan.</p>
    {existing.length > 0 && <p className={s.note}>Desain ukuran lain sudah ada: pakai nama kolom yang sama supaya isinya ikut. Pilih namanya dari daftar saat mengetik.</p>}
    <div className={s.mode} role="group" aria-label="Yang ditandai saat diketuk">
      <button type="button" aria-pressed={kind === "text"} onClick={() => setKind("text")}><Type size={16} aria-hidden="true" /> Teks</button>
      <button type="button" aria-pressed={kind === "photo"} onClick={() => setKind("photo")}><ImageIcon size={16} aria-hidden="true" /> Foto</button>
      <button type="button" aria-pressed={kind === "list"} onClick={() => setKind("list")}><List size={16} aria-hidden="true" /> Poin</button>
      <button type="button" aria-pressed={kind === "info"} onClick={() => setKind("info")}><Rows3 size={16} aria-hidden="true" /> Info</button>
    </div>
    {kind === "list" && <div className={s.listBar}>
      <p className="field-hint">Ketuk setiap baris poin dan ikonnya: semuanya menjadi satu kolom daftar, satu poin per baris. Ketuk lagi untuk mengeluarkannya.</p>
      <Button type="button" variant="secondary" disabled={gathering === null} onClick={() => setGathering(null)}><ListPlus size={16} aria-hidden="true" /> Daftar poin baru</Button>
    </div>}
    {kind === "info" && <div className={s.listBar}>
      <p className="field-hint">Ketuk isi setiap info (bukan judul kecilnya): semuanya opsional dan bersusun. Bila satu dikosongkan peserta, judul kecil dan garis di atasnya ikut hilang, dan info di bawahnya naik. Grup sekarang: <strong>{stack}</strong>.</p>
      <Button type="button" variant="secondary" disabled={!marks.some(mark => mark.stack === stack)} onClick={newStack}><Rows3 size={16} aria-hidden="true" /> Grup info baru</Button>
    </div>}
    <Button type="button" variant="secondary" className={s.auto} onClick={markAllText}><Wand2 size={16} aria-hidden="true" /> Tandai semua teks otomatis</Button>
    <div className={s.work}>
      <div ref={holder} className={s.design} data-kind={kind} onClick={event => tap(event.clientX, event.clientY)}
        onPointerMove={event => { const shape = shapeAt(event.clientX, event.clientY); setHover(shape && holder.current ? boxIn(holder.current, shape) : null); }} onPointerLeave={() => setHover(null)}>
        <div ref={drawing} className={s.svg} />
        {hover && <span className={s.hover} style={hover} aria-hidden="true" />}
        {marks.map(mark => boxes[mark.index] && <span key={mark.index} className={s.mark} data-kind={kindOf(mark)} style={boxes[mark.index].box} aria-hidden="true"><i>{mark.label}</i></span>)}
        {marks.flatMap(mark => boxes[mark.index]?.pieces.map((piece, n) => <span key={`${mark.index}-${n}`} className={s.piece} style={piece} aria-hidden="true" />) ?? [])}
      </div>
      <div className={s.side}>
        {marks.length === 0 && <p className={s.empty}>Belum ada bagian yang ditandai.</p>}
        <ul className={s.list} aria-label="Bagian yang ditandai">
          {marks.map(mark => <li key={mark.index} data-kind={kindOf(mark)}>
            <span className={s.badge} aria-hidden="true">{mark.list ? <List size={14} /> : mark.stack ? <Rows3 size={14} /> : mark.kind === "photo" ? <ImageIcon size={14} /> : <Type size={14} />}</span>
            <input className="input" value={mark.label} maxLength={60} list={existing.some(field => field.kind === mark.kind) ? `${names}-${mark.kind}` : undefined} onChange={event => change(mark.index, { label: event.target.value })} aria-label="Nama kolom" />
            {mark.key && <span className={s.live}>sama dengan ukuran lain</span>}
            {mark.list && <span className={s.live}>{shapesOf(mark).length} bagian</span>}
            {mark.stack && <span className={s.live}>grup {mark.stack}</span>}
            {mark.kind === "text" && !mark.list && live.has(mark.index) && <span className={s.live}>gaya dari Figma</span>}
            {mark.kind === "text" && (mark.list || !live.has(mark.index)) && <>
              <select className="select" value={mark.lines} onChange={event => change(mark.index, { lines: Number(event.target.value) })} aria-label={`Jumlah baris ${mark.label}`}>
                {Array.from({ length: 12 }, (_, n) => n + 1).map(n => <option key={n} value={n}>{n} baris</option>)}
              </select>
              <select className="select" value={mark.font} onChange={event => change(mark.index, { font: event.target.value as Mark["font"] })} aria-label={`Gaya huruf ${mark.label}`}>
                <option value="sans">Sans</option><option value="serif">Serif</option>
              </select>
            </>}
            <label className={s.optional}><input type="checkbox" checked={!!mark.optional} onChange={event => change(mark.index, { optional: event.target.checked })} /> Opsional</label>
            <button type="button" className={s.remove} onClick={() => setMarks(current => current.filter(item => item.index !== mark.index))} aria-label={`Hapus tanda ${mark.label}`}><Trash2 size={16} aria-hidden="true" /></button>
          </li>)}
        </ul>
        {(["text", "photo"] as const).map(type => existing.some(field => field.kind === type) && <datalist key={type} id={`${names}-${type}`}>
          {existing.filter(field => field.kind === type).map(field => <option key={field.key} value={field.label} />)}
        </datalist>)}
        <div className={s.actions}>
          <Button type="button" disabled={marks.length === 0} onClick={finish}>Selesai, buat {marks.length || ""} kolom</Button>
          <Button type="button" variant="quiet" onClick={onCancel}>Batal</Button>
        </div>
        <p className="field-hint">Jumlah baris dan gaya huruf membantu menebak ukuran teks yang sudah di-outline. <strong>Poin</strong>: beberapa baris menjadi satu kolom daftar. <strong>Info</strong>: kolom opsional yang bersusun dengan judul kecilnya. <strong>Opsional</strong>: boleh dikosongkan peserta, dan bila kosong kotaknya tidak ikut di hasil unduhan. Ukuran, font, dan posisi tetap bisa dirapikan di “Lanjutan”.</p>
      </div>
    </div>
  </div>;
}
