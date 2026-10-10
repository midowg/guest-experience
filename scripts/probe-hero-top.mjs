// Development-only: find what sits above the opening section, if anything.
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const executablePath = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].find(path => existsSync(path));
const browser = await puppeteer.launch({ executablePath, headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(process.argv[2] ?? "http://localhost:3000/dev-preview", { waitUntil: "networkidle0" });
const report = await page.evaluate(() => {
  const hero = document.querySelector("main > section");
  const experience = document.querySelector("main").parentElement;
  return {
    heroTop: Math.round(hero.getBoundingClientRect().top),
    siblingsAboveMain: [...experience.children]
      .filter(el => el.tagName !== "MAIN")
      .map(el => ({ tag: el.tagName, cls: el.className.slice(0, 40), height: Math.round(el.getBoundingClientRect().height), position: getComputedStyle(el).position })),
  };
});
console.log(JSON.stringify(report, null, 2));
await browser.close();
process.exit(0);
