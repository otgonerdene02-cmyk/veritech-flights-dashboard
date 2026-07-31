// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoDashboard, setTheme, rectsOverlap } = require('./helpers');

/**
 * Давхцлын (overlap) регресс тест.
 *
 * 2026-07-30-ны rem-based font шинэчлэлтийн дараа задаргааны хvснэгтийн
 * (тээвэрлэгч/улс) тогтмол `height`-тэй мөрvvд дэх хос мөр контент
 * (тоон утга + хувь) багтаагvйгээс шалтгаалж, эхний мөрийн том тоон утга
 * шууд дээрх толгой мөртэй ("Харьцаа", "Зорчигч") давхцаж харагдах болсон
 * асуудлыг vvсгэсэн (docs/index.html-ийн .tbl-hdr/.tbl-row/.tbl-ftr).
 *
 * Энэ тест бvлэг ижил төрлийн "тогтмол өндөртэй контейнер дэх текст
 * давхцах" асуудлыг ирээдvйд аль ч CSS/font өөрчлөлт дахин vvсгэвэл
 * шvvж илрvvлнэ.
 */

const BREAKDOWN_WRAPS = ['#carrier-wrap', '#country-wrap'];
const THEMES = ['light', 'dark'];

for (const theme of THEMES) {
  test.describe(`${theme} mode — overlap detection`, () => {
    test.beforeEach(async ({ page }) => {
      await gotoDashboard(page);
      await setTheme(page, theme);
    });

    for (const wrapSel of BREAKDOWN_WRAPS) {
      test(`breakdown table header does not overlap first data row (${wrapSel})`, async ({ page }) => {
        const hdr = page.locator(`${wrapSel} .tbl-hdr`);
        const firstRow = page.locator(`${wrapSel} .tbl-row`).first();
        await expect(hdr).toBeVisible();
        await expect(firstRow).toBeVisible();

        const hdrBox = await hdr.boundingBox();
        const rowBox = await firstRow.boundingBox();
        expect(rectsOverlap(hdrBox, rowBox)).toBe(false);
      });

      test(`breakdown table rows do not overlap each other (${wrapSel})`, async ({ page }) => {
        const rows = page.locator(`${wrapSel} .tbl-row`);
        const count = await rows.count();
        expect(count).toBeGreaterThan(0);

        const boxes = [];
        for (let i = 0; i < count; i++) boxes.push(await rows.nth(i).boundingBox());

        for (let i = 0; i < boxes.length - 1; i++) {
          expect(rectsOverlap(boxes[i], boxes[i + 1])).toBe(false);
        }
      });

      test(`breakdown table footer does not overlap last data row (${wrapSel})`, async ({ page }) => {
        const ftr = page.locator(`${wrapSel} .tbl-ftr`);
        const rows = page.locator(`${wrapSel} .tbl-row`);
        const lastRow = rows.last();
        await expect(ftr).toBeVisible();

        const ftrBox = await ftr.boundingBox();
        const lastRowBox = await lastRow.boundingBox();
        expect(rectsOverlap(ftrBox, lastRowBox)).toBe(false);
      });

      test(`numeric value and its header label do not overlap (${wrapSel})`, async ({ page }) => {
        // Яг тохиолдсон алдааг шууд хардаг тест: "660,660" маягийн том тоон
        // утга (.tbl-val .n) нь толгой мөрийн шошготой (.tbl-hdr) давхцах ёсгvй.
        const valueEls = page.locator(`${wrapSel} .tbl-row .tbl-val .n`);
        const hdr = page.locator(`${wrapSel} .tbl-hdr`);
        const hdrBox = await hdr.boundingBox();
        const count = await valueEls.count();
        for (let i = 0; i < count; i++) {
          const valBox = await valueEls.nth(i).boundingBox();
          expect(rectsOverlap(hdrBox, valBox)).toBe(false);
        }
      });
    }

    test('flights table header does not overlap body rows', async ({ page }) => {
      const headerCells = page.locator('table.flights thead th');
      const bodyRows = page.locator('table.flights tbody tr');
      const headerCount = await headerCells.count();
      expect(headerCount).toBeGreaterThan(0);
      const headerBoxes = [];
      for (let i = 0; i < headerCount; i++) headerBoxes.push(await headerCells.nth(i).boundingBox());

      const rowCount = Math.min(await bodyRows.count(), 5);
      for (let r = 0; r < rowCount; r++) {
        const rowBox = await bodyRows.nth(r).boundingBox();
        for (const hBox of headerBoxes) {
          expect(rectsOverlap(hBox, rowBox)).toBe(false);
        }
      }
    });

    test('KPI card value and label do not overlap', async ({ page }) => {
      const cards = page.locator('.kpi');
      const count = await cards.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const card = cards.nth(i);
        const valueBox = await card.locator('.v').boundingBox();
        const labelBox = await card.locator('.l').boundingBox();
        expect(rectsOverlap(valueBox, labelBox)).toBe(false);
      }
    });
  });
}
