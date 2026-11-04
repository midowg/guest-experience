import { serialLabel } from "@/lib/pra-wam/cards";
import type { CardView } from "@/lib/server/pra-wam/cards";
import { body, display } from "./font";

/*
 * Drawing a character card on a canvas, as in the mockup ("full art", decided 3 Nov): the
 * character's picture fills the card, up to two stickers sit in the top corners, and the name,
 * the number and the level label sit on a dark fade at the bottom. Also the back of the card (the
 * drawn background), a phone wallpaper, and the square profile photo. Pictures come from this
 * site, so the canvas may be saved. A missing picture is drawn as plain colours, never an error.
 */

export const CARD = { width: 1080, height: 1350 } as const;
export const WALL = { width: 1080, height: 2340 } as const;
export const YEAR_LABEL = "WAM 2026";
const CREAM = "#FFF8E9", INK = "#141325";

const images = new Map<string, Promise<HTMLImageElement | null>>();
/** One picture, loaded once per page; null when it is missing or cannot be read. */
export function loadImage(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  if (!images.has(url)) images.set(url, new Promise(resolve => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  }));
  return images.get(url)!;
}

const fontOf = (size: number, displayFont = false) =>
  displayFont ? `400 ${size}px ${display.style.fontFamily}, "Arial Black", sans-serif` : `700 ${size}px ${body.style.fontFamily}, Arial, sans-serif`;
async function fontsReady() {
  try { await Promise.all([document.fonts.load(fontOf(44)), document.fonts.load(fontOf(44, true))]); } catch { /* the fallbacks draw */ }
}

function canvasOf(width: number, height: number, scale = 1): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Browser ini belum dapat menggambar kartu.");
  context.scale(scale, scale);
  context.imageSmoothingQuality = "high";
  return [canvas, context];
}

function rounded(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  if (context.roundRect) context.roundRect(x, y, width, height, radius); else context.rect(x, y, width, height);
}

/** Draws a picture to fill the box without stretching; `focus` is where to crop vertically (0 top, 1 bottom). */
function cover(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number, focus = 0.5) {
  const scale = Math.max(width / image.width, height / image.height);
  const sw = width / scale, sh = height / scale;
  context.drawImage(image, (image.width - sw) / 2, (image.height - sh) * focus, sw, sh, x, y, width, height);
}

/** Stand-in for a missing picture: the level's colour on ink. */
function plain(context: CanvasRenderingContext2D, color: string, x: number, y: number, width: number, height: number) {
  const fill = context.createLinearGradient(x, y, x + width, y + height);
  fill.addColorStop(0, color); fill.addColorStop(1, INK);
  context.fillStyle = fill; context.fillRect(x, y, width, height);
}

async function pictures(card: CardView) {
  const [character, background, ...stickers] = await Promise.all([
    loadImage(card.character.image), loadImage(card.background.image), ...card.stickers.map(sticker => loadImage(sticker.image)),
  ]);
  await fontsReady();
  return { character, background, stickers: stickers.filter((image): image is HTMLImageElement => !!image) };
}

/** The front: 1080 × 1350 (4:5). */
export async function drawFront(card: CardView, scale = 1): Promise<HTMLCanvasElement> {
  const art = await pictures(card);
  const { width: W, height: H } = CARD;
  const [canvas, g] = canvasOf(W, H, scale);
  if (art.character) cover(g, art.character, 0, 0, W, H, 0.15); else plain(g, card.tier.color, 0, 0, W, H);
  const spots = [[34, 34, 104], [W - 138, 34, 104]];
  art.stickers.forEach((image, index) => { const [x, y, side] = spots[index]; g.drawImage(image, x, y, side, side); });
  const fade = g.createLinearGradient(0, H - 300, 0, H);
  fade.addColorStop(0, "rgba(20,19,37,0)"); fade.addColorStop(1, "rgba(20,19,37,.72)");
  g.fillStyle = fade; g.fillRect(0, H - 300, W, 300);
  g.textBaseline = "alphabetic"; g.textAlign = "left";
  g.fillStyle = CREAM; g.font = fontOf(58, true); g.fillText(card.character.name.toUpperCase(), 56, H - 86, W - 112);
  g.font = fontOf(34); g.fillStyle = "rgba(255,248,233,.85)"; g.fillText(`${YEAR_LABEL}  ·  ${serialLabel(card.serial)}`, 58, H - 40);
  g.font = fontOf(30);
  const label = card.tier.name.toUpperCase();
  const tw = g.measureText(label).width + 44, tx = W - 56 - tw, ty = H - 118;
  g.fillStyle = card.tier.color; rounded(g, tx, ty, tw, 56, 28); g.fill();
  g.fillStyle = INK; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(label, tx + tw / 2, ty + 30);
  return canvas;
}

/** The back, before it is opened: the drawn background and a big "?". */
export async function drawBack(card: CardView, scale = 0.6): Promise<HTMLCanvasElement> {
  const art = await pictures(card);
  const { width: W, height: H } = CARD;
  const [canvas, g] = canvasOf(W, H, scale);
  if (art.background) cover(g, art.background, 0, 0, W, H); else plain(g, "#3A2E6E", 0, 0, W, H);
  g.fillStyle = "rgba(20,19,37,.35)"; g.fillRect(0, 0, W, H);
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#F0BB3E"; g.font = fontOf(460, true); g.fillText("?", W / 2, 600);
  g.fillStyle = CREAM; g.font = fontOf(44, true); g.fillText(YEAR_LABEL, W / 2, 960);
  g.font = fontOf(32); g.fillStyle = "rgba(255,248,233,.8)"; g.fillText(card.serial === null ? "Kartu uji, belum dibuka" : `Kartu ${serialLabel(card.serial)}, belum dibuka`, W / 2, 1015);
  return canvas;
}

/** A phone wallpaper, 1080 × 2340: the card in the middle, the top left clear for the clock. */
export async function drawWallpaper(card: CardView): Promise<HTMLCanvasElement> {
  const art = await pictures(card);
  const { width: W, height: H } = WALL;
  const [canvas, g] = canvasOf(W, H);
  if (art.background) cover(g, art.background, 0, 0, W, H); else plain(g, "#3A2E6E", 0, 0, W, H);
  if (art.character) {
    g.save(); g.globalAlpha = 0.45; g.filter = "blur(46px) saturate(1.2)"; cover(g, art.character, -120, -120, W + 240, H + 240); g.restore(); g.filter = "none";
  }
  const shade = g.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, "rgba(20,19,37,.55)"); shade.addColorStop(0.32, "rgba(20,19,37,0)"); shade.addColorStop(0.78, "rgba(20,19,37,0)"); shade.addColorStop(1, "rgba(20,19,37,.75)");
  g.fillStyle = shade; g.fillRect(0, 0, W, H);
  const x = 70, y = 740, w = 940, h = 1210;
  const rare = card.tier.sort >= 2; // Rare and above glow brighter
  g.save(); g.shadowColor = card.tier.color; g.shadowBlur = rare ? 90 : 40; g.fillStyle = card.tier.color; rounded(g, x - 8, y - 8, w + 16, h + 16, 52); g.fill(); g.restore();
  g.save(); rounded(g, x, y, w, h, 44); g.clip();
  if (art.character) cover(g, art.character, x, y, w, h); else plain(g, card.tier.color, x, y, w, h);
  g.restore();
  g.lineWidth = 6; g.strokeStyle = CREAM; rounded(g, x, y, w, h, 44); g.stroke();
  const spots = [[x - 30, y - 60, 170], [x + w - 150, y + h - 110, 170]];
  art.stickers.forEach((image, index) => { const [sx, sy, side] = spots[index]; g.drawImage(image, sx, sy, side, side); });
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = CREAM; g.font = fontOf(66, true); g.fillText(card.character.name.toUpperCase(), W / 2, 2045, W - 120);
  g.fillStyle = card.tier.color; g.font = fontOf(36); g.fillText(`${YEAR_LABEL}  ·  ${card.tier.name.toUpperCase()}  ·  ${serialLabel(card.serial)}`, W / 2, 2112);
  return canvas;
}

/** The profile photo: a square from the top of the character's picture, at `side` pixels. */
export async function drawAvatar(card: CardView, side: number): Promise<HTMLCanvasElement> {
  const art = await pictures(card);
  const [canvas, g] = canvasOf(side, side);
  if (art.background) cover(g, art.background, 0, 0, side, side); else plain(g, card.tier.color, 0, 0, side, side);
  if (art.character) cover(g, art.character, 0, 0, side, side, 0.12);
  return canvas;
}

export const blobOf = (canvas: HTMLCanvasElement, type = "image/png", quality?: number) =>
  new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
