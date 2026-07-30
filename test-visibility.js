#!/usr/bin/env node
/**
 * test-visibility.js
 *
 * Dashboard-ийн light/dark mode хоёуланд текст, тоон утгуудын
 * харагдах чадварыг (WCAG contrast ratio >= 4.5:1) шалгана.
 *
 * Шалгах элементvvд:
 *   - KPI карт бvр (утга, шошго, дэд бичвэр)
 *   - Filter bar-ийн label бvр, filter chip бvр
 *   - Задаргааны хvснэгтvvдийн (тээвэрлэгч / улс) мөр бvр
 *   - Нислэгийн жагсаалт хvснэгтийн толгой болон мөр бvр
 *
 * Ажиллуулах:
 *   node test-visibility.js
 *
 * Гаралт:
 *   - Console дээр FAIL/PASS хvснэгт
 *   - screenshots/light.png, screenshots/dark.png (харьцуулах зурган баримт)
 *   - Аль нэг элемент FAIL бол process.exitCode = 1 (CI-д ашиглаж болно)
 */

const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');

const DOCS_DIR = path.join(__dirname, 'docs');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const PORT = 4173;
const MIN_RATIO = 4.5;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function startServer() {
  const server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.join(DOCS_DIR, decodeURIComponent(urlPath));
    if (!filePath.startsWith(DOCS_DIR)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found: ' + urlPath);
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

/**
 * Browser context-д ажиллах contrast тооцооллын функцvvд.
 * DOM-оос уншсан бодит computed color/background-ийг ашиглана
 * (transparent давхаргуудыг эцэг элементvvд рvv шилжиж нэгтгэнэ).
 */
function collectResults(page) {
  return page.evaluate((MIN_RATIO) => {
    function parseColor(str) {
      if (!str) return { r: 0, g: 0, b: 0, a: 0 };
      const m = str.match(/rgba?\(([^)]+)\)/);
      if (!m) return { r: 0, g: 0, b: 0, a: 0 };
      const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    }

    function compositeOver(top, bottom) {
      const a = top.a + bottom.a * (1 - top.a);
      if (a === 0) return { r: 255, g: 255, b: 255, a: 0 };
      return {
        r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a,
        g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a,
        b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a,
        a,
      };
    }

    function effectiveBackground(el) {
      const layers = [];
      let node = el;
      while (node) {
        const cs = getComputedStyle(node);
        const bg = parseColor(cs.backgroundColor);
        if (bg.a > 0) layers.push(bg);
        if (bg.a >= 0.999) break;
        node = node.parentElement;
      }
      let acc = { r: 255, g: 255, b: 255, a: 1 }; // backstop
      for (let i = layers.length - 1; i >= 0; i--) acc = compositeOver(layers[i], acc);
      return acc;
    }

    function luminance(c) {
      const srgb = [c.r, c.g, c.b].map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
    }

    function contrastRatio(c1, c2) {
      const L1 = luminance(c1) + 0.05;
      const L2 = luminance(c2) + 0.05;
      return L1 > L2 ? L1 / L2 : L2 / L1;
    }

    function isVisible(el) {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) return false;
      return true;
    }

    function selectorFor(el) {
      if (el.id) return '#' + el.id;
      const parts = [];
      let node = el;
      while (node && node.nodeType === 1 && parts.length < 4) {
        let part = node.tagName.toLowerCase();
        if (typeof node.className === 'string' && node.className.trim()) {
          part += '.' + node.className.trim().split(/\s+/).join('.');
        }
        parts.unshift(part);
        node = node.parentElement;
      }
      return parts.join(' > ');
    }

    function rgbStr(c) {
      return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
    }

    const results = [];
    function check(el, category) {
      if (!isVisible(el)) return;
      const text = (el.textContent || '').trim();
      if (!text) return;
      const cs = getComputedStyle(el);
      const fg = parseColor(cs.color);
      const bg = effectiveBackground(el);
      const ratio = Math.round(contrastRatio(fg, bg) * 100) / 100;
      results.push({
        category,
        selector: selectorFor(el),
        text: text.length > 40 ? text.slice(0, 40) + '…' : text,
        color: cs.color,
        background: rgbStr(bg),
        ratio,
        pass: ratio >= MIN_RATIO,
      });
    }

    // 1. KPI карт бvр
    document.querySelectorAll('.kpi').forEach((card, i) => {
      card.querySelectorAll('.v, .l, .sub').forEach((el) => check(el, `KPI карт #${i + 1}`));
    });

    // 2. Filter bar label / chip бvр
    document.querySelectorAll('.flabel').forEach((el) => check(el, 'Filter label'));
    document.querySelectorAll('.fchip').forEach((el) => check(el, 'Filter chip'));

    // 3. Задаргааны хvснэгтvvд (тээвэрлэгч / улс) — мөр бvр
    document.querySelectorAll('.tbl-row').forEach((row, i) => {
      row.querySelectorAll('.tbl-label, .tbl-val .n, .tbl-val .p').forEach((el) => check(el, `Задаргааны мөр #${i + 1}`));
    });

    // 4. Нислэгийн жагсаалт хvснэгт — толгой болон мөр бvр
    document.querySelectorAll('table.flights thead th').forEach((el) => check(el, 'Хvснэгтийн толгой'));
    document.querySelectorAll('table.flights tbody tr').forEach((row, i) => {
      row.querySelectorAll('td').forEach((el) => check(el, `Хvснэгтийн мөр #${i + 1}`));
    });

    return results;
  }, MIN_RATIO);
}

async function waitForData(page) {
  await page.waitForSelector('.kpi');
  await page.waitForFunction(
    () => {
      const el = document.getElementById('updated-at');
      return el && el.textContent && el.textContent.indexOf('Ачааллаж байна') === -1;
    },
    { timeout: 30000 }
  );
  await page.waitForTimeout(300);
}

function printReport(title, results) {
  const fails = results.filter((r) => !r.pass);
  console.log('\n' + '='.repeat(70));
  console.log(title + `  (${results.length} элемент шалгасан, ${fails.length} FAIL)`);
  console.log('='.repeat(70));
  if (fails.length === 0) {
    console.log('  Бvгд PASS ✅');
    return fails;
  }
  console.log(
    ['Категори', 'Selector', 'Текст', 'Өнгө (color)', 'Дэвсгэр (bg)', 'Ratio'].join(' | ')
  );
  fails.forEach((r) => {
    console.log(
      `FAIL | ${r.category} | ${r.selector} | "${r.text}" | ${r.color} | ${r.background} | ${r.ratio}:1`
    );
  });
  return fails;
}

async function run() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  let allFails = [];

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

    // ---- Light mode ----
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await waitForData(page);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'light.png'), fullPage: true });
    const lightResults = await collectResults(page);
    const lightFails = printReport('LIGHT MODE', lightResults);
    allFails = allFails.concat(lightFails.map((r) => ({ ...r, mode: 'light' })));

    // ---- Dark mode (Харанхуй горим товч дарах) ----
    await page.click('#theme-toggle');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dark.png'), fullPage: true });
    const darkResults = await collectResults(page);
    const darkFails = printReport('DARK MODE', darkResults);
    allFails = allFails.concat(darkFails.map((r) => ({ ...r, mode: 'dark' })));

    console.log('\n' + '='.repeat(70));
    console.log(`НИЙТ ДvН: ${allFails.length} FAIL (light: ${lightFails.length}, dark: ${darkFails.length})`);
    console.log('Screenshots: ' + SCREENSHOT_DIR);
    console.log('='.repeat(70));

    if (allFails.length > 0) {
      console.log('\nДЭЛГЭРЭНГvй FAIL ЖАГСААЛТ:');
      console.table(
        allFails.map((r) => ({
          Горим: r.mode,
          Категори: r.category,
          Selector: r.selector,
          Текст: r.text,
          Color: r.color,
          Background: r.background,
          Ratio: r.ratio,
        }))
      );
    }
  } finally {
    await browser.close();
    server.close();
  }

  process.exitCode = allFails.length > 0 ? 1 : 0;
}

run().catch((err) => {
  console.error('Тест ажиллуулахад алдаа гарлаа:', err);
  process.exitCode = 1;
});
