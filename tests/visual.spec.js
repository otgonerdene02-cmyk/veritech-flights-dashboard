// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoDashboard, setTheme } = require('./helpers');

/**
 * Screenshot-based visual regression тест.
 *
 * Тогтмол fixture dataset (tests/fixtures/flights.sample.json) дээр ажилладаг
 * тул docs/flights.json-ийн өдөр тутмын автомат шинэчлэлтээс vл хамааран
 * тогтвортой vр дvн өгнө. "updated-at" цагийн тэмдэглэгээ vргэлж өөрчлөгдөх
 * боломжтой тул screenshot-оос mask-лагдана.
 *
 * Анхны (baseline) зурган файлыг vvсгэхийн тулд:
 *   npx playwright test --update-snapshots
 */

test.describe('dashboard visual regression', () => {
  for (const theme of ['light', 'dark']) {
    test(`full dashboard — ${theme} mode`, async ({ page }) => {
      await gotoDashboard(page);
      await setTheme(page, theme);
      await page.waitForTimeout(500); // chart/animation бvрэн дуусахыг хvлээнэ

      await expect(page).toHaveScreenshot(`dashboard-full-${theme}.png`, {
        fullPage: true,
        mask: [page.locator('#updated-at')],
      });
    });

    test(`breakdown tables — ${theme} mode`, async ({ page }) => {
      await gotoDashboard(page);
      await setTheme(page, theme);
      await page.waitForTimeout(300);

      const section = page.locator('#carrier-wrap').locator('xpath=ancestor::*[contains(@class,"row2")][1]');
      await expect(section).toHaveScreenshot(`breakdown-tables-${theme}.png`);
    });

    test(`KPI grid — ${theme} mode`, async ({ page }) => {
      await gotoDashboard(page);
      await setTheme(page, theme);
      await page.waitForTimeout(300);

      await expect(page.locator('.kpi-grid')).toHaveScreenshot(`kpi-grid-${theme}.png`);
    });

    test(`flights table — ${theme} mode`, async ({ page }) => {
      await gotoDashboard(page);
      await setTheme(page, theme);
      await page.waitForTimeout(300);

      await expect(page.locator('table.flights').locator('xpath=ancestor::*[contains(@class,"card")][1]')).toHaveScreenshot(`flights-table-${theme}.png`);
    });
  }
});
