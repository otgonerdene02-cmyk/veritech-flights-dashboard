// Одоо байгаа docs/flights-YYYY.json (жил бvрээр) файлvvдийг MRTD API дуудахгvйгээр
// ontology lookup (data/ontology/*.json)-оор дахин боловсруулж, region/continent/
// alliance/category баганыг шингээж буцааж бичдэг standalone script. `npm run
// apply-ontology`-ээр ажиллуулна. scripts/fetchFlights.js мөн адил enrichAll()-ийг
// ашигладаг тул логик давхардахгvй -- энэ script зөвхөн API дуудалтгvйгээр локал
// ажиллах шаардлагатай vед (жишээ нь ontology JSON-ийг гар аргаар шинэчилсний дараа)
// хэрэглэнэ. Боловсруулах жилvvдийг docs/flights-index.json-оос олж тодорхойлно.
//
// Flags:
//   --dry-run   файлд бичихгvй, зөвхөн хэдэн мөр өөрчлөгдөхийг хэвлэнэ.
//   --no-backup backup (.bak) vvсгэхгvй (анхныхаараа жил бvрийн файлд vvсгэдэг).
'use strict';

const fs = require('fs');
const path = require('path');
const { enrichAll } = require('./ontology');

const OUT_DIR = path.join(__dirname, '..', 'docs');
const INDEX_FILE = path.join(OUT_DIR, 'flights-index.json');

function yearFile(year) {
  return path.join(OUT_DIR, `flights-${year}.json`);
}

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const skipBackup = args.includes('--no-backup');

// Хоёр мөрийн ontology-оор баяжуулсан талбарууд (region, alliance, гэх мэт)
// адил эсэхийг харьцуулж, бодитоор өөрчлөгдсөн мөрийн тоог тоолно.
const ENRICHED_FIELDS = [
  'region', 'continent', 'alliance', 'airlineCountry',
  'acManufacturer', 'acCategory', 'acSeatCap', 'acRegCountry',
];
function isRowChanged(before, after) {
  return ENRICHED_FIELDS.some(function (field) { return before[field] !== after[field]; });
}

function loadIndexYears() {
  const raw = fs.readFileSync(INDEX_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  const years = Array.isArray(parsed.years) ? parsed.years : [];
  return years.map(function (e) { return e.year; }).sort(function (a, b) { return b - a; });
}

function processYear(year) {
  const filePath = yearFile(year);
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  const flights = Array.isArray(data.flights) ? data.flights : [];

  const enriched = enrichAll(flights);
  const changedCount = enriched.reduce(function (count, row, i) {
    return count + (isRowChanged(flights[i], row) ? 1 : 0);
  }, 0);

  if (isDryRun) {
    console.log(`[dry-run] ${year} он: нийт ${enriched.length} мөрөөс ${changedCount} мөр өөрчлөгдөнө. Файлд бичихгvй.`);
    return { year, count: enriched.length, changedCount };
  }

  if (!skipBackup) {
    const backupPath = `${filePath}.bak`;
    fs.copyFileSync(filePath, backupPath);
  }

  const output = Object.assign({}, data, { flights: enriched });
  // fetchFlights.js-тэй ижил compact (indent-гvй) JSON бичдэг -- GitHub-ийн 50MB
  // зөвлөмжит хязгаараас зайлсхийхэд тус нэмэр болно.
  fs.writeFileSync(filePath, JSON.stringify(output), 'utf8');
  console.log(`${year} он: баяжуулсан ${enriched.length} мөрийг (${changedCount} өөрчлөгдсөн) ${filePath}-д бичлээ.`);
  return { year, count: enriched.length, changedCount };
}

function main() {
  const years = loadIndexYears();
  if (years.length === 0) {
    console.error(`${INDEX_FILE}-д жил олдсонгvй.`);
    process.exit(1);
  }

  if (!isDryRun && !skipBackup) {
    console.log(`Backup vvсгэлээ: ${years.map(function (y) { return `flights-${y}.json.bak`; }).join(', ')}`);
  }

  const results = years.map(processYear);
  const totalCount = results.reduce(function (s, r) { return s + r.count; }, 0);
  const totalChanged = results.reduce(function (s, r) { return s + r.changedCount; }, 0);

  console.log('');
  console.log(`Нийт ${years.length} жилийн ${totalCount} мөрөөс ${totalChanged} мөр өөрчлөгдлөө${isDryRun ? ' (dry-run, бичигдээгvй)' : ''}.`);
}

main();
