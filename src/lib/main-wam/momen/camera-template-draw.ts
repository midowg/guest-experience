import { FONT_CSS, FONT_FALLBACK, LOGO_SRC, NET_SRC, SHADOW, withAlpha, type FontKind, type TemplateOp } from "./camera-templates";

/*
 * Draws a template's ops (camera-templates.ts) on the canvas of the photo that is sent: the same list the
 * viewfinder draws as an SVG. The Werkudara mark is black art: it is tinted on a small canvas of its own
 * first (source-in), then drawn. The images are loaded once, same-origin, and awaited with decode(); one that
 * does not load is skipped (the photo is sent without it, never lost).
 */

/** The images, and (when the app's fonts could be read) the font-family text of each voice; without them the plain names are used. */
export type TemplateAssets = { logo: CanvasImageSource | null; net: CanvasImageSource | null; fonts?: Partial<Record<FontKind, string>> };
type Scratch = { width: number; height: number; getContext: (kind: "2d") => CanvasRenderingContext2D | null };
export type MakeCanvas = (width: number, height: number) => Scratch;

const defaultMake: MakeCanvas = (width, height) => { const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; return canvas; };

async function loadImage(src: string, wait = 4000): Promise<HTMLImageElement | null> {
  if (typeof Image === "undefined") return null;
  try {
    const image = new Image();
    image.src = src;
    await Promise.race([image.decode(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), wait))]);
    return image;
  } catch { return null; }
}

/** The font-family text the app's own variables stand for here (next/font gives the families generated names), read once from the theme root. */
function resolveFonts(): Partial<Record<FontKind, string>> {
  if (typeof document === "undefined") return {};
  const fonts: Partial<Record<FontKind, string>> = {};
  const host = document.querySelector("[data-main-wam]") ?? document.body;
  for (const kind of ["display", "sans"] as const) {
    try {
      const probe = document.createElement("span");
      probe.style.fontFamily = FONT_CSS[kind];
      probe.style.position = "absolute"; probe.style.visibility = "hidden";
      host.appendChild(probe);
      const family = getComputedStyle(probe).fontFamily;
      probe.remove();
      if (family) fonts[kind] = family;
    } catch { /* the plain names are used */ }
  }
  return fonts;
}

let cache: Promise<TemplateAssets> | null = null;
/** The mark, the network art and the fonts, loaded once (a failed load is tried again next time). */
export function loadTemplateAssets(): Promise<TemplateAssets> {
  if (!cache) {
    cache = (async () => {
      const [logo, net] = await Promise.all([loadImage(LOGO_SRC), loadImage(NET_SRC)]);
      const fonts = resolveFonts();
      // The canvas draws with a font only when it is loaded: ask for the weights the signs use.
      try {
        if (typeof document !== "undefined" && document.fonts) {
          await Promise.race([
            Promise.all([fonts.display && document.fonts.load(`800 20px ${fonts.display}`), fonts.display && document.fonts.load(`700 20px ${fonts.display}`), fonts.sans && document.fonts.load(`800 20px ${fonts.sans}`), fonts.sans && document.fonts.load(`700 20px ${fonts.sans}`)]),
            new Promise(resolve => setTimeout(resolve, 3000)),
          ]);
        }
      } catch { /* drawn with what is there */ }
      if (!logo || !net) cache = null;
      return { logo, net, fonts };
    })();
  }
  return cache;
}

function spaced(ctx: CanvasRenderingContext2D, op: Extract<TemplateOp, { k: "text" }>, family: string) {
  ctx.font = `${op.weight} ${op.size}px ${family}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  if (op.opacity !== undefined) ctx.globalAlpha = op.opacity;
  if (op.rotate) { ctx.translate(op.x, op.y); ctx.rotate((op.rotate * Math.PI) / 180); ctx.translate(-op.x, -op.y); }
  if (op.stretchW) {
    // The glyphs stretched (or squeezed) to exactly this width, like the preview's textLength with spacingAndGlyphs.
    const width = ctx.measureText(op.text).width || 1;
    ctx.translate(op.x, op.y); ctx.scale(op.stretchW / width, 1); ctx.fillText(op.text, 0, 0);
    return;
  }
  const chars = [...op.text];
  const gap = op.ls * op.size;
  const widths = chars.map(char => ctx.measureText(char).width);
  const total = widths.reduce((sum, w) => sum + w, 0) + gap * (chars.length - 1);
  // The estimate that sized the line is safe, but a font that is wider than it must still not run off the photo.
  const k = total > op.maxW ? op.maxW / total : 1;
  let x = op.align === "start" ? op.x : op.align === "end" ? op.x - total * k : op.x - (total * k) / 2;
  chars.forEach((char, i) => { ctx.fillText(char, x, op.y); x += (widths[i] + gap) * k; });
}

/** A rectangle path with rounded corners (also where the canvas has no roundRect). */
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Draws the ops (in order) on the context; the context's state is kept. */
export function drawTemplate(ctx: CanvasRenderingContext2D, ops: TemplateOp[], assets: TemplateAssets, make: MakeCanvas = defaultMake): void {
  for (const op of ops) {
    ctx.save();
    try {
      if (op.k === "rect") {
        ctx.globalAlpha = op.opacity ?? 1;
        ctx.fillStyle = op.fill;
        if (op.r) { roundedRect(ctx, op.x, op.y, op.w, op.h, op.r); ctx.fill(); } else ctx.fillRect(op.x, op.y, op.w, op.h);
        if (op.stroke) {
          ctx.globalAlpha = op.stroke.opacity; ctx.strokeStyle = op.stroke.color; ctx.lineWidth = op.stroke.w;
          if (op.r) { roundedRect(ctx, op.x, op.y, op.w, op.h, op.r); ctx.stroke(); } else ctx.strokeRect(op.x, op.y, op.w, op.h);
        }
      } else if (op.k === "path") {
        ctx.strokeStyle = op.color; ctx.lineWidth = op.line; ctx.lineCap = "square"; ctx.lineJoin = "miter";
        ctx.beginPath();
        op.points.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.stroke();
      } else if (op.k === "grad") {
        const gradient = ctx.createLinearGradient(0, op.y, 0, op.y + op.h);
        gradient.addColorStop(0, withAlpha(op.color, op.dir === "down" ? op.a0 : op.a1));
        gradient.addColorStop(1, withAlpha(op.color, op.dir === "down" ? op.a1 : op.a0));
        ctx.fillStyle = gradient;
        ctx.fillRect(op.x, op.y, op.w, op.h);
      } else if (op.k === "frame") {
        ctx.globalAlpha = op.opacity ?? 1;
        ctx.strokeStyle = op.color;
        ctx.lineWidth = op.line;
        ctx.strokeRect(op.x, op.y, op.w, op.h);
      } else if (op.k === "text") {
        ctx.fillStyle = op.color;
        if (op.shadow) { ctx.shadowColor = withAlpha(SHADOW, 0.55); ctx.shadowBlur = op.size * 0.3; ctx.shadowOffsetY = op.size * 0.06; }
        spaced(ctx, op, assets.fonts?.[op.font] ?? FONT_FALLBACK[op.font]);
      } else if (op.k === "logo") {
        if (!assets.logo) continue;
        const scratch = make(419, 477);
        const inner = scratch.getContext("2d");
        if (!inner) continue;
        inner.drawImage(assets.logo, 0, 0, scratch.width, scratch.height);
        inner.globalCompositeOperation = "source-in";
        inner.fillStyle = op.color;
        inner.fillRect(0, 0, scratch.width, scratch.height);
        ctx.imageSmoothingQuality = "high";
        if (op.shadow) { ctx.shadowColor = withAlpha(SHADOW, 0.5); ctx.shadowBlur = op.h * 0.12; ctx.shadowOffsetY = op.h * 0.025; }
        ctx.drawImage(scratch as unknown as CanvasImageSource, op.x, op.y, op.w, op.h);
      } else if (op.k === "net") {
        if (!assets.net) continue;
        ctx.globalAlpha = op.opacity;
        ctx.drawImage(assets.net, op.x, op.y, op.w, op.h);
      }
    } finally {
      ctx.restore();
    }
  }
}
