#!/usr/bin/env node
/**
 * Playwright тестvvдэд зориулсан статик сервер.
 *
 * docs/ директорийг shvvж vzvvlnэ, гэхдээ /flights.json хvсэлтийг
 * tests/fixtures/flights.sample.json (тогтмол, commit хийгдсэн dataset)
 * рvv чиглvvлнэ — vнэн зvvдэй docs/flights.json нь CI-с өдөр бvр
 * автоматаар шинэчлэгддэг тул visual regression тестvvд өдөр бvрийн
 * өгөгдлийн өөрчлөлтөөс хамааралгvй, тогтвортой vр дvнтэй байхын тулд.
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

function createServer() {
  return http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';

    if (urlPath === '/flights.json') {
      fs.readFile(FIXTURE_PATH, (err, data) => {
        if (err) { res.writeHead(500); res.end('Fixture load error'); return; }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(data);
      });
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
