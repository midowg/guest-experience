// Development-only: measure whether centred hero text is genuinely centred, by comparing
// the gap on each side of every text block. Eyeballing a screenshot cannot settle this.
import { existsSync, mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const executablePath = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].find(path => existsSync(path));
if (!executablePath) { console.log("NO_BROWSER_FOUND"); process.exit(2); }
mkdirSync("screenshots", { recursive: true });

const browser = await puppeteer.launch({ executablePath, headless: "new" });
const rows = [];

for (const [device, width, height] of [["phone", 390, 844], ["laptop", 1366, 768], ["desktop", 1920, 1080]]) {
  for (const pos of ["center", "left"]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.goto(`http://localhost:3000/dev-preview?preview=0&pos=${pos}`, { waitUntil: "networkidle0" });
    await new Promise(resolve => setTimeout(resolve, 400));

    const centred = pos === "center";
    const measured = await page.evaluate(() => {
      const hero = document.querySelector("main > section");
      const inner = hero.querySelector('[class*="heroInner"]');
      const frame = inner.getBoundingClientRect();
      const parts = [...inner.children].map(child => {
        const box = child.getBoundingClientRect();
        if (box.width === 0) return null;
        return { tag: child.tagName.toLowerCase(), offAxis: Math.round(Math.abs((box.left - frame.left) - (frame.right - box.right))) };
      }).filter(Boolean);
      // Each date/time/place row: is its text where the block's alignment says? The icon
      // and the text sit side by side, so measure the icon+text pair against the row —
      // comparing the text alone would count the icon's width as an imbalance.
      const facts = [...inner.querySelectorAll('[class*="heroMetaItem"]')].map(item => {
        const row = item.getBoundingClientRect();
        const children = [...item.children].map(child => child.getBoundingClientRect());
        const contentLeft = Math.min(...children.map(box => box.left));
        const contentRight = Math.max(...children.map(box => box.right));
        return Math.round(Math.abs((contentLeft - row.left) - (row.right - contentRight)));
      });
      return {
        heroHeight: Math.round(hero.getBoundingClientRect().height),
        viewport: window.innerHeight,
        worstOffAxis: Math.max(...parts.map(part => part.offAxis)),
        offenders: parts.filter(part => part.offAxis > 2).map(part => `${part.tag}:${part.offAxis}px`).join(", "),
        factsCentred: facts.length > 0 && facts.every(gap => gap <= 2),
        // Left-aligned rows shrink to their content, so the gap is 0 there too; what marks
        // them is that the row starts at the block's left edge rather than being spread.
        factsStartAtLeft: [...inner.querySelectorAll('[class*="heroMetaItem"]')].every(item => {
          const row = item.getBoundingClientRect();
          return Math.round(row.left - frame.left) <= 2 || row.width < frame.width - 2;
        }),
      };
    });

    rows.push({
      perangkat: device,
      posisi: pos,
      "pembuka penuh": measured.heroHeight >= measured.viewport - 1,
      "selisih blok": `${measured.worstOffAxis}px`,
      // Left-aligned text is meant to hug the left edge; only centred layouts must be even.
      "blok simetris": centred ? measured.worstOffAxis <= 2 : true,
      // On a wide screen the facts sit in a centred row but still read from their icon,
      // so only the stacked phone layout is expected to centre their text.
      "tanggal/waktu/tempat ikut": centred
        ? (device === "phone" ? measured.factsCentred : true)
        : measured.factsStartAtLeft,
    });
    if (centred) await page.screenshot({ path: `screenshots/symmetry-${device}.png` });
    await page.close();
  }
}
await browser.close();
console.table(rows);
const failed = rows.some(row => row["pembuka penuh"] !== true || row["blok simetris"] !== true || row["tanggal/waktu/tempat ikut"] !== true);
console.log(failed ? "ADA PEMERIKSAAN GAGAL" : "Pembuka penuh, blok simetris, dan tanggal/waktu/tempat mengikuti perataannya.");
process.exit(0);
