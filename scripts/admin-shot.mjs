// Development-only: render the hero-control block of the editor without a live Supabase
// session, so the side-by-side preview can be reviewed visually.
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

const url = process.argv[2];
const selector = process.argv[3];
const name = process.argv[4] ?? "admin";
const browser = await puppeteer.launch({ executablePath, headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1000 });
const response = await page.goto(url, { waitUntil: "networkidle0" });
console.log("status:", response?.status());
const target = selector ? await page.$(selector) : null;
if (selector && !target) {
  console.log("selector tidak ditemukan:", selector);
  await page.screenshot({ path: `screenshots/${name}.png` });
} else {
  await (target ?? page).screenshot({ path: `screenshots/${name}.png` });
}
console.log("tersimpan:", `screenshots/${name}.png`);
await browser.close();
process.exit(0);
