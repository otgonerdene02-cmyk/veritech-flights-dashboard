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
const MAX_PAGES = 50; // аюулгvйн дээд хязгаар — ~11.9k мөр / 1000 хуудас vед ~12 хvсэлт хvлээгдэнэ

// 2026-08-01: "offset vл харгалзан сvvлийн ~50 мөрийг л буцаадаг" гэсэн
// өмнөх (2026-07-29) дvгнэлт буруу шалтгаантай байсан нь тогтоогдов —
// script нь offset/pageSize-ийг parameters дор шууд бичиж байсан бол,
// бодит API нь эдгээрийг parameters.paging.{offset,pageSize} гэсэн дэд
// объект дотор шаарддаг байсан тул сервер параметрvvдийг vл тоож дефолт
// (сvvлийн ~50 мөр) хариу буцаадаг байжээ. Зассны дараа шалгахад offset нь
// 1-ээс эхэлдэг хуудасны дугаар (page number) бөгөөд offset=1..11 тус бvр
// 1000 мөр, offset=12 сvvлийн 979 мөр (нийт 11,979 нь paging.totalcount-тай
// яг тэнцэнэ), offset=13 хоосон буцаана гэдгийг баталгаажуулсан. Иймд одоо
// API-г хуудаслан (offset=1, 2, 3, ...) бvх мөрийг татдаг болгосон.
//
// 2026-08-01 (2): Мөр бvрийн UPDATED талбарыг ("Unixtimestamp") тогтмол
// (immutable) бvртгэлийн түлхvvр болгон ашиглана — тухайн ID vvсэх vедээ
// vvсдэг бөгөөд агуулга нь хожим засварлагдсан ч энэ утга өөрчлөгддөггvй.
// Тиймээс шинээр татсан мөр бvрийг өмнөх docs/flights.json дахь ижил
// unixtimestamp-тай мөртэй харьцуулж шинэ/шинэчлэгдсэн/өөрчлөгдөөгvй гэж
// ангилдаг (fetchAllRows нь vргэлж бvх мөрийг дахин татдаг тул бичигдэх
// эцсийн жагсаалт нь vргэлж сvvлд татсан бvрэн дата байдаг — ангилал зөвхөн
// логд харуулах статистикийн зориулалттай).
const OUT_FILE = path.join(__dirname, '..', 'docs', 'flights.json');

if (!USERNAME || !PASSWORD) {
  console.error('MRTD_USERNAME / MRTD_PASSWORD орчны хувьсагч тохируулаагvй байна.');
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

function fetchPage(offset) {
  const body = JSON.stringify({
    request: {
      username: USERNAME,
      password: PASSWORD,
      command: 'kpiIndicatorDataList',
      parameters: {
        indicatorId: INDICATOR_ID,
        paging: {
          offset,
          pageSize: PAGE_SIZE,
        },
      },
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

async function fetchAllRows() {
  const allRows = [];
  let offset = 1; // энэ API-д offset нь 1-ээс эхэлдэг хуудасны дугаар (page number)
  let requestCount = 0;
  let totalcount;

  while (offset <= MAX_PAGES) {
    requestCount += 1;
    const { rows, totalcount: tc } = await fetchPage(offset);
    if (tc !== undefined) totalcount = tc;

    allRows.push(...rows);
    console.log(`  offset=${offset}: ${rows.length} мөр татагдав (хуримтлагдсан ${allRows.length}${totalcount !== undefined ? ` / ${totalcount}` : ''})`);

    const isLastPage = rows.length === 0
      || rows.length < PAGE_SIZE
      || (totalcount !== undefined && allRows.length >= totalcount);
    if (isLastPage) break;

    offset += 1;
    await sleep(REQUEST_DELAY_MS);
  }

  return { rows: allRows, requestCount, totalcount };
}

function toDateKey(f) {
  if (!f.year || !f.month || !f.day) return '';
  return `${f.year}-${String(f.month).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`;
}

function loadExisting() {
  try {
    const raw = fs.readFileSync(OUT_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.flights) ? parsed.flights : [];
  } catch {
    return [];
  }
}

// Мөрийн агуулгыг харьцуулахад ашиглах талбарууд — mapVeritechRow-ийн гаралт.
// id/unixtimestamp болон enrichAll-ээр нэмэгддэг region/continent/alliance/...
// зэрэг үvсмэл багануудыг оруулаагvй, учир нь тэдгээр нь raw API талбар
// өөрчлөгдөөгvй ч ontology лавлах хvснэгт шинэчлэгдвэл өөрчлөгдөж болно.
const COMPARE_FIELDS = [
  'year', 'month', 'day', 'carr', 'city', 'cntry', 'dir', 'ou', 'pax', 'cargo',
  'adult', 'child', 'infant', 'transit', 'vip', 'diplomat', 'crew', 'seated',
  'cargoKg', 'mailKg', 'mailTon', 'flight', 'aircraft', 'category', 'flightType',
];

function rowsEqual(a, b) {
  return COMPARE_FIELDS.every((k) => a[k] === b[k]);
}

async function main() {
  console.log(`Татаж эхэлж байна: pageSize=${PAGE_SIZE}, offset=1-ээс...`);
  const { rows: rawRows, requestCount, totalcount } = await fetchAllRows();

  const fresh = rawRows.map((row) => Object.assign(
    { id: row.ID, unixtimestamp: Number(row.UPDATED) || null },
    mapVeritechRow(row)
  ));
  const uniqueTs = new Set(fresh.map((f) => f.unixtimestamp));
  if (uniqueTs.size !== fresh.length) {
    console.warn(`Анхаар: ${fresh.length - uniqueTs.size} давхардсан Unixtimestamp илэрлээ (хуудаслалт давхцсан байж болзошгvй).`);
  }

  const existing = loadExisting();
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

  let merged = enrichAll(fresh);
  merged.sort((a, b) => toDateKey(b).localeCompare(toDateKey(a)) || (b.id - a.id));

  const output = {
    meta: {
      fetchedAt: new Date().toISOString(),
      indicatorId: INDICATOR_ID,
      count: merged.length,
    },
    flights: merged,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), 'utf8');

  console.log('');
  console.log('Дvнгvvд:');
  console.log(`  Нийт татагдсан мөр: ${merged.length}${totalcount !== undefined ? ` (сервер дээрх totalcount: ${totalcount})` : ''}`);
  console.log(`  Нийт хvсэлт: ${requestCount}`);
  console.log(`  Шинэ мөр (added): ${added}`);
  console.log(`  Шинэчлэгдсэн мөр (updated): ${updated}`);
  console.log(`  Өөрчлөгдөөгvй мөр (unchanged): ${unchanged}`);
  console.log(`  Бичигдсэн файл: ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
