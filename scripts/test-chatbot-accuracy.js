// Чатботын байгалийн хэлний хариултыг docs/flights.json-оос шууд (chat логикоос
// ХАМААРАЛГҮЙ, энгийн filter/reduce-ээр) тооцоолсон "expected" утгатай харьцуулдаг
// регресс тест. Node.js орчинд ажиллуулна: `node scripts/test-chatbot-accuracy.js`
//
// computeChat()-ийг тусад нь хуулж давхардуулахгүйн тулд docs/index.html-ээс
// эх кодыг нь шууд текстээр зүүж авч vm орчинд ажиллуулна — ингэснээр
// dashboard-ын жинхэнэ ашиглаж буй хувилбартай ямагт синк байна.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'docs', 'index.html');
const FLIGHTS_PATH = path.join(ROOT, 'docs', 'flights.json');

function extractBlock(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error('Extraction start marker not found: ' + startMarker);
  const end = src.indexOf(endMarker, start + startMarker.length);
  if (end === -1) throw new Error('Extraction end marker not found: ' + endMarker);
  return src.slice(start, end);
}

function loadChatEngine() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');

  // fmtNum/compact/pad2/monthLabel — computeChat/mkTbl эдгээрийг ашигладаг
  const numberHelpers = extractBlock(
    html,
    '  function fmtNum(n) {',
    "  function monthLabel(m) { return m + '-р сар'; }"
  ) + "  function monthLabel(m) { return m + '-р сар'; }\n";

  // SYN (улс) -оос эхлээд computeChat()-ийн төгсгөл хүртэлх бүх туслах
  // өгөгдөл/функцүүд (CITY_SYN, CHAT_STOPWORDS, matchesCity, mkTbl, гэх мэт)
  const chatCore = extractBlock(html, '  var SYN = {', '\n  function renderChatMessage');

  const sandbox = { allRows: [], console };
  vm.createContext(sandbox);
  vm.runInContext(numberHelpers + '\n' + chatCore, sandbox, { filename: 'docs/index.html (extracted chat engine)' });

  if (typeof sandbox.computeChat !== 'function') {
    throw new Error('computeChat экспортлогдсонгүй — docs/index.html-ийн бүтэц өөрчлөгдсөн байж магадгүй, extraction marker-үүдийг шинэчлэх шаардлагатай.');
  }
  return sandbox;
}

function loadFlights() {
  const data = JSON.parse(fs.readFileSync(FLIGHTS_PATH, 'utf8'));
  return Array.isArray(data.flights) ? data.flights : [];
}

function sumPax(rows) {
  return rows.reduce(function (s, r) { return s + (r.pax || 0); }, 0);
}

// city талбар "Сөүл/Инчеон" гэх мэт нийлмэл байдаг тул chat логикоос
// ХАМААРАЛГҮЙ, энгийн prefix/suffix шалгалтаар бие даан баталгаажуулна
function cityPrefixMatch(rows, name) {
  return rows.filter(function (r) { return r.city === name || (r.city || '').indexOf(name + '/') === 0; });
}
function citySuffixMatch(rows, name) {
  return rows.filter(function (r) { return r.city === name || (r.city || '').slice(-(name.length + 1)) === '/' + name; });
}

// ---------- тестийн жагсаалт ----------
// Query бүр: { name, query, expected(rows) => тоо, expectUnmatched }
// expectUnmatched: true/false бол unmatched flag-ыг нягтлана, null бол шалгахгүй
function buildCases(rows) {
  const total = sumPax(rows);
  const intl = rows.filter(function (r) { return r.ou === 'ОУ'; });
  const dom = rows.filter(function (r) { return r.ou === 'ОН'; });
  const departed = rows.filter(function (r) { return r.dir === '1'; });
  const arrived = rows.filter(function (r) { return r.dir === '0'; });
  const carrierName = (rows.find(function (r) { return r.carr; }) || {}).carr;
  const carrierRows = carrierName ? rows.filter(function (r) { return r.carr === carrierName; }) : [];

  const seoulDeparted = cityPrefixMatch(departed, 'Сөүл');
  const incheonDeparted = citySuffixMatch(departed, 'Инчеон');
  const tokyoDeparted = cityPrefixMatch(departed, 'Токио');

  const cases = [
    {
      name: 'Нийт зорчигч',
      query: 'Нийт хэдэн зорчигч вэ?',
      expected: total,
      expectUnmatched: false,
    },
    {
      name: 'Олон улсын зорчигч (ОУ)',
      query: 'Олон улсын хэдэн зорчигч вэ?',
      expected: sumPax(intl),
      expectUnmatched: false,
    },
    {
      name: 'Дотоодын зорчигч (ОН)',
      query: 'Дотоодын хэдэн зорчигч вэ?',
      expected: sumPax(dom),
      expectUnmatched: false,
    },
    {
      name: 'Явсан чиглэл (dir=1)',
      query: 'Явсан хэдэн зорчигч вэ?',
      expected: sumPax(departed),
      expectUnmatched: false,
    },
    {
      name: 'Ирсэн чиглэл (dir=0)',
      query: 'Ирсэн хэдэн зорчигч вэ?',
      expected: sumPax(arrived),
      expectUnmatched: false,
    },
    {
      name: 'Хот: Сөүл рүү (явсан)',
      query: 'Сөүл рүү хэдэн зорчигч ниссэн бэ?',
      // "руу" + "ниссэн" => dir=Явсан спецификийн дагуу нэмэгддэг (dir-detection fix)
      expected: sumPax(seoulDeparted),
      expectUnmatched: false,
    },
    {
      name: 'Хот: Инчон рvv (явсан) — Сөүлтэй ЗОРИУДААР ижил байх ёстой',
      query: 'Инчон руу хэдэн зорчигч ниссэн бэ?',
      // Датанд Сөүлийн ганц хувилбар ("Сөүл/Инчеон") л байгаа тул Инчон болон
      // Сөүл query хоёр яг ижил мөрүүдийг олох ёстой — энэ алдаа биш, харин
      // датаны бодит байдлаас үүдэлтэй зөв параллелизм (2026-07-30 харилцан
      // ярианд баталгаажуулсан). Хэрэв ирээдүйд "Сөүл/Гимпо" мэт өөр Сөүлийн
      // буудал нэмэгдвэл эдгээр хоёр тоо ялгарах ёстой.
      expected: sumPax(incheonDeparted),
      expectUnmatched: false,
      mustEqual: 'Хот: Сөүл рүү (явсан)',
    },
    {
      name: 'Хот: Токио рvv (явсан)',
      query: 'Токио руу хэдэн зорчигч ниссэн бэ?',
      expected: sumPax(tokyoDeparted),
      expectUnmatched: false,
    },
    {
      name: 'Тээвэрлэгч: ' + carrierName,
      query: carrierName + ' хэдэн зорчигч тээвэрлэсэн бэ?',
      expected: sumPax(carrierRows),
      expectUnmatched: false,
    },
    {
      name: 'Танигдаагүй нэр — warning унтраагдаагүй мөртлөө нийт дүн зөв',
      query: 'Атлантис хотоос хэдэн зорчигч ирсэн бэ?',
      expected: total,
      expectUnmatched: true,
    },
  ];

  return cases.filter(function (c) { return c.query.indexOf('undefined') === -1; });
}

function run() {
  const engine = loadChatEngine();
  const rows = loadFlights();
  engine.allRows = rows;

  if (!rows.length) {
    console.error('docs/flights.json хоосон байна — тест ажиллуулах өгөгдөл алга.');
    process.exit(1);
  }

  const cases = buildCases(rows);
  const results = cases.map(function (c) {
    const result = engine.computeChat(c.query);
    const actual = result.type === 'single' ? result.value : null;
    const diff = actual === null ? null : actual - c.expected;
    const valuePass = actual !== null && diff === 0;
    const unmatchedPass = c.expectUnmatched === null || result.unmatched === c.expectUnmatched;
    const typeNote = result.type === 'single'
      ? null
      : 'computeChat "' + result.type + '" төрлийн хариулт буцаасан тул single утгатай харьцуулж чадсангүй' +
        (result.type === 'table' ? ' (grouped total=' + result.total + ')' : '');
    return {
      name: c.name,
      query: c.query,
      resultType: result.type,
      actual: actual,
      expected: c.expected,
      diff: diff,
      unmatched: result.unmatched,
      expectUnmatched: c.expectUnmatched,
      mustEqual: c.mustEqual,
      typeNote: typeNote,
      pass: valuePass && unmatchedPass,
    };
  });

  // "mustEqual" хэлхээ шалгалт (жишээ нь Инчон === Сөүл)
  const byName = {};
  results.forEach(function (r) { byName[r.name] = r; });
  results.forEach(function (r) {
    if (r.mustEqual && byName[r.mustEqual]) {
      const other = byName[r.mustEqual];
      if (r.actual !== other.actual) {
        r.pass = false;
        r.pairMismatch = other.name + '=' + other.actual + ' vs ' + r.name + '=' + r.actual;
      }
    }
  });

  const passed = results.filter(function (r) { return r.pass; });
  const failed = results.filter(function (r) { return !r.pass; });

  console.log('=== Chatbot нарийвчлалын тест ===');
  console.log('Нийт: ' + results.length + '  PASS: ' + passed.length + '  FAIL: ' + failed.length);
  console.log('');

  results.forEach(function (r) {
    const mark = r.pass ? 'PASS' : 'FAIL';
    console.log('[' + mark + '] ' + r.name);
    console.log('       query: "' + r.query + '"');
    console.log('       actual=' + r.actual + '  expected=' + r.expected + (r.diff ? '  diff=' + r.diff : ''));
    if (r.expectUnmatched !== null) {
      console.log('       unmatched: actual=' + r.unmatched + ' expected=' + r.expectUnmatched);
    }
    if (r.typeNote) console.log('       ' + r.typeNote);
    if (r.pairMismatch) console.log('       pair check FAILED: ' + r.pairMismatch);
    if (!r.pass) console.log('       *** FAIL ***');
  });

  if (failed.length) {
    console.log('');
    console.log('=== FAIL хураангуй ===');
    failed.forEach(function (r) {
      console.log('- ' + r.name + ': query="' + r.query + '" actual=' + r.actual + ' expected=' + r.expected +
        (r.diff !== null ? ' (зөрүү ' + r.diff + ')' : '') +
        (r.typeNote ? ' — ' + r.typeNote : '') +
        (r.pairMismatch ? ' [' + r.pairMismatch + ']' : ''));
    });
    process.exitCode = 1;
  }
}

run();
