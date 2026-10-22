// Writes src/lib/poster-icons.ts: the inner SVG of the few Lucide icons the built-in card
// backgrounds draw (calendar, clock, …). Backgrounds are drawn in the browser from the palette,
// so the icon shapes must be available there without the React components.
// Run `npm run poster:icons` after adding a name below. Lucide is ISC-licensed.
import { readFileSync, writeFileSync } from "node:fs";

const names = ["calendar", "clock", "hourglass", "map-pin", "users", "message-circle", "instagram", "camera", "sparkles", "heart", "star", "award", "mail", "phone", "globe", "gift", "party-popper", "badge-check", "quote", "ticket"];

const entries = names.map(name => {
  const source = readFileSync(`node_modules/lucide-react/dist/esm/icons/${name}.js`, "utf8");
  const match = source.match(/createLucideIcon\("[^"]+", (\[[\s\S]*?\])\);/);
  if (!match) throw new Error(`No icon ${name}`);
  const nodes = new Function(`return ${match[1]}`)();
  const svg = nodes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([key]) => key !== "key").map(([key, value]) => `${key}="${value}"`).join(" ")}/>`).join("");
  return `  "${name}": ${JSON.stringify(svg)},`;
});

writeFileSync("src/lib/poster-icons.ts", `// Dibuat otomatis oleh scripts/poster-icons.mjs dari lucide-react (ISC). Jangan diubah manual.

/** Inner SVG (24 × 24, stroke) of the icons card backgrounds draw. */
export const posterIcons = {
${entries.join("\n")}
} as const;
export type PosterIcon = keyof typeof posterIcons;
`);
console.log(`src/lib/poster-icons.ts: ${names.length} icons`);
