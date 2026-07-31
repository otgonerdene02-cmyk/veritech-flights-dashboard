// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoDashboard, setTheme } = require('./helpers');

/**
 * "Бvс нутаг тус бvрийн зорчигч" ECharts treemap-ийн layout/overflow болон
 * region → country drill-down функцийг шалгах тест.
 *
 * Treemap нь `renderer:'svg'`-ээр vvсгэгддэг (docs/index.html, renderRegionTreemap)
 * тул дотоод rect/text-vvдийг нь энгийн DOM query-ээр шалгах боломжтой (canvas
 * renderer бол боломжгvй байх байсан).
 */

test.describe('region treemap', () => {
  test('container does not overflow its card', async ({ page }) => {
    await gotoDashboard(page);
    await page.waitForTimeout(500);

    const container = page.locator('#region-treemap');
    const card = container.locator('xpath=ancestor::*[contains(@class,"card")][1]');

    const containerBox = await container.boundingBox();
    const cardBox = await card.boundingBox();

    expect(containerBox).not.toBeNull();
    expect(cardBox).not.toBeNull();

    // Контейнер эцэг card-ийнхаа өргөнөөс хэтрэхгvй (хэвтээ scroll vvсгэхгvй)
    expect(containerBox.x).toBeGreaterThanOrEqual(cardBox.x - 1);
    expect(containerBox.x + containerBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);

    // Хуудасны бие даяараа хэвтээ scroll vvсгэхгvй эсэхийг шалгана
    const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasHorizontalScroll).toBe(false);
  });

  test('renders successfully with visible svg content', async ({ page }) => {
    await gotoDashboard(page);
    await page.waitForTimeout(500);

    const svgCount = await page.locator('#region-treemap svg').count();
    expect(svgCount).toBe(1);

    const shapeCount = await page.evaluate(() => document.querySelectorAll('#region-treemap path, #region-treemap rect').length);
    expect(shapeCount).toBeGreaterThan(0);

    const labelCount = await page.evaluate(() => document.querySelectorAll('#region-treemap text').length);
    expect(labelCount).toBeGreaterThan(0);
  });

  test('clicking a region drills down to its country breakdown', async ({ page }) => {
    await gotoDashboard(page);
    await page.waitForTimeout(500);

    const container = page.locator('#region-treemap');
    await container.scrollIntoViewIfNeeded();
    const box = await container.boundingBox();

    const labelsBefore = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#region-treemap text')).map((t) => t.textContent)
    );

    // Хамгийн том (áль хэдийн эрэмбэлэгдсэн) region зvvн дээд хэсэгт байрлах тул
    // тэнд дарна — тодорхой улсын нэр биш, зөвхөн ХАРАГДАХ ТЕКСТИЙН ОЛОНЛОГ
    // өөрчлөгдсөн эсэхийг шалгаж fragile болохоос сэргийлнэ.
    await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.3);
    await page.waitForTimeout(700);
    await page.mouse.move(box.x + box.width * 0.5, box.y + 2); // tooltip зайлуулах

    const labelsAfter = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#region-treemap text')).map((t) => t.textContent)
    );

    expect(labelsAfter.join('|')).not.toBe(labelsBefore.join('|'));

    // Drill-down хийсний дараа breadcrumb 2 (эсвэл түvнээс дээш) хэсэгтэй болно
    // (жишээ "Зvvн Ази" root context) -- өмнө нь ердөө root л байсан.
    const breadcrumbGrew = labelsAfter.length >= labelsBefore.length;
    expect(breadcrumbGrew).toBe(true);
  });

  for (const theme of ['light', 'dark']) {
    test(`upper label text is legible against its background (${theme} mode)`, async ({ page }) => {
      await gotoDashboard(page);
      await setTheme(page, theme);
      await page.waitForTimeout(500);

      const container = page.locator('#region-treemap');
      await container.scrollIntoViewIfNeeded();
      const box = await container.boundingBox();
      await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.3);
      await page.waitForTimeout(700);

      // upperLabel (drill хийсний дараа харагдах эцэг node-ийн нэр) текстийн
      // өнгө нь тухайн theme-ийн --text-primary-тай ЯГ тохирч байгаа эсэхийг
      // шалгана (theme бvрт өөр өнгөтэй тул "цагаан биш" гэх мэт статик шалгуур
      // dark mode-д буруу эерэг vр дvн өгнө -- theme-ийн бодит утгатай харьцуулна).
      const result = await page.evaluate(() => {
        const vizRoot = document.querySelector('.viz-root') || document.documentElement;
        const expected = getComputedStyle(vizRoot).getPropertyValue('--text-primary').trim();
        const texts = Array.from(document.querySelectorAll('#region-treemap text'));
        const t = texts.find((el) => el.textContent && el.textContent.indexOf('Ази') !== -1);
        return { actual: t ? getComputedStyle(t).fill : null, expected: expected };
      });

      // hex (#rrggbb) -> "rgb(r, g, b)" болгож харьцуулна (getComputedStyle нь
      // fill-ийг vргэлж rgb() хэлбэрээр буцаадаг тул)
      function hexToRgb(hex) {
        const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
        if (!m) return hex;
        return 'rgb(' + parseInt(m[1], 16) + ', ' + parseInt(m[2], 16) + ', ' + parseInt(m[3], 16) + ')';
      }

      expect(result.actual).not.toBeNull();
      expect(result.actual).toBe(hexToRgb(result.expected));
    });
  }
});
