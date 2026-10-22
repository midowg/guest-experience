// Draws the built-in poster backgrounds into public/poster/: everything that does not change per
// poster (colour, gold lines, dividers, icons, the badge). Text and photos are laid on top by
// Studio Poster, so no text lives here (an SVG drawn as an image cannot use the page's fonts).
// Run `npm run poster:backgrounds` after changing a layout; a background exported from Figma
// replaces these once the admin uploads it.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const icons = {};
function icon(name) {
  if (icons[name]) return icons[name];
  const source = readFileSync(`node_modules/lucide-react/dist/esm/icons/${name}.js`, "utf8");
  const match = source.match(/createLucideIcon\("[^"]+", (\[[\s\S]*?\])\);/);
  if (!match) throw new Error(`No icon ${name}`);
  const nodes = new Function(`return ${match[1]}`)();
  icons[name] = nodes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([key]) => key !== "key").map(([key, value]) => `${key}="${value}"`).join(" ")}/>`).join("");
  return icons[name];
}
const draw = (name, x, y, size, color) =>
  `<g transform="translate(${x} ${y}) scale(${size / 24})" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon(name)}</g>`;

const CREAM = "#fbf7ef", GREEN = "#0f4a3a", GOLD = "#c9922b", LINE = "#e3cfa3", PHOTO = "#e9dfcb", FRAME = "#f3ead8";
const svg = (width, height, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${CREAM}"/>${body}</svg>\n`;

const post = svg(1080, 1350, [
  `<line x1="730" y1="128" x2="1020" y2="128" stroke="${GOLD}" stroke-width="2"/>`,
  `<rect x="0" y="215" width="1080" height="660" fill="${PHOTO}"/>`,
  `<line x1="478" y1="910" x2="478" y2="1300" stroke="${LINE}" stroke-width="2"/>`,
  `<line x1="782" y1="910" x2="782" y2="1300" stroke="${LINE}" stroke-width="2"/>`,
  `<rect x="64" y="1015" width="150" height="180" rx="10" fill="${FRAME}" stroke="${LINE}" stroke-width="2"/>`,
  draw("calendar", 520, 930, 40, GOLD), draw("clock", 520, 1034, 40, GOLD), draw("hourglass", 520, 1134, 40, GOLD), draw("map-pin", 520, 1230, 40, GOLD),
  `<rect x="805" y="920" width="225" height="92" fill="${GREEN}"/>`, draw("users", 820, 946, 36, CREAM),
  `<line x1="805" y1="1045" x2="1030" y2="1045" stroke="${LINE}" stroke-width="2"/>`,
  draw("message-circle", 812, 1084, 38, GOLD), draw("instagram", 812, 1226, 38, GOLD),
].join(""));

const story = svg(1080, 1920, [
  `<line x1="72" y1="500" x2="380" y2="500" stroke="${GOLD}" stroke-width="2"/>`,
  `<rect x="0" y="590" width="1080" height="620" fill="${PHOTO}"/>`,
  `<rect x="72" y="1345" width="140" height="160" rx="10" fill="${FRAME}" stroke="${LINE}" stroke-width="2"/>`,
  draw("calendar", 72, 1530, 42, GOLD), draw("clock", 552, 1530, 42, GOLD), draw("hourglass", 72, 1605, 42, GOLD), draw("map-pin", 552, 1605, 42, GOLD),
  `<line x1="72" y1="1690" x2="1008" y2="1690" stroke="${LINE}" stroke-width="2"/>`,
  `<rect x="72" y="1715" width="420" height="80" fill="${GREEN}"/>`, draw("users", 90, 1737, 36, CREAM),
  draw("message-circle", 532, 1716, 38, GOLD), draw("instagram", 532, 1764, 36, GOLD),
].join(""));

mkdirSync("public/poster", { recursive: true });
writeFileSync("public/poster/rempah-nusantara-post.svg", post);
writeFileSync("public/poster/rempah-nusantara-story.svg", story);
console.log("public/poster: rempah-nusantara-post.svg, rempah-nusantara-story.svg");
