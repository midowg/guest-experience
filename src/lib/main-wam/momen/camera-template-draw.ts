import { FONT_STACK, LOGO_SRC, NET_SRC, SHADOW, withAlpha, type TemplateOp } from "./camera-templates";

/*
 * Draws a template's ops (camera-templates.ts) on the canvas of the photo that is sent: the same list the
 * viewfinder draws as an SVG. The Werkudara mark is black art: it is tinted on a small canvas of its own
 * first (source-in), then drawn. The images are loaded once, same-origin, and awaited with decode(); one that
 * does not load is skipped (the photo is sent without it, never lost).
 */

export type TemplateAssets = { logo: CanvasImageSource | null; net: CanvasImageSource | null };
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

let cache: Promise<TemplateAssets> | null = null;
/** The mark and the network art, loaded once (a failed load is tried again next time). */
export function loadTemplateAssets(): Promise<TemplateAssets> {
  if (!cache) {
    cache = Promise.all([loadImage(LOGO_SRC), loadImage(NET_SRC)]).then(([logo, net]) => {
      if (!logo || !net) cache = null;
      return { logo, net };
    });
  }
  return cache;
}

function spaced(ctx: CanvasRenderingContext2D, op: Extract<TemplateOp, { k: "text" }>) {
  ctx.font = `${op.weight} ${op.size}px ${FONT_STACK}`;
  const chars = [...op.text];
  const gap = op.ls * op.size;
  const widths = chars.map(char => ctx.measureText(char).width);
  const total = widths.reduce((sum, w) => sum + w, 0) + gap * (chars.length - 1);
  // The estimate that sized the line is safe, but a font that is wider than it must still not run off the photo.
  const k = total > op.maxW ? op.maxW / total : 1;
  let x = op.align === "start" ? op.x : op.align === "end" ? op.x - total * k : op.x - (total * k) / 2;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  chars.forEach((char, i) => { ctx.fillText(char, x, op.y); x += (widths[i] + gap) * k; });
}

/** Draws the ops (in order) on the context; the context's state is kept. */
export function drawTemplate(ctx: CanvasRenderingContext2D, ops: TemplateOp[], assets: TemplateAssets, make: MakeCanvas = defaultMake): void {
  for (const op of ops) {
    ctx.save();
    try {
      if (op.k === "rect") {
        ctx.globalAlpha = op.opacity ?? 1;
        ctx.fillStyle = op.fill;
        ctx.fillRect(op.x, op.y, op.w, op.h);
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
        spaced(ctx, op);
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
