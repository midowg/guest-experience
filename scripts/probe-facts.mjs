// Development-only: report what the browser actually computes for a fact row on a phone.
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const executablePath = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].find(path => existsSync(path));
const browser = await puppeteer.launch({ executablePath, headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
await page.goto("http://localhost:3000/dev-preview?preview=0&pos=center-center", { waitUntil: "networkidle0" });
await new Promise(resolve => setTimeout(resolve, 400));

console.log(JSON.stringify(await page.evaluate(() => {
  const item = document.querySelector('[class*="heroMetaItem"]');
  const meta = document.querySelector('[class*="heroMeta"]');
  const label = item.querySelector("span");
  const inner = item.querySelector("div");
  const box = (el) => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) }; };
  return {
    metaFlexDirection: getComputedStyle(meta).flexDirection,
    itemTextAlign: getComputedStyle(item).textAlign,
    itemJustify: getComputedStyle(item).justifyContent,
    itemWidth: Math.round(item.getBoundingClientRect().width),
    itemBox: box(item),
    labelBox: box(label),
    innerDivBox: inner ? box(inner) : null,
    innerDivDisplay: inner ? getComputedStyle(inner).display : null,
  };
}, null, 2), null, 2));
await browser.close();
process.exit(0);
