// Development-only: measure real rendered contrast of the hero title at every text
// position and focus, against a deliberately bright photo. CSS alone cannot prove this.
import { existsSync, mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const candidates = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const executablePath = candidates.find(path => existsSync(path));
if (!executablePath) { console.log("NO_BROWSER_FOUND"); process.exit(2); }
mkdirSync("screenshots", { recursive: true });

const POSITIONS = ["bottom-left", "bottom-center", "center-left", "center-center"];
const browser = await puppeteer.launch({ executablePath, headless: "new" });
const results = [];

for (const [device, width, height] of [["phone", 390, 844], ["desktop", 1440, 900]]) {
  for (const pos of POSITIONS) {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.goto(`http://localhost:3000/dev-preview?pos=${pos}`, { waitUntil: "networkidle0" });
    await new Promise(resolve => setTimeout(resolve, 600));

    // Sample the pixels actually behind the title, after the scrim has composited.
    const measured = await page.evaluate(() => {
      const title = document.querySelector("h1");
      if (!title) return { error: "no title" };
      const box = title.getBoundingClientRect();
      return { box: { x: box.x, y: box.y, width: box.width, height: box.height }, color: getComputedStyle(title).color };
    });
    if (measured.error) { results.push({ device, pos, error: measured.error }); await page.close(); continue; }

    const clip = {
      x: Math.max(0, Math.floor(measured.box.x)),
      y: Math.max(0, Math.floor(measured.box.y)),
      width: Math.min(Math.ceil(measured.box.width), width - Math.floor(measured.box.x)),
      height: Math.min(Math.ceil(measured.box.height), height - Math.floor(measured.box.y)),
    };
    // Hide the glyphs first: sampling them would measure white against white.
    await page.evaluate(() => { document.querySelectorAll("h1, .hero-text-probe").forEach(el => { el.style.visibility = "hidden"; }); });
    const shot = await page.screenshot({ clip, encoding: "base64" });
    await page.evaluate(() => { document.querySelectorAll("h1").forEach(el => { el.style.visibility = ""; }); });

    // Decode in-page: average the darkest region behind the glyphs.
    const stats = await page.evaluate(async (data) => {
      const image = new Image();
      await new Promise(resolve => { image.onload = resolve; image.src = `data:image/png;base64,${data}`; });
      const canvas = document.createElement("canvas");
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const { data: pixels } = context.getImageData(0, 0, canvas.width, canvas.height);
      const channel = value => { const v = value / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      let brightest = 0, darkest = 1, sum = 0, count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const L = 0.2126 * channel(pixels[i]) + 0.7152 * channel(pixels[i + 1]) + 0.0722 * channel(pixels[i + 2]);
        brightest = Math.max(brightest, L); darkest = Math.min(darkest, L); sum += L; count++;
      }
      return { brightest, darkest, mean: sum / count };
    }, shot);

    // White text (L=1) against the brightest backdrop pixel in the title's own box is the
    // worst case a reader actually sees.
    const ratio = (1 + 0.05) / (stats.brightest + 0.05);
    results.push({ device, pos, worstCaseRatio: Number(ratio.toFixed(2)), passesAA_large: ratio >= 3, passesAA_body: ratio >= 4.5 });
    await page.close();
  }
}
await browser.close();
console.table(results);
const failures = results.filter(r => r.error || !r.passesAA_large);
console.log(failures.length ? `FAIL: ${failures.length} posisi di bawah 3:1` : "PASS: semua posisi memenuhi AA untuk teks besar");
process.exit(0);
