#!/usr/bin/env node
/**
 * Playwright тестvvдэд зориулсан статик сервер.
 *
 * docs/ директорийг shvvж vzvvlnэ, гэхдээ dashboard-ийн уншдаг flights-index.json
 * болон flights-<year>.json хvсэлтvvдийг tests/fixtures/flights.sample.json
 * (тогтмол, commit хийгдсэн dataset) рvv чиглvvлнэ — vнэн зvvдэй docs/-ийн
 * flights-*.json файлууд нь CI-с өдөр бvр автоматаар шинэчлэгддэг тул visual
 * regression тестvvд өдөр бvрийн өгөгдлийн өөрчлөлтөөс vл хамааран тогтвортой
 * vр дvнтэй байхын тулд.
 *
 * 2026-08-05: 2026-08-01-ний flights.json → flights-<year>.json split-ийн
 * дараа энэ файл шинэчлэгдээгvй vлдэж, /flights.json хvсэлт (dashboard
 * анхнаасаа vvсгэдэггvй болсон) л fixture рvv чиглэж, бодит /flights-index.json
 * болон /flights-<year>.json хvсэлтvvд нь доорх ерөнхий handler-т унаж, docs/
 * дэх ЖИНХЭНЭ (өдөр бvр өөрчлөгддөг) файлуудыг шууд vзvvлж байсан. Vvнээс
 * vvдэн visual snapshot бvр өдөр бvр өөр өгөгдлөөр (мөрийн тоо, KPI дvн зэрэг
 * өөрчлөгдөж, зурган хэмжээ шилждэг) харьцуулагдаж, CI vнэмлэхvй тогтмол
 * бvтэлгvйтдэг болсон. Одоо fixture-ийн жилийг ХvСЭЛТ ХИЙСЭН жилтэй тааруулан
 * дахин тэмдэглэж буцаадаг тул CURRENT_YEAR аль ч он руу шилжсэн ч (жишээ нь
 * 2027 он гарахад) тест fixture-аасаа гарахгvй.
 */

const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'flights.sample.json');
const PORT = process.env.TEST_SERVER_PORT ? Number(process.env.TEST_SERVER_PORT) : 4174;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

let cachedFixture = null;
function loadFixture() {
  if (!cachedFixture) {
    cachedFixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  }
  return cachedFixture;
}

// Fixture дэх мөрvvдийг хvсэлтийн жилтэй тааруулж (year талбарыг сольж) буцаана
// — ингэснээр аль ч "CURRENT_YEAR"-т (машины бодит огноо ямар ч байсан) fixture
// vргэлж тохирно.
function yearFilePayload(year) {
  const fixture = loadFixture();
  const flights = fixture.flights.map((f) => Object.assign({}, f, { year }));
  return JSON.stringify({
    meta: Object.assign({}, fixture.meta, { year, count: flights.length }),
    flights,
  });
}

function indexPayload(year) {
  const fixture = loadFixture();
  return JSON.stringify({
    years: [{ year, count: fixture.flights.length, fetchedAt: fixture.meta.fetchedAt }],
  });
}

function createServer() {
  return http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';

    const yearFileMatch = urlPath.match(/^\/flights-(\d{4})\.json$/);

    if (urlPath === '/flights-index.json') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(indexPayload(new Date().getFullYear()));
      return;
    }

    if (yearFileMatch) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(yearFilePayload(Number(yearFileMatch[1])));
      return;
    }

    const filePath = path.join(DOCS_DIR, decodeURIComponent(urlPath));
    if (!filePath.startsWith(DOCS_DIR)) { res.writeHead(403); res.end(); return; }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found: ' + urlPath); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`Fixture server listening on http://localhost:${PORT}`);
  });
}

module.exports = { createServer, PORT };
