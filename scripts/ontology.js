// data/ontology/*.json lookup хvснэгтvvдийг ашиглан flight мөр бvрт region/continent/
// alliance/category зэрэг баганыг шингээдэг (enrich) модуль. scripts/fetchFlights.js
// (шинэ мөр орж ирэх бvрт) болон scripts/applyOntology.js (одоо байгаа
// flights-YYYY.json файлvvдыг дахин боловсруулах) хоёулаа энэ модулийг ашигладаг тул
// логик давхардахгvй.
'use strict';

const fs = require('fs');
const path = require('path');

const ONTOLOGY_DIR = path.join(__dirname, '..', 'data', 'ontology');
const UNKNOWN = 'Тодорхойгүй';

const cityMap = JSON.parse(fs.readFileSync(path.join(ONTOLOGY_DIR, 'city-country-region.json'), 'utf8'));
const airlineMap = JSON.parse(fs.readFileSync(path.join(ONTOLOGY_DIR, 'airline-alliance.json'), 'utf8'));
const aircraftData = JSON.parse(fs.readFileSync(path.join(ONTOLOGY_DIR, 'aircraft-category.json'), 'utf8'));
const aircraftTypes = aircraftData.types || {};
// Урт (олон vсэгтэй) угтвараас эхлэн шалгах ёстой (жишээ "9H" "H"-ээс өмнө) тул
// prefix-ийн уртаар буурахаар эрэмбэлнэ -- эх JSON доторх бичлэгийн дараалалд
// найдахгvй.
const registrationPrefixes = (aircraftData.registrationPrefixes || [])
  .slice()
  .sort(function (a, b) { return b.prefix.length - a.prefix.length; });

// Регистрацийн код заримдаа Латинтай төстэй Кирилл vсэгтэй холилдож бичигддэг
// (жишээ "UP-В3720" доtorh "В" нь Кирилл), угтвар тааруулахын өмнө Латин руу жигдэлнэ.
const CYRILLIC_LOOKALIKE_TO_LATIN = {
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H',
  'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'У': 'Y', 'Х': 'X',
};
function normalizeRegistration(reg) {
  var out = '';
  for (var i = 0; i < reg.length; i++) {
    var ch = reg[i];
    out += Object.prototype.hasOwnProperty.call(CYRILLIC_LOOKALIKE_TO_LATIN, ch) ? CYRILLIC_LOOKALIKE_TO_LATIN[ch] : ch;
  }
  return out.toUpperCase();
}

// Танигдаагvй утга бvрийг ажиллах vед НЭГ л удаа console.warn хийх (мянга мянган
// давхардсан мөр бvрт биш) -- давхардал арилгах Set.
var warned = new Set();
function warnOnce(kind, value) {
  var key = kind + '::' + value;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn('[ontology] Танигдаагүй ' + kind + ': "' + value + '" -- lookup хүснэгтэд алга, "Тодорхойгүй" гэж тэмдэглэв. Гараар data/ontology/-д нэмнэ vv.');
}

function lookupCityInfo(city) {
  var c = (city || '').trim();
  var info = cityMap[c];
  if (!info) {
    warnOnce('хот', c || '(хоосон)');
    return { country: UNKNOWN, region: UNKNOWN, continent: UNKNOWN };
  }
  return { country: info.country, region: info.region, continent: info.continent };
}

function lookupAirlineInfo(carr) {
  var name = (carr || '').trim();
  var info = airlineMap[name];
  if (!info) {
    warnOnce('тээвэрлэгч', name || '(хоосон)');
    return { alliance: 'None', country_of_origin: UNKNOWN };
  }
  return { alliance: info.alliance, country_of_origin: info.country_of_origin };
}

// aircraft талбар "TYPECODE Manufacturer - REGISTRATION" хэлбэртэй (жишээ
// "B738 Boeing - HL8302"), заримдаа хоосон эсвэл malformed ("NUBIA - - NUBIA").
function parseAircraft(aircraftStr) {
  var raw = (aircraftStr || '').trim();
  var result = {
    acManufacturer: UNKNOWN,
    acCategory: UNKNOWN,
    acSeatCap: null,
    acRegCountry: UNKNOWN,
  };
  if (!raw) return result;

  var dashIdx = raw.indexOf(' - ');
  var typePart = dashIdx === -1 ? raw : raw.slice(0, dashIdx);
  var regPart = dashIdx === -1 ? '' : raw.slice(dashIdx + 3).trim();

  var typeCode = typePart.trim().split(/\s+/)[0] || '';
  var typeInfo = aircraftTypes[typeCode];
  if (typeInfo) {
    result.acManufacturer = typeInfo.manufacturer;
    result.acCategory = typeInfo.category;
    result.acSeatCap = typeInfo.approx_seat_capacity;
  } else if (typeCode && typeCode !== 'NUBIA') {
    warnOnce('онгоцны загвар', typeCode);
  }

  if (regPart && regPart !== 'NUBIA' && regPart !== '-') {
    var normReg = normalizeRegistration(regPart);
    var matched = null;
    for (var i = 0; i < registrationPrefixes.length; i++) {
      if (normReg.indexOf(registrationPrefixes[i].prefix) === 0) { matched = registrationPrefixes[i]; break; }
    }
    if (matched) {
      result.acRegCountry = matched.country;
    } else {
      warnOnce('бvртгэлийн код', regPart);
    }
  }

  return result;
}

// Нэг flight мөрийг region/continent/alliance/category зэрэг шинэ баганаар
// баяжуулна. Түvхий cntry/carr/aircraft талбарыг хэвээр vлдээж, зөвхөн НЭМЭЛТ
// багана нэмнэ (одоо байгаа chatbot/UI код эвдрэхгvй).
function enrichFlight(row) {
  var cityInfo = lookupCityInfo(row.city);
  var airlineInfo = lookupAirlineInfo(row.carr);
  var ac = parseAircraft(row.aircraft);

  return Object.assign({}, row, {
    region: cityInfo.region,
    continent: cityInfo.continent,
    alliance: airlineInfo.alliance,
    airlineCountry: airlineInfo.country_of_origin,
    acManufacturer: ac.acManufacturer,
    acCategory: ac.acCategory,
    acSeatCap: ac.acSeatCap,
    acRegCountry: ac.acRegCountry,
  });
}

function enrichAll(rows) {
  return rows.map(enrichFlight);
}

module.exports = {
  lookupCityInfo,
  lookupAirlineInfo,
  parseAircraft,
  enrichFlight,
  enrichAll,
};
