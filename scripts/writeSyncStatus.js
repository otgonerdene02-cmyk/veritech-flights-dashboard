const fs = require('fs');
const path = require('path');

// Cron ажиллагаа бvр (амжилттай эсэх vл хамааран) дуудагдаж, docs/last-sync-status.json-г
// шинэчилнэ. Энэ файл нь: (1) dashboard дээр "сvvлд шинэчилсэн" мэдээллийг найдвартай
// харуулах, (2) check-data-freshness.yml watchdog workflow-д GitHub-ийн schedule trigger
// огт ажиллаагvй тохиолдлыг илрvvлэхэд ашиглагдана.
const STATUS_FILE = path.join(__dirname, '..', 'docs', 'last-sync-status.json');

const [, , outcome, runId, runUrl] = process.argv;

let prev = {};
try {
  prev = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
} catch {
  // эхний удаа ажиллаж байгаа бол өмнөх файл байхгvй — хэвийн
}

const now = new Date().toISOString();
const succeeded = outcome === 'success';

const status = {
  lastAttemptAt: now,
  lastAttemptStatus: outcome || 'unknown',
  lastSuccessAt: succeeded ? now : (prev.lastSuccessAt || null),
  lastFailureAt: succeeded ? (prev.lastFailureAt || null) : now,
  runId: runId || null,
  runUrl: runUrl || null,
};

fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2), 'utf8');
console.log('last-sync-status.json бичигдлээ:', status);
