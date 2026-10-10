// Development-only: prove the header is absent on first paint and appears after scrolling,
// and that the opening is not pushed down by a bar that is meant to be hidden.
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

const browser = await puppeteer.launch({ executablePath, headless: "new" });
const rows = [];

for (const [device, width, height] of [["phone", 390, 844], ["desktop", 1440, 900]]) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.goto("http://localhost:3000/dev-preview", { waitUntil: "networkidle0" });
  await new Promise(resolve => setTimeout(resolve, 400));

  const read = () => page.evaluate(() => {
    const header = document.querySelector("header");
    const box = header.getBoundingClientRect();
    const style = getComputedStyle(header);
    const hero = document.querySelector("main > section");
    // The admin preview banner is a static block above the opening and only exists in
    // preview; measure the hero relative to it so this reports what a guest would see.
    const banner = document.querySelector("main").parentElement.querySelector('[class*="preview"]');
    const bannerHeight = banner ? banner.getBoundingClientRect().height : 0;
    return {
      visible: style.opacity !== "0" && box.bottom > 0,
      position: style.position,
      heroOffsetWithoutBanner: Math.round(hero.getBoundingClientRect().top - bannerHeight),
      firstLinkVisible: getComputedStyle(header.querySelector("a")).visibility !== "hidden",
    };
  });

  const atTop = await read();
  await page.screenshot({ path: `screenshots/header-${device}-top.png` });

  await page.evaluate(() => window.scrollTo(0, Math.round(window.innerHeight * 1.2)));
  await new Promise(resolve => setTimeout(resolve, 500));
  const scrolled = await read();
  await page.screenshot({ path: `screenshots/header-${device}-scrolled.png` });

  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(resolve => setTimeout(resolve, 500));
  const back = await read();

  rows.push({
    perangkat: device,
    "awal: tersembunyi": !atTop.visible,
    "awal: pembuka di atas": atTop.heroOffsetWithoutBanner <= 2,
    "awal: tautan tak bisa di-tab": !atTop.firstLinkVisible,
    "setelah scroll: tampil": scrolled.visible && scrolled.firstLinkVisible,
    "kembali ke atas: tersembunyi": !back.visible,
  });
  await page.close();
}
await browser.close();
console.table(rows);
const failed = rows.some(row => Object.entries(row).some(([key, value]) => key !== "perangkat" && value !== true));
console.log(failed ? "ADA PEMERIKSAAN GAGAL" : "Semua perilaku header sesuai.");
process.exit(0);
