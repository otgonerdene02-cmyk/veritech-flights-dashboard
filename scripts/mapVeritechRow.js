const { lookupCityInfo } = require('./ontology');

function mapVeritechRow(row) {
  const city = (row.CITY || '').trim();
  const cntry = lookupCityInfo(city).country;

  const dateStr = (row.OGNOO || '').trim();
  const [datePart] = dateStr.split(' ');
  const [year, month, day] = (datePart || '').split('-').map(n => parseInt(n, 10));

  return {
    year, month, day,
    carr:  (row.AIRLINE || '').trim(),
    city:  city,
    cntry: cntry,
    dir:   String(row.DIRECTION ?? ''),
    ou:    (row.NATURE || '').trim(),
    pax:   Number(row.TOTAL_PASSENGER) || 0,
    cargo: Number(row.C39) || 0,
    adult:      Number(row.ADULT)   || 0,
    child:      Number(row.CHILD)   || 0,
    infant:     Number(row.INFANT)  || 0,
    transit:    Number(row.TRANSIT) || 0,
    vip:        Number(row.VIP)     || 0,
    diplomat:   Number(row.DIPLOMAT)|| 0,
    crew:       Number(row.CREW)    || 0,
    seated:     Number(row.C17)     || 0,
    cargoKg:    Number(row.ACHAA_CARGO) || 0,
    mailKg:     Number(row.ACHAA_POST)  || 0,
    mailTon:    Number(row.C40) || 0,
    flight:     (row.FLIGHT || '').trim(),
    aircraft:   (row.AIRCRAFT || '').trim(),
    category:   (row.CATEGORY || '').trim(),
    flightType: (row.FLIGHT_TYPE || '').trim(),
  };
}

module.exports = { mapVeritechRow };
