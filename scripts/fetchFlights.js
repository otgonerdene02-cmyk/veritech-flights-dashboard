const fs = require('fs');
const path = require('path');
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
const RETENTION_DAYS = Number(process.env.FLIGHTS_RETENTION_DAYS) || 180;
const MAX_RECORDS = 20000;

const OUT_FILE = path.join(__dirname, '..', 'docs', 'flights.json');

if (!USERNAME || !PASSWORD) {
  console.error('MRTD_USERNAME / MRTD_PASSWORD орчны хувьсагч тохируулаагүй байна.');
  process.exit(1);
}

async function fetchLatestRows() {
  const body = {
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
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json?.response?.status !== 'success') {
    throw new Error(`API error: ${JSON.stringify(json)}`);
  }

  return json.response.result?.rows || [];
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
