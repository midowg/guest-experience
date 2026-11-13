import { serialLabel } from "@/lib/pra-wam/cards";
import type { CardView } from "@/lib/server/pra-wam/cards";
import { body, display } from "./font";

/*
 * Drawing a character card on a canvas, as in the mockup ("full art", decided 3 Nov): the
 * character's picture fills the card, up to two stickers sit in the top corners, and the name,
 * the number and the level label sit on a dark fade at the bottom. Also the back of the card (the
 * drawn background), a phone wallpaper, and the square profile photo. Pictures come from this
 * site, so the canvas may be saved. A missing picture is drawn as plain colours, never an error.
 *
 * Kartu tokoh dunia (handoff 12 Nov 2026): a card with a figure is drawn as the handoff's mockup:
 * the figure fills the card on its persona's colour, the figure's name, the persona and the
 * number at the bottom, the rarity label bottom right; a figure without its picture yet is a
 * silhouette with "Figur menyusul". The back is blue with a big "?".
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

/** The persona's colour, light in the middle to dark at the edges. */
function personaBackground(context: CanvasRenderingContext2D, colors: [string, string], width: number, height: number) {
  const fill = context.createRadialGradient(width / 2, height * 0.38, 40, width / 2, height * 0.5, height * 0.8);
  fill.addColorStop(0, colors[0]); fill.addColorStop(1, colors[1]);
  context.fillStyle = fill; context.fillRect(0, 0, width, height);
}

/** "Ki Hajar Dewantara" → "KH": the initials on a figure's silhouette. */
export const initials = (name: string) => name.replace(/[^\p{L} ]/gu, "").split(" ").filter(Boolean).map(word => word[0]).slice(0, 2).join("").toUpperCase();

/** A figure without its picture yet: a soft silhouette with the initials, and "Figur menyusul". */
function silhouette(context: CanvasRenderingContext2D, name: string, x: number, y: number, width: number, height: number) {
  context.save();
  context.fillStyle = "rgba(255,248,233,.22)";
  context.beginPath(); context.arc(x + width / 2, y + height * 0.33, width * 0.27, 0, Math.PI * 2); context.fill();
  rounded(context, x + width * 0.3, y + height * 0.55, width * 0.4, height * 0.32, width * 0.12); context.fill();
  context.fillStyle = "rgba(255,248,233,.9)"; context.textAlign = "center"; context.textBaseline = "middle";
  context.font = fontOf(width * 0.2, true);
  context.fillText(initials(name), x + width / 2, y + height * 0.33);
  context.font = fontOf(Math.max(14, width * 0.0375)); context.fillText("Figur menyusul", x + width / 2, y + height * 0.93);
  context.restore();
}

type FigureCard = CardView & { figure: NonNullable<CardView["figure"]> };
const withFigure = (card: CardView): card is FigureCard => !!card.figure;

/** The tokoh card's front, 1080 × 1350. */
async function drawFigureFront(card: FigureCard, scale: number): Promise<HTMLCanvasElement> {
  const [image] = await Promise.all([loadImage(card.figure.image), fontsReady()]);
  const { width: W, height: H } = CARD;
  const [canvas, g] = canvasOf(W, H, scale);
  personaBackground(g, card.colors, W, H);
  if (image) cover(g, image, 0, 0, W, H, 0.2); else silhouette(g, card.figure.name, 140, 60, 800, 980);
  const fade = g.createLinearGradient(0, H - 360, 0, H);
  fade.addColorStop(0, "rgba(20,19,37,0)"); fade.addColorStop(1, "rgba(20,19,37,.78)");
  g.fillStyle = fade; g.fillRect(0, H - 360, W, 360);
  g.textBaseline = "alphabetic"; g.textAlign = "left"; g.fillStyle = CREAM;
  const name = card.figure.name.toUpperCase();
  let size = 64;
  g.font = fontOf(size, true);
  while (g.measureText(name).width > W - 112 && size > 36) { size -= 2; g.font = fontOf(size, true); }
  g.fillText(name, 56, H - 150, W - 112);
  g.font = fontOf(36); g.fillStyle = "rgba(255,248,233,.92)"; g.fillText(card.character.class, 58, H - 96);
  g.font = fontOf(30); g.fillStyle = "rgba(255,248,233,.75)"; g.fillText(`${YEAR_LABEL}  ·  ${serialLabel(card.serial)}`, 58, H - 50);
  g.font = fontOf(30);
  const label = card.tier.name.toUpperCase();
  const tw = g.measureText(label).width + 44, tx = W - 56 - tw, ty = H - 96;
  g.fillStyle = card.tier.color; rounded(g, tx, ty, tw, 56, 28); g.fill();
  g.fillStyle = INK; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(label, tx + tw / 2, ty + 30);
  return canvas;
}

/** The tokoh card's back: blue, a big "?", the number. */
async function drawFigureBack(card: CardView, scale: number): Promise<HTMLCanvasElement> {
  await fontsReady();
  const { width: W, height: H } = CARD;
  const [canvas, g] = canvasOf(W, H, scale);
  const fill = g.createLinearGradient(0, 0, W, H);
  fill.addColorStop(0, "#233E91"); fill.addColorStop(1, "#56A3EE");
  g.fillStyle = fill; g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(255,255,255,.08)";
  for (let index = 0; index < 9; index++) { g.beginPath(); g.arc(120 + index * 110, 160 + ((index * 337) % 1000), 40 + (index % 3) * 30, 0, Math.PI * 2); g.fill(); }
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#F0BB3E"; g.font = fontOf(460, true); g.fillText("?", W / 2, 600);
  g.fillStyle = CREAM; g.font = fontOf(44, true); g.fillText(YEAR_LABEL, W / 2, 960);
  g.font = fontOf(32); g.fillStyle = "rgba(255,248,233,.85)";
  g.fillText(card.serial === null ? "Kartu uji, belum dibuka" : `Kartu ${serialLabel(card.serial)}, belum dibuka`, W / 2, 1015);
  return canvas;
}

/** The tokoh card as a phone wallpaper, 1080 × 2340: the card in the middle, the top clear for the clock. */
async function drawFigureWallpaper(card: FigureCard): Promise<HTMLCanvasElement> {
  const front = await drawFigureFront(card, 1);
  const { width: W, height: H } = WALL;
  const [canvas, g] = canvasOf(W, H);
  personaBackground(g, card.colors, W, H);
  const shade = g.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, "rgba(20,19,37,.45)"); shade.addColorStop(0.3, "rgba(20,19,37,0)"); shade.addColorStop(1, "rgba(20,19,37,.6)");
  g.fillStyle = shade; g.fillRect(0, 0, W, H);
  const x = 100, y = 760, w = 880, h = 1100;
  g.save(); g.shadowColor = card.tier.color; g.shadowBlur = card.tier.sort >= 2 ? 90 : 40; g.fillStyle = card.tier.color; rounded(g, x - 8, y - 8, w + 16, h + 16, 52); g.fill(); g.restore();
  g.save(); rounded(g, x, y, w, h, 44); g.clip(); g.drawImage(front, x, y, w, h); g.restore();
  g.lineWidth = 6; g.strokeStyle = CREAM; rounded(g, x, y, w, h, 44); g.stroke();
  g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = card.tier.color; g.font = fontOf(36);
  g.fillText(`${YEAR_LABEL}  ·  ${card.tier.name.toUpperCase()}  ·  ${serialLabel(card.serial)}`, W / 2, 1990);
  return canvas;
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
  if (withFigure(card)) return drawFigureFront(card, scale);
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
  if (withFigure(card)) return drawFigureBack(card, scale);
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
  if (withFigure(card)) return drawFigureWallpaper(card);
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
  if (withFigure(card)) {
    const [image] = await Promise.all([loadImage(card.figure.image), fontsReady()]);
    const [canvas, g] = canvasOf(side, side);
    personaBackground(g, card.colors, side, side);
    if (image) cover(g, image, 0, 0, side, side, 0.12); else silhouette(g, card.figure.name, side * 0.1, side * 0.02, side * 0.8, side * 0.98);
    return canvas;
  }
  const art = await pictures(card);
  const [canvas, g] = canvasOf(side, side);
  if (art.background) cover(g, art.background, 0, 0, side, side); else plain(g, card.tier.color, 0, 0, side, side);
  if (art.character) cover(g, art.character, 0, 0, side, side, 0.12);
  return canvas;
}

export const blobOf = (canvas: HTMLCanvasElement, type = "image/png", quality?: number) =>
  new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
