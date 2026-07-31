/**
 * Playwright тестvvдэд зориулсан туслах функцvvд.
 */

async function gotoDashboard(page) {
  await page.goto('/index.html');
  await waitForData(page);
}

async function waitForData(page) {
  await page.waitForSelector('.kpi');
  await page.waitForFunction(() => {
    const el = document.getElementById('updated-at');
    return el && el.textContent && el.textContent.indexOf('Ачааллаж байна') === -1;
  }, { timeout: 30000 });
  // Chart.js/ECharts animation-ууд дуусахыг хvлээнэ
  await page.waitForTimeout(400);
}

async function setTheme(page, theme) {
  const current = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  if (theme === 'dark' && current !== 'dark') {
    await page.click('#theme-toggle');
    await page.waitForTimeout(300);
  } else if (theme === 'light' && current === 'dark') {
    await page.click('#theme-toggle');
    await page.waitForTimeout(300);
  }
}

/**
 * Хоёр элементийн bounding rect огтлолцож байгаа эсэхийг шалгана.
 * `tolerance`-аар хиллэж давхцаж буй (1-2px anti-aliasing зөрvv) тохиолдлыг vл тооцно.
 */
function rectsOverlap(a, b, tolerance = 1) {
  if (!a || !b) return false;
  if (a.width === 0 || a.height === 0 || b.width === 0 || b.height === 0) return false;
  const ax1 = a.x + tolerance, ax2 = a.x + a.width - tolerance;
  const ay1 = a.y + tolerance, ay2 = a.y + a.height - tolerance;
  const bx1 = b.x + tolerance, bx2 = b.x + b.width - tolerance;
  const by1 = b.y + tolerance, by2 = b.y + b.height - tolerance;
  return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
}

module.exports = { gotoDashboard, waitForData, setTheme, rectsOverlap };
