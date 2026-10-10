// Development-only: render the Loading component directly so the spinner and its text can
// be reviewed. Throttling a real navigation is unreliable; this shows the actual markup.
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
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 520 });
// Headless Chrome reports reduce-motion by default, which would hide the spin entirely.
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
await page.goto("http://localhost:3000/dev-preview/loading-demo", { waitUntil: "networkidle0" });
await new Promise(resolve => setTimeout(resolve, 300));

const report = await page.evaluate(() => {
  const status = document.querySelector('[role="status"]');
  const ring = status?.querySelector("span");
  const style = ring ? getComputedStyle(ring) : null;
  return {
    announcedText: status?.textContent?.trim(),
    live: status?.getAttribute("aria-live"),
    ringIsRound: style?.borderRadius === "50%",
    ringAnimates: (style?.animationName ?? "none") !== "none",
    ringHiddenFromScreenReader: ring?.getAttribute("aria-hidden") === "true",
  };
});

// And confirm the reduce-motion path really does stop the spin.
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
await new Promise(resolve => setTimeout(resolve, 200));
const reduced = await page.evaluate(() => {
  const ring = document.querySelector('[role="status"] span');
  return { ringAnimatesUnderReduceMotion: getComputedStyle(ring).animationName !== "none" };
});
Object.assign(report, reduced);
console.log(JSON.stringify(report, null, 2));
await page.screenshot({ path: "screenshots/loading.png" });
await browser.close();
process.exit(0);
