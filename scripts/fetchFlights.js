const fs = require('fs');
const path = require('path');
const https = require('https');
const { mapVeritechRow } = require('./mapVeritechRow');
const { enrichAll } = require('./ontology');

const API_URL = process.env.MRTD_API_URL || 'https://platform.mrtd.gov.mn/restapi';
const USERNAME = process.env.MRTD_USERNAME;
const PASSWORD = process.env.MRTD_PASSWORD;
const INDICATOR_ID = process.env.MRTD_INDICATOR_ID || '14995832';
const PAGE_SIZE = 1000;
const REQUEST_DELAY_MS = 250;
const MAX_PAGES = 50; // аюулгүйн дээд хязгаар (жил бүрт) — ~11.9k мөр / 1000 хуудас үед ~12 хүсэлт хүлээгдэнэ
const EARLIEST_YEAR = 2005; // аюулгүйн доод хязгаар — бодит дата дуусахаас өмнө (хоосон жил давхар) endless loop үүсэхээс сэргийлнэ

// 2026-08-01 (3): API-г шууд (Postman-той адил, жинхэнэ credential-аар) шалгасны
// дүнд:
//   - C26 (жил) талбар дээрх criteria { operator: '=' } НАЙДВАРТАЙ ажилладаг
//     (жил бүрт зөв totalcount/OGNOO буцаана — жишээ нь C26=2026 → 11979,
//     C26=2025 → 20272, C26=2019 → 0). Иймд жилээр backfill хийхэд ашиглаж болно.
//   - Гэвч "UPDATED" (шинэчлэлтийн Unixtimestamp) талбар дээр criteria
//     ШүүЛТЛЭХ боломжгүй: "UPDATED" гэдэг key-г criteria-д өгвөл үл тоож,
//     сервер өөр (бүх түүхэн) totalcount буцаадаг. Мөн raw мөрөнд ижил утгыг
//     агуулдаг "C41" талбар дээр туршихад ч тогтворгүй — operator '>' үед 0
//     мөр (буруу хоосон), operator '<' үед бүх түүхэн дата (шүүлтгүй мэт)
//     буцаадаг. Иймд Unixtimestamp-аар "зөвхөн шинэ мөр" гэж шүүх API
//     түвшинд НАЙДВАРТАЙ БИШ тул ашиглаагүй болно.
// Дүгнэлт: өдөр тутмын (автомат cron) ажиллагаанд зөвхөн ОДООГИЙН ЖИЛИЙГ
// (C26=currentYear) татна — хямд (~12-20 хүсэлт) бөгөөд бараг бүх шинэ/
// өөрчлөгдсөн мөр энэ дотор байна. Бүх түүхэн жилийг дахин бүрэн татах
// (backfill) зөвхөн FETCH_ALL_YEARS=1 орчны хувьсагчтай үед л (гараар
// ажиллуулахад зориулсан) хийгдэнэ.
const BACKFILL_ALL_YEARS = /^(1|true)$/i.test(process.env.FETCH_ALL_YEARS || '');

// 2026-08-01 (4): docs/flights.json нэг файлдаа 71MB хүрч GitHub-ийн 50MB
// зөвлөмжит хязгаараас давсан тул жил бүрээр тусад нь файлд (flights-YYYY.json)
// хуваасан. Энэ нь хоёр давуу талтай:
//   1) Файл бүрийн хэмжээ хамгийн том жилд ч (~20 мянган мөр) 50MB-аас хол
//      доогуур үлддэг.
//   2) Өдөр тутмын (анхдагч) горим зөвхөн ОДООГИЙН ЖИЛИЙН файлыг л дахин
//      бичдэг болсон тул өмнөх жилүүдийн файлд огт хүрдэггүй (өмнө нь
//      бүх жилийн дата НЭГ файлд байсан тул анхдагч горимоор дахин бичихэд
//      бусад жилүүдийн дата устдаг байсан нөхцөл байдлыг бүтцийн хувьд
//      арилгасан).
// docs/flights-index.json нь dashboard-д "ямар жилүүд бэлэн байгааг" том
// файлуудыг татахгүйгээр мэдэх боломж олгодог жижиг индекс файл.
const OUT_DIR = path.join(__dirname, '..', 'docs');
const INDEX_FILE = path.join(OUT_DIR, 'flights-index.json');

function yearFile(year) {
  return path.join(OUT_DIR, `flights-${year}.json`);
}

if (!USERNAME || !PASSWORD) {
  console.error('MRTD_USERNAME / MRTD_PASSWORD орчны хувьсагч тохируулаагүй байна.');
  process.exit(1);
}

// platform.mrtd.gov.mn presents a certificate chain the GitHub Actions runner's
// CA store can't verify (UNABLE_TO_VERIFY_LEAF_SIGNATURE). This agent is only
// ever handed to this one request — TLS verification stays on everywhere else
// in the process. Do NOT "fix" this by setting NODE_TLS_REJECT_UNAUTHORIZED=0,
// which disables verification for every outbound connection in the run.
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchPage(offset, criteria) {
  const parameters = {
    indicatorId: INDICATOR_ID,
    paging: {
      offset,
      pageSize: PAGE_SIZE,
    },
  };
  if (criteria) parameters.criteria = criteria;

  const body = JSON.stringify({
    request: {
      username: USERNAME,
      password: PASSWORD,
      command: 'kpiIndicatorDataList',
      parameters,
    },
  });

  const url = new URL(API_URL);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        agent: insecureAgent,
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage}`));
            return;
          }
          let json;
          try {
            json = JSON.parse(data);
          } catch (err) {
            reject(new Error(`Invalid JSON response: ${err.message}`));
            return;
          }
          if (json?.response?.status !== 'success') {
            reject(new Error(`API error: ${data}`));
            return;
          }
          const result = json.response.result || {};
          const rawTotal = result.paging?.totalcount ?? result.totalcount;
          resolve({
            rows: result.rows || [],
            totalcount: rawTotal === undefined ? undefined : Number(rawTotal),
          });
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Тухайн НЭГ жилийн бүх хуудсыг (C26 талбараар шүүж) дараалан татна.
async function fetchYearRows(year) {
  const criteria = { C26: [{ operator: '=', operand: String(year) }] };
  const rows = [];
  let offset = 1; // энэ API-д offset нь 1-ээс эхэлдэг хуудасны дугаар (page number)
  let requestCount = 0;
  let totalcount;

  while (offset <= MAX_PAGES) {
    requestCount += 1;
    const { rows: pageRows, totalcount: tc } = await fetchPage(offset, criteria);
    if (tc !== undefined) totalcount = tc;

    rows.push(...pageRows);
    console.log(`  ${year}, offset=${offset}: ${pageRows.length} мөр татагдав (хуримтлагдсан ${rows.length}${totalcount !== undefined ? ` / ${totalcount}` : ''})`);

    const isLastPage = pageRows.length === 0
      || pageRows.length < PAGE_SIZE
      || (totalcount !== undefined && rows.length >= totalcount);
    if (isLastPage) break;

    offset += 1;
    await sleep(REQUEST_DELAY_MS);
  }

  return { rows, requestCount };
}

function toDateKey(f) {
  if (!f.year || !f.month || !f.day) return '';
  return `${f.year}-${String(f.month).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`;
}

function loadYearFile(year) {
  try {
    const raw = fs.readFileSync(yearFile(year), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.flights) ? parsed.flights : [];
  } catch {
    return [];
  }
}

function loadIndex() {
  try {
    const raw = fs.readFileSync(INDEX_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.years) ? parsed.years : [];
  } catch {
    return [];
  }
}

function writeIndex(entriesByYear) {
  const years = Array.from(entriesByYear.values()).sort((a, b) => b.year - a.year);
  fs.writeFileSync(INDEX_FILE, JSON.stringify({ years }, null, 2), 'utf8');
}

// Мөрийн агуулгыг харьцуулахад ашиглах талбарууд — mapVeritechRow-ийн гаралт.
// id/unixtimestamp болон enrichAll-ээр нэмэгддэг region/continent/alliance/...
// зэрэг үүсмэл багануудыг оруулаагүй, учир нь тэдгээр нь raw API талбар
// өөрчлөгдөөгүй ч ontology лавлах хүснэгт шинэчлэгдвэл өөрчлөгдөж болно.
const COMPARE_FIELDS = [
  'year', 'month', 'day', 'carr', 'city', 'cntry', 'dir', 'ou', 'pax', 'cargo',
  'adult', 'child', 'infant', 'transit', 'vip', 'diplomat', 'crew', 'seated',
  'cargoKg', 'mailKg', 'mailTon', 'flight', 'aircraft', 'category', 'flightType',
];

function rowsEqual(a, b) {
  return COMPARE_FIELDS.every((k) => a[k] === b[k]);
}

// Тухайн жилийн raw мөрүүдийг боловсруулж, ЗӨВХӨН ТүүНИЙ flights-YYYY.json
// файлд бичнэ (бусад жилийн файлд огт хүрэхгүй). Өмнөх агуулгатай нь
// Unixtimestamp-аар харьцуулж added/updated/unchanged тоологоо буцаана.
function processYear(year, rawRows) {
  const fresh = rawRows.map((row) => Object.assign(
    { id: row.ID, unixtimestamp: Number(row.UPDATED) || null },
    mapVeritechRow(row)
  ));
  const uniqueTs = new Set(fresh.map((f) => f.unixtimestamp));
  if (uniqueTs.size !== fresh.length) {
    console.warn(`  Анхаар (${year}): ${fresh.length - uniqueTs.size} давхардсан Unixtimestamp илэрлээ (хуудаслалт давхцсан байж болзошгүй).`);
  }

  const existing = loadYearFile(year);
  const existingByTs = new Map(existing.map((f) => [f.unixtimestamp, f]));

  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const row of fresh) {
    const prev = existingByTs.get(row.unixtimestamp);
    if (!prev) {
      added += 1;
    } else if (!rowsEqual(prev, row)) {
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  const merged = enrichAll(fresh);
  merged.sort((a, b) => toDateKey(b).localeCompare(toDateKey(a)) || (b.id - a.id));

  const fetchedAt = new Date().toISOString();
  const output = {
    meta: { fetchedAt, indicatorId: INDICATOR_ID, year, count: merged.length },
    flights: merged,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  // Compact (indent-гүй) JSON — целlofile хэмжээг бууруулах зорилготой
  // (GitHub-ийн 50MB зөвлөмжит хязгаараас зайлсхийхэд тус нэмэр болно).
  fs.writeFileSync(yearFile(year), JSON.stringify(output), 'utf8');

  return { year, count: merged.length, fetchedAt, added, updated, unchanged };
}

async function main() {
  const currentYear = new Date().getFullYear();
  console.log(BACKFILL_ALL_YEARS
    ? `Татаж эхэлж байна: pageSize=${PAGE_SIZE}, БҮХ ЖИЛЭЭР (${currentYear}-аас ухран, FETCH_ALL_YEARS=1)...`
    : `Татаж эхэлж байна: pageSize=${PAGE_SIZE}, зөвхөн одоогийн жил (${currentYear})...`);

  const index = loadIndex();
  const indexByYear = new Map(index.map((e) => [e.year, e]));

  let requestCount = 0;
  const results = [];

  for (let year = currentYear; year >= EARLIEST_YEAR; year--) {
    const { rows, requestCount: yearRequestCount } = await fetchYearRows(year);
    requestCount += yearRequestCount;

    if (rows.length === 0) {
      if (BACKFILL_ALL_YEARS) {
        console.log(`${year} он: 0 мөр — дата эндээс цаашид байхгүй гэж үзэж татахаа зогсоов.`);
      }
      break;
    }

    const result = processYear(year, rows);
    results.push(result);
    indexByYear.set(year, { year, count: result.count, fetchedAt: result.fetchedAt });
    console.log(`${year} он: ${result.count} мөр татагдлаа (шинэ: ${result.added}, шинэчлэгдсэн: ${result.updated}, өөрчлөгдөөгүй: ${result.unchanged})`);

    if (!BACKFILL_ALL_YEARS) break; // анхдагч горим: зөвхөн currentYear нэг л давталт
    await sleep(REQUEST_DELAY_MS);
  }

  writeIndex(indexByYear);

  const totalCount = results.reduce((s, r) => s + r.count, 0);
  const totalAdded = results.reduce((s, r) => s + r.added, 0);
  const totalUpdated = results.reduce((s, r) => s + r.updated, 0);
  const totalUnchanged = results.reduce((s, r) => s + r.unchanged, 0);

  console.log('');
  console.log('Жилээр татагдсан мөр:');
  results
    .slice()
    .sort((a, b) => a.year - b.year)
    .forEach(({ year, count }) => console.log(`  ${year} он: ${count} мөр`));

  console.log('');
  console.log('Дүнгүүд:');
  console.log(`  Татагдсан жилүүд: ${results.length} (${results.map((r) => r.year).sort((a, b) => a - b).join(', ')})`);
  console.log(`  Нийт татагдсан мөр: ${totalCount}`);
  console.log(`  Нийт хүсэлт: ${requestCount}`);
  console.log(`  Шинэ мөр (added): ${totalAdded}`);
  console.log(`  Шинэчлэгдсэн мөр (updated): ${totalUpdated}`);
  console.log(`  Өөрчлөгдөөгүй мөр (unchanged): ${totalUnchanged}`);
  console.log(`  Бичигдсэн файлууд: ${results.map((r) => `flights-${r.year}.json`).join(', ')}, flights-index.json`);

  // writeSyncStatus.js-д "бодит шинэ дата олдсон уу" гэдгийг дамжуулна (dashboard
  // дээрх "Сүүлд шинэчилсэн" нь зөвхөн үүнд үндэслэнэ — "Сүүлд шалгасан"-аас ялгаатай
  // нь ажиллагаа бүрд биш, зөвхөн бодит өөрчлөлт орсон үед л урагшилна).
  const hasChanges = totalAdded > 0 || totalUpdated > 0;
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${hasChanges}\n`, 'utf8');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
