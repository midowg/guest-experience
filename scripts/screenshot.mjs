// Development-only rendering check: opens the guest preview in a local browser and
// reports horizontal overflow at phone and desktop widths.
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const candidates = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const executablePath = candidates.find(path => existsSync(path));
if (!executablePath) { console.log("NO_BROWSER_FOUND"); process.exit(2); }

const url = process.argv[2] ?? "http://localhost:3000/dev-preview";
const browser = await puppeteer.launch({ executablePath, headless: "new" });
for (const [name, width, height] of [["phone", 390, 844], ["desktop", 1440, 900]]) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.goto(url, { waitUntil: "networkidle0" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: `screenshots/${name}.png` });
  console.log(`${name}: horizontal overflow = ${overflow}px`);
  await page.close();
}
await browser.close();
