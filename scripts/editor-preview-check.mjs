import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser = await puppeteer.launch({ executablePath, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
try {
  await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle0' });
  results.push(['admin without login', new URL(page.url()).pathname === '/admin']);
  const href = await page.evaluate(() => [...document.querySelectorAll('a')].map(a => a.getAttribute('href')).find(h => /^\/admin\/events\/[^/]+$/.test(h)));
  if (!href) throw new Error('No existing event link; no event will be created by this check.');
  await page.goto(`http://localhost:3000${href}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('iframe');
  const iframe = await page.$('iframe');
  const frame = await iframe.contentFrame();
  await frame.waitForSelector('[data-invitation-hero]');
  results.push(['real hero frame rendered', true]);
  results.push(['header and standalone venue fields removed', await page.evaluate(() => !document.querySelector('input#venue_image_url') && ![...document.querySelectorAll('button')].some(b => b.textContent.includes('Keluar')))]);
  // Local state only: intercept the sample photo so this test never uploads or saves anything.
  await page.setRequestInterception(true);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1500"><rect width="2400" height="1500" fill="#67a3bd"/><circle cx="700" cy="750" r="350" fill="#dabc7b"/><rect x="1600" width="800" height="1500" fill="#173d70"/></svg>';
  page.on('request', req => req.url() === 'https://preview.example.test/photo.svg' ? req.respond({ status: 200, contentType: 'image/svg+xml', body: svg }) : req.continue());
  await page.evaluate(() => {
    const block = document.querySelector('#hero');
    const link = [...block.querySelectorAll('button')].find(b => /tautan|url/i.test(b.textContent));
    link?.click();
  });
  await page.waitForSelector('input[id="hero.url"]');
  await page.evaluate(() => {
    const input = document.querySelector('input[id="hero.url"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'https://preview.example.test/photo.svg');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await frame.waitForSelector('[data-hero-photo]');
  await frame.waitForFunction(() => document.querySelector('[data-hero-photo]').naturalWidth > 0);
  const click = async text => page.evaluate(text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text)?.click(), text);
  await click('Atur foto');
  await page.waitForSelector('input[type=range]');
  await page.evaluate(() => {
    const zoom = [...document.querySelectorAll('input[type=range]')].find(i => i.max === '3');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(zoom, '2');
    zoom.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await frame.waitForFunction(() => document.querySelector('[data-hero-photo]').style.getPropertyValue('--mobile-zoom') === '2');
  results.push(['mobile zoom updates live', true]);
  await click('Desktop');
  await frame.waitForFunction(() => innerWidth === 1440);
  results.push(['desktop framing independent', await frame.evaluate(() => getComputedStyle(document.querySelector('[data-hero-photo]')).transform === 'matrix(1, 0, 0, 1, 0, 0)')]);
  await click('HP');
  await frame.waitForFunction(() => innerWidth === 390);
  results.push(['mobile zoom retained', await frame.evaluate(() => getComputedStyle(document.querySelector('[data-hero-photo]')).transform === 'matrix(2, 0, 0, 2, 0, 0)')]);
  const before = await frame.evaluate(() => document.querySelector('[data-hero-photo]').style.getPropertyValue('--mobile-x'));
  const box = await iframe.boundingBox();
  await page.mouse.move(box.x + 100, box.y + 180);
  await page.mouse.down(); await page.mouse.move(box.x + 160, box.y + 180, { steps: 8 }); await page.mouse.up();
  await frame.waitForFunction(previous => document.querySelector('[data-hero-photo]').style.getPropertyValue('--mobile-x') !== previous, {}, before);
  results.push(['drag updates framing', true]);
  await page.screenshot({ path: 'screenshots/editor-real-preview.png', fullPage: false });
  results.push(['review instructions present', await page.evaluate(() => document.querySelector('#review').textContent.includes('Minta ulasan'))]);
  results.push(['delete buttons danger styled', await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => /Hapus/.test(b.textContent)).every(b => b.classList.contains('button--danger') && b.querySelector('svg')))]);
  results.push(['no runtime errors', errors.length === 0]);
  console.table(results.map(([check, passed]) => ({ check, passed })));
  if (errors.length) console.log(errors);
  if (results.some(([, passed]) => !passed)) process.exitCode = 1;
} finally { await browser.close(); }
