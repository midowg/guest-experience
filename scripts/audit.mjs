// Development-only accessibility and layout audit of the guest preview.
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
await page.setViewport({ width: 390, height: 844 });
await page.goto("http://localhost:3000/dev-preview", { waitUntil: "networkidle0" });

const report = await page.evaluate(() => {
  const issues = [];
  for (const control of document.querySelectorAll("input, select, textarea")) {
    if (control.type === "hidden") continue;
    const labelled = control.labels?.length || control.getAttribute("aria-label") || control.getAttribute("aria-labelledby");
    if (!labelled) issues.push(`unlabelled control: ${control.name || control.id || control.type}`);
  }
  for (const element of document.querySelectorAll("button, a[href], input, select, textarea")) {
    // A checkbox/radio inherits its hit area from a wrapping label, so measure that instead.
    const target = element.closest("label") ?? element;
    const box = target.getBoundingClientRect();
    if (box.width && box.height && box.height < 44) issues.push(`small target (${Math.round(box.height)}px): ${element.textContent?.trim().slice(0, 30) || element.name || element.type}`);
  }
  for (const img of document.querySelectorAll("img")) if (img.alt === null) issues.push("image without alt attribute");
  const headings = [...document.querySelectorAll("h1,h2,h3,h4")].map(h => Number(h.tagName[1]));
  let previous = 0;
  for (const level of headings) { if (previous && level > previous + 1) issues.push(`heading jump h${previous} -> h${level}`); previous = level; }
  return {
    issues,
    h1: document.querySelectorAll("h1").length,
    forms: document.querySelectorAll("form").length,
    disabledFieldsets: document.querySelectorAll("fieldset[disabled]").length,
    submitButtons: [...document.querySelectorAll('button[type="submit"]')].map(b => b.disabled),
    sections: [...document.querySelectorAll("main section[id]")].map(s => s.id),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});
console.log(JSON.stringify(report, null, 2));
await page.close();
await browser.close();
process.exit(0);
