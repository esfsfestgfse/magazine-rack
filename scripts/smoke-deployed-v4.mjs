import { chromium } from 'playwright';

const baseUrl = process.env.MAGAZINE_RACK_URL || 'https://esfsfestgfse.github.io/magazine-rack/index.html';
const release = process.env.GITHUB_SHA || `smoke-${Date.now()}`;
const targetUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}release=${encodeURIComponent(release)}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const failures = [];

function snapshot() {
  return page.evaluate(() => [...document.querySelectorAll('#shelves > .shelf')].map((element, index) => ({
    index,
    id: element.id.replace(/^shelf-/, ''),
    cards: element.querySelectorAll('.cover-card').length,
    loading: [...element.querySelectorAll('.shelf-loading')].some((node) => node.offsetParent !== null),
    empty: Boolean(element.querySelector('.shelf-empty')),
    diagnostic: Boolean(element.querySelector('.shelf-empty.shelf-error')),
    title: element.querySelector('.shelf-title')?.textContent?.trim() || '',
  })));
}

try {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(() => document.querySelectorAll('#shelves > .shelf').length === 52, null, { timeout: 30_000 });
  await page.waitForTimeout(45_000);

  const shelves = await snapshot();
  const silent = shelves.filter((shelf) => !shelf.cards && !shelf.loading && !shelf.diagnostic);
  const stuck = shelves.filter((shelf) => shelf.loading);
  if (shelves.length !== 52) failures.push(`expected 52 shelves, found ${shelves.length}`);
  if (stuck.length) failures.push(`shelves stuck loading: ${stuck.map((shelf) => shelf.id).join(', ')}`);
  if (silent.length) failures.push(`silent empty shelves: ${silent.map((shelf) => shelf.id).join(', ')}`);

  const adultOrder = shelves.map((shelf) => shelf.id);
  if (adultOrder.indexOf('adult-mags') < adultOrder.length - 4 || adultOrder.indexOf('adult-comics') < adultOrder.length - 3) {
    failures.push('restricted shelves are not at the end');
  }

  const readerCandidates = page.locator('#shelf-magazine-rack .cover-card, #shelf-comics .cover-card, #shelf-scifi .cover-card');
  let readerOpened = false;
  for (let index = 0; index < Math.min(await readerCandidates.count(), 12) && !readerOpened; index += 1) {
    await readerCandidates.nth(index).click();
    const readInApp = page.getByRole('button', { name: 'Read in App', exact: true });
    if (await readInApp.count()) {
      await readInApp.click();
      await page.waitForTimeout(750);
      readerOpened = Boolean(await page.locator('#reader.reader-overlay.open').count());
      if (!readerOpened) failures.push('reader action did not open the reader');
      if (readerOpened) {
        const before = await page.locator('#reader-position').textContent();
        const next = page.locator('#reader-next');
        if (await next.isEnabled()) {
          await next.click();
          await page.waitForTimeout(400);
          const after = await page.locator('#reader-position').textContent();
          if (before === after) failures.push('reader next-issue navigation did not advance');
        }
        await page.locator('#reader-close').click();
      }
    } else {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
    }
  }
  if (!readerOpened) failures.push('No tested card exposed an in-app reader action');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(() => document.querySelectorAll('#shelves > .shelf').length === 52, null, { timeout: 30_000 });
  const mobile = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    bottomNav: Boolean(document.querySelector('.bottom-nav')),
  }));
  if (mobile.overflow) failures.push(`mobile horizontal overflow: ${mobile.scrollWidth}px at ${mobile.viewport}px`);
  if (!mobile.bottomNav) failures.push('mobile bottom navigation is missing');

  console.log(JSON.stringify({ ok: failures.length === 0, targetUrl, shelfCount: shelves.length, silent, stuck, mobile }, null, 2));
  if (failures.length) {
    console.error(JSON.stringify({ failures }, null, 2));
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
