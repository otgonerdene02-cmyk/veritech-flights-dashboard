// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoDashboard } = require('./helpers');

/**
 * Хуудасны эрүүл байдлын регресс тест.
 *
 * 1. Ачаалах үед JS алдаа (pageerror / console.error) гарахгүй — газрын зураг
 *    0 хэмжээтэй контейнерт зурагдахад echarts "drawImage ... width or height
 *    of 0" алдаа шиддэг байсан.
 * 2. "Сүүлд шинэчилсэн" огноо ЖЖЖЖ-СС-ӨӨ ЦЦ:ММ хэлбэртэй — toLocaleString('mn-MN')
 *    нь Chrome-д "10/12/2026, 6:02:06 AM" болж унадаг байсан.
 * 3. Харагдах текстэд кирилл үгийн дотор латин v/V байхгүй ("Шvvлт", "Бvгд").
 */

test('ачаалах үед JS алдаа гарахгүй', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await gotoDashboard(page);
  // "Дотоодын" шүүлт газрын зургийг Монгол руу шилжүүлж дахин зурдаг
  await page.click('.fchip[data-ou="ОН"]').catch(() => {});
  await page.waitForTimeout(500);
  // Гадаад CDN/topojson сүлжээний алдааг (fixture серверт байхгүй) тооцохгүй
  expect(errors.filter((e) => !/Failed to load resource|net::ERR/.test(e))).toEqual([]);
});

test('"Сүүлд шинэчилсэн" ЖЖЖЖ-СС-ӨӨ ЦЦ:ММ хэлбэртэй', async ({ page }) => {
  await gotoDashboard(page);
  const txt = await page.locator('#updated-at').textContent();
  expect(txt).toMatch(/Сүүлд шинэчилсэн: \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  expect(txt).not.toMatch(/AM|PM|\d+\/\d+\/\d{4}/);
});

test('харагдах текстэд кирилл үгийн дотор латин v байхгүй', async ({ page }) => {
  await gotoDashboard(page);
  const bad = await page.evaluate(() => {
    const re = /[А-Яа-яЁёӨөҮү][vV]|[vV][А-Яа-яЁёӨөҮү]/;
    const out = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      const p = walk.currentNode.parentElement;
      if (p && (p.tagName === 'SCRIPT' || p.tagName === 'STYLE')) continue;
      const t = walk.currentNode.textContent || '';
      if (re.test(t)) out.push(t.trim().slice(0, 60));
    }
    document.querySelectorAll('[title],[aria-label],[placeholder]').forEach((el) => {
      ['title', 'aria-label', 'placeholder'].forEach((a) => {
        const v = el.getAttribute(a);
        if (v && re.test(v)) out.push(a + '=' + v.slice(0, 60));
      });
    });
    return out;
  });
  expect(bad).toEqual([]);
});

test('гар утсанд (375px) нислэгийн жагсаалт карт болж, хуудас хажуу тийш гүйхгүй', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await gotoDashboard(page);
  const r = await page.evaluate(() => {
    const cards = document.querySelectorAll('#mcards .mcard');
    const wide = [...cards].filter((c) => c.getBoundingClientRect().right > window.innerWidth + 1).length;
    return {
      docW: document.documentElement.scrollWidth, vw: window.innerWidth,
      cards: cards.length, wide,
      table: getComputedStyle(document.querySelector('.table-scroll')).display,
    };
  });
  expect(r.table).toBe('none');
  expect(r.cards).toBeGreaterThan(0);
  expect(r.wide).toBe(0);
  expect(r.docW).toBeLessThanOrEqual(r.vw);
});

test('өмнөх онуудын ачааллын текст 0-ээс эхэлсэн тоо харуулахгүй', async ({ page }) => {
  const seen = [];
  await page.exposeFunction('__hs', (t) => seen.push(t));
  await page.addInitScript(() => {
    new MutationObserver(() => {
      const el = document.getElementById('history-status');
      if (el) window.__hs(el.textContent);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await gotoDashboard(page);
  await page.waitForTimeout(500);
  expect(seen.filter((t) => /\(0\//.test(t))).toEqual([]);
});
