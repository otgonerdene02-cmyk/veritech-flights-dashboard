// Одоо байгаа docs/flights.json-ийг MRTD API дуудахгvйгээр ontology lookup
// (data/ontology/*.json)-оор дахин боловсруулж, region/continent/alliance/category
// баганыг шингээж буцааж бичдэг standalone script. `npm run apply-ontology`-ээр
// ажиллуулна. scripts/fetchFlights.js мөн адил enrichAll()-ийг ашигладаг тул
// логик давхардахгvй -- энэ script зөвхөн API дуудалтгvйгээр локал ажиллах
// шаардлагатай vед (жишээ нь ontology JSON-ийг гар аргаар шинэчилсний дараа) хэрэглэнэ.
'use strict';

const fs = require('fs');
const path = require('path');
const { enrichAll } = require('./ontology');

const FLIGHTS_PATH = path.join(__dirname, '..', 'docs', 'flights.json');

function main() {
  const raw = fs.readFileSync(FLIGHTS_PATH, 'utf8');
  const data = JSON.parse(raw);
  const flights = Array.isArray(data.flights) ? data.flights : [];

  const enriched = enrichAll(flights);

  const output = Object.assign({}, data, { flights: enriched });
  fs.writeFileSync(FLIGHTS_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.log(`Баяжуулсан ${enriched.length} мөрийг ${FLIGHTS_PATH}-д бичлээ.`);
}

main();
