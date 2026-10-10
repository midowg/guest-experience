// Development-only: capture individual guest sections for visual review.
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

const browser = await puppeteer.launch({ executablePath, headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
await page.goto("http://localhost:3000/dev-preview", { waitUntil: "networkidle0" });
for (const id of process.argv.slice(2)) {
  const element = await page.$(`#${id}`);
  if (!element) { console.log(`missing section: ${id}`); continue; }
  await element.screenshot({ path: `screenshots/section-${id}.png` });
  console.log(`captured ${id}`);
}
await browser.close();
