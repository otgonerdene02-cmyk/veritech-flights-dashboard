const fs = require('fs');
const path = require('path');
const https = require('https');
const { mapVeritechRow } = require('./mapVeritechRow');

const API_URL = process.env.MRTD_API_URL || 'https://platform.mrtd.gov.mn/restapi';
const USERNAME = process.env.MRTD_USERNAME;
const PASSWORD = process.env.MRTD_PASSWORD;
const INDICATOR_ID = process.env.MRTD_INDICATOR_ID || '14995832';
const PAGE_SIZE = 200;

// Retention: kpiIndicatorDataList always returns only the latest ~50 rows —
// offset/pageSize/page were tested against the live API and none of them
// change the result (verified 2026-07-29; paging.totalcount reports 11744
// records server-side but only the newest window is ever returned). So each
// run's response is a rolling snapshot, not a page. To get a usable history
// for the dashboard's daily trend, new rows are merged into the existing
// docs/flights.json (deduped by ID) instead of overwriting it, then trimmed
// to RETENTION_DAYS so the committed file doesn't grow without bound.
//
// 2026-07-30: docs/flights.json was bulk-backfilled from a manual MRTD Excel
// export (Агаарын тээврийн статистик - 202607290957.xlsx, ~11.7k rows back
// to 2026-01-01). RETENTION_DAYS was raised from 180 to 400 so that history
// isn't immediately trimmed away by the very next scheduled run.
const RETENTION_DAYS = Number(process.env.FLIGHTS_RETENTION_DAYS) || 400;
const MAX_RECORDS = 20000;

const OUT_FILE = path.join(__dirname, '..', 'docs', 'flights.json');

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

function fetchLatestRows() {
  const body = JSON.stringify({
    request: {
      username: USERNAME,
      password: PASSWORD,
      command: 'kpiIndicatorDataList',
      parameters: {
        indicatorId: INDICATOR_ID,
        offset: 1,
        pageSize: PAGE_SIZE,
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
          resolve(json.response.result?.rows || []);
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
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

function toDateKey(f) {
  if (!f.year || !f.month || !f.day) return '';
  return `${f.year}-${String(f.month).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`;
}

async function main() {
  const rawRows = await fetchLatestRows();
  const fresh = rawRows.map((row) => Object.assign({ id: row.ID }, mapVeritechRow(row)));

  const existing = loadExisting();
  const byId = new Map(existing.map((f) => [f.id, f]));
  for (const f of fresh) byId.set(f.id, f); // fresh data wins on conflict

  let merged = Array.from(byId.values());

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  merged = merged.filter((f) => {
    const key = toDateKey(f);
    return !key || key >= cutoffKey;
  });

  merged.sort((a, b) => toDateKey(b).localeCompare(toDateKey(a)) || (b.id - a.id));
  if (merged.length > MAX_RECORDS) merged = merged.slice(0, MAX_RECORDS);

  const output = {
    meta: {
      fetchedAt: new Date().toISOString(),
      indicatorId: INDICATOR_ID,
      count: merged.length,
      retentionDays: RETENTION_DAYS,
    },
    flights: merged,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), 'utf8');
  console.log(`Written ${merged.length} flights (${fresh.length} fetched this run) to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
