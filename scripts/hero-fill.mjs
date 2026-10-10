// Development-only: prove the opening fills the phone screen, with nothing from the next
// section showing, and settle whether the hydration warning comes from our own HTML.
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

// A clean browser: no extensions, exactly what a guest's phone loads.
for (const [device, width, height] of [["iPhone SE", 375, 667], ["iPhone 14", 390, 844], ["Pixel 7", 412, 915]]) {
  const page = await browser.newPage();
  const warnings = [];
  page.on("console", message => { if (message.type() === "error" && /hydrat/i.test(message.text())) warnings.push(message.text().slice(0, 120)); });
  await page.setViewport({ width, height, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto("http://localhost:3000/dev-preview?preview=0", { waitUntil: "networkidle0" });
  await new Promise(resolve => setTimeout(resolve, 500));

  const measured = await page.evaluate(() => {
    const hero = document.querySelector("main > section");
    const next = hero.nextElementSibling;
    const heroBox = hero.getBoundingClientRect();
    return {
      heroHeight: Math.round(heroBox.height),
      viewport: window.innerHeight,
      // Anything above this line is visible without scrolling.
      nextSectionTop: next ? Math.round(next.getBoundingClientRect().top) : null,
      bodyHasInjectedAttrs: [...document.body.attributes].map(a => a.name).filter(n => !["class", "style"].includes(n)),
    };
  });

  const fills = measured.heroHeight >= measured.viewport - 1;
  const nextHidden = measured.nextSectionTop === null || measured.nextSectionTop >= measured.viewport - 1;
  rows.push({
    perangkat: device,
    layar: measured.viewport,
    "tinggi pembuka": measured.heroHeight,
    "pembuka penuh": fills,
    "bagian berikut tersembunyi": nextHidden,
    "peringatan hydration": warnings.length,
    "atribut asing di body": measured.bodyHasInjectedAttrs.join(", ") || "tidak ada",
  });
  await page.screenshot({ path: `screenshots/hero-${device.replace(/\s+/g, "-").toLowerCase()}.png` });
  await page.close();
}
await browser.close();
console.table(rows);
const failed = rows.some(row => row["pembuka penuh"] !== true || row["bagian berikut tersembunyi"] !== true || row["peringatan hydration"] !== 0);
console.log(failed ? "ADA PEMERIKSAAN GAGAL" : "Pembuka memenuhi layar dan tidak ada peringatan hydration di browser bersih.");
process.exit(0);
