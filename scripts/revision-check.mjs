// Development-only: verify this round of revisions in a real browser — the venue photo
// bug, the two text positions, the back-to-top button, and reduced-motion behaviour.
import { existsSync, mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const executablePath = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].find(path => existsSync(path));
if (!executablePath) { console.log("NO_BROWSER_FOUND"); process.exit(2); }
mkdirSync("screenshots", { recursive: true });

const base = "http://localhost:3000/dev-preview?preview=0";
const browser = await puppeteer.launch({ executablePath, headless: "new" });
const rows = [];

async function open(query, width = 390, height = 844) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
  await page.goto(`${base}&${query}`, { waitUntil: "networkidle0" });
  await new Promise(resolve => setTimeout(resolve, 500));
  return page;
}

const countPhotos = (page) => page.evaluate(() => {
  const section = document.querySelector("#location");
  const images = [...section.querySelectorAll("img")];
  return { total: images.length, urls: images.map(img => img.getAttribute("src")) };
});

// 1. The reported bug: a venue photo must not disappear once the gallery has photos.
for (const [label, query, expected] of [
  ["foto lokasi saja", "photos=0&venue=1", 1],
  ["galeri saja", "photos=2&venue=0", 2],
  ["keduanya bersama", "photos=2&venue=1", 3],
]) {
  const page = await open(query);
  const found = await countPhotos(page);
  rows.push({ pemeriksaan: `Foto lokasi — ${label}`, hasil: found.total === expected ? "OK" : "GAGAL", catatan: `${found.total} foto (diharapkan ${expected})` });
  const unique = new Set(found.urls).size === found.urls.length;
  if (label === "keduanya bersama") rows.push({ pemeriksaan: "Tidak ada foto ganda", hasil: unique ? "OK" : "GAGAL", catatan: unique ? "semua URL berbeda" : "ada URL berulang" });
  await page.close();
}

// 2. Two text positions, and nothing left of the old four.
for (const position of ["left", "center"]) {
  const page = await open(`pos=${position}`);
  const measured = await page.evaluate(() => {
    const inner = document.querySelector('[class*="heroInner"]');
    const frame = inner.getBoundingClientRect();
    const offsets = [...inner.children].filter(el => el.getBoundingClientRect().width > 0)
      .map(el => { const box = el.getBoundingClientRect(); return Math.round(Math.abs((box.left - frame.left) - (frame.right - box.right))); });
    return { worst: Math.max(...offsets), hasScrim: !!document.querySelector('[class*="heroScrim"]') };
  });
  const ok = position === "center" ? measured.worst <= 2 : measured.worst > 2;
  rows.push({ pemeriksaan: `Posisi teks ${position}`, hasil: ok && measured.hasScrim ? "OK" : "GAGAL", catatan: `selisih ${measured.worst}px, lapisan redup ${measured.hasScrim ? "ada" : "hilang"}` });
  await page.screenshot({ path: `screenshots/revision-${position}.png` });
  await page.close();
}

// 3. Back to top: absent at the opening, present after scrolling, big enough to tap.
{
  const page = await open("photos=2&venue=1");
  const read = () => page.evaluate(() => {
    // It is an anchor, not a button: match on the accessible name, not the tag.
    const button = [...document.querySelectorAll("a, button")].find(el => /kembali ke atas/i.test(el.getAttribute("aria-label") ?? ""));
    if (!button) return { exists: false };
    const box = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return { exists: true, visible: style.visibility !== "hidden" && style.opacity !== "0", height: Math.round(box.height), width: Math.round(box.width) };
  });
  const atTop = await read();
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 3));
  await new Promise(resolve => setTimeout(resolve, 600));
  const scrolled = await read();
  rows.push({ pemeriksaan: "Tombol kembali ke atas", hasil: atTop.exists && !atTop.visible && scrolled.visible ? "OK" : "GAGAL", catatan: `awal ${atTop.visible ? "tampil" : "tersembunyi"}, setelah scroll ${scrolled.visible ? "tampil" : "tersembunyi"}` });
  rows.push({ pemeriksaan: "Target sentuh tombol", hasil: scrolled.height >= 44 && scrolled.width >= 44 ? "OK" : "GAGAL", catatan: `${scrolled.width}×${scrolled.height}px` });
  await page.screenshot({ path: "screenshots/revision-backtotop.png" });
  await page.close();
}

// 4. Reduced motion must leave every section readable, not faded out.
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.goto(`${base}&photos=2&venue=1`, { waitUntil: "networkidle0" });
  await new Promise(resolve => setTimeout(resolve, 500));
  const faded = await page.evaluate(() => [...document.querySelectorAll("main section")]
    .filter(section => Number(getComputedStyle(section).opacity) < 0.99).length);
  rows.push({ pemeriksaan: "Reduced motion: semua bagian terbaca", hasil: faded === 0 ? "OK" : "GAGAL", catatan: faded === 0 ? "tidak ada bagian yang pudar" : `${faded} bagian pudar` });
  await page.close();
}

// 5. No horizontal overflow anywhere.
{
  const page = await open("photos=2&venue=1");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(resolve => setTimeout(resolve, 400));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  rows.push({ pemeriksaan: "Tanpa overflow horizontal (390px)", hasil: overflow <= 0 ? "OK" : "GAGAL", catatan: `${overflow}px` });
  await page.close();
}

await browser.close();
console.table(rows);
const failed = rows.filter(row => row.hasil === "GAGAL");
console.log(failed.length ? `${failed.length} PEMERIKSAAN GAGAL` : "Semua pemeriksaan revisi lolos.");
process.exit(0);
