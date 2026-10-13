const fs = require('fs');
const path = require('path');

// Cron ажиллагаа бүр (амжилттай эсэх үл хамааран) дуудагдаж, docs/last-sync-status.json-г
// шинэчилнэ. Энэ файл нь: (1) dashboard дээр "сүүлд шалгасан"/"сүүлд шинэчилсэн"
// мэдээллийг найдвартай харуулах, (2) check-data-freshness.yml watchdog workflow-д
// GitHub-ийн schedule trigger огт ажиллаагүй тохиолдлыг илрүүлэхэд ашиглагдана.
//
// lastAttemptAt/lastSuccessAt нь ажиллагаа БҮР (шинэ дата олдсон эсэхээс үл хамааран)
// шинэчлэгддэг тул dashboard дээр "Сүүлд шалгасан" гэж харуулагдана. lastUpdatedAt нь
// ЗӨВХӨН fetchFlights.js бодитоор шинэ/өөрчлөгдсөн мөр олсон үед л (4-р аргумент
// hasChanges === 'true') шинэчлэгддэг тул "Сүүлд шинэчилсэн" гэж харуулагдана.
const STATUS_FILE = path.join(__dirname, '..', 'docs', 'last-sync-status.json');

const [, , outcome, runId, runUrl, hasChangesArg] = process.argv;

let prev = {};
try {
  prev = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
} catch {
  // эхний удаа ажиллаж байгаа бол өмнөх файл байхгүй — хэвийн
}

const now = new Date().toISOString();
const succeeded = outcome === 'success';
const hasChanges = hasChangesArg === 'true';

const status = {
  lastAttemptAt: now,
  lastAttemptStatus: outcome || 'unknown',
  lastSuccessAt: succeeded ? now : (prev.lastSuccessAt || null),
  lastFailureAt: succeeded ? (prev.lastFailureAt || null) : now,
  lastUpdatedAt: succeeded && hasChanges ? now : (prev.lastUpdatedAt || null),
  runId: runId || null,
  runUrl: runUrl || null,
};

fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2), 'utf8');
console.log('last-sync-status.json бичигдлээ:', status);
