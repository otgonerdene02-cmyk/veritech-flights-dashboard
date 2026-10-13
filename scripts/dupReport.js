// flights-<year>.json доторх давхардал/хоосон мөрийн задаргаа. node dups.js <json>
const fs = require('fs');
const f = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).flights;
const iso = (x) => new Date(x.unixtimestamp * 1000).toISOString().slice(0, 16).replace('T', ' ');
const date = (x) => `${x.year}-${String(x.month).padStart(2, '0')}-${String(x.day).padStart(2, '0')}`;
const g = {};
f.forEach((x) => { const k = [date(x), x.flight, x.dir, x.city].join('|'); (g[k] = g[k] || []).push(x); });
const groups = Object.values(g).filter((v) => v.length > 1);
const same = [], diff = [], ghost = [];
const sig = (x) => [x.aircraft, x.pax, x.crew, x.cargoKg].join('|');
groups.forEach((v) => {
  const s = [...v].sort((a, b) => (b.pax + b.crew) - (a.pax + a.crew));
  s.slice(1).forEach((x) => {
    const row = { key: s[0], extra: x };
    if (x.pax === 0 && x.crew === 0) ghost.push(row);
    else if (sig(x) === sig(s[0])) same.push(row);
    else diff.push(row);
  });
});
const allZero = f.filter((x) => x.pax === 0 && x.crew === 0 && x.cargoKg === 0);
const nubia = f.filter((x) => /NUBIA/.test(x.aircraft));
const sum = (a, k) => a.reduce((s, r) => s + r.extra[k], 0);
const tbl = (rows) => ['| Огноо | Нислэг | Чиглэл | Хот | id (үндсэн) | id (илүү) | Бүртгэсэн цаг (үндсэн / илүү, UTC) | Онгоц | Зорчигч |', '|---|---|---|---|---|---|---|---|---|']
  .concat(rows.map(({ key: a, extra: b }) => `| ${date(a)} | ${a.flight} | ${a.dir === '0' ? 'Явсан' : 'Ирсэн'} | ${a.city} | ${a.id} | ${b.id} | ${iso(a)} / ${iso(b)} | ${a.aircraft === b.aircraft ? a.aircraft : a.aircraft + ' / ' + b.aircraft} | ${a.pax === b.pax ? a.pax : a.pax + ' / ' + b.pax} |`)).join('\n');
console.log(JSON.stringify({ n: f.length, groups: groups.length, same: same.length, samePax: sum(same, 'pax'), diff: diff.length, diffPax: sum(diff, 'pax'), ghost: ghost.length, allZero: allZero.length, nubia: nubia.length, nubiaPax: nubia.reduce((s, x) => s + x.pax, 0) }));
console.log('\n### SAME\n' + tbl(same));
console.log('\n### DIFF\n' + tbl(diff));
console.log('\n### GHOST\n' + tbl(ghost.slice(0, 15)));
