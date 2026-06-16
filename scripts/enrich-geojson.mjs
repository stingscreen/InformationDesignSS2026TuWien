// Enriches the transit GeoJSON with per-line length and builds district-facts.json
// (area, latest population, and which lines run through each district per mode).
//
// Inputs (all already in public/data):
//   bezirke-topo.json, viePopulation1869.csv, {underground,tram,bus}.geojson
// Outputs:
//   adds `lengthKm` to each line feature; writes district-facts.json
//
// Usage: node scripts/enrich-geojson.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { geoLength, geoContains } from 'd3-geo';
import { feature } from 'topojson-client';

const DATA = 'public/data';
const EARTH_RADIUS_KM = 6371;
const isNightLine = id => /^N/.test(id);

const readJson = async f => JSON.parse(await readFile(join(DATA, f), 'utf8'));

function busMode(id) {
  return isNightLine(id) ? 'bus_night' : 'bus_day';
}

async function loadPopulation() {
  const text = await readFile(join(DATA, 'viePopulation1869.csv'), 'utf8');
  const [header, ...rows] = text.trim().split(/\r?\n/);
  const cols = header.split(';');
  const ci = name => cols.indexOf(name);
  // Keep the most recent year's POP_TOTAL per district.
  const byDistrict = new Map(); // bezNr -> { year, pop }
  for (const line of rows) {
    const f = line.split(';');
    const code = +f[ci('DISTRICT_CODE')];
    const bezNr = (code - 90000) / 100;
    const year = +f[ci('REF_YEAR')];
    const pop = +f[ci('POP_TOTAL')];
    const cur = byDistrict.get(bezNr);
    if (!cur || year > cur.year) byDistrict.set(bezNr, { year, pop });
  }
  return byDistrict;
}

async function main() {
  const topo = await readJson('bezirke-topo.json');
  const districts = feature(topo, topo.objects.bezirke).features;

  const population = await loadPopulation();

  // Seed facts with area + population.
  const facts = {};
  for (const d of districts) {
    const nr = d.properties.BEZNR;
    facts[nr] = {
      name: d.properties.NAMEK,
      areaKm2: Math.round((d.properties.FLAECHE / 1e6) * 10) / 10,
      population: population.get(nr)?.pop ?? null,
      populationYear: population.get(nr)?.year ?? null,
      lines: { underground: [], tram: [], bus_day: [], bus_night: [] }
    };
  }

  // Helper: which district a stop falls in.
  const districtOfPoint = ([lon, lat]) => {
    for (const d of districts) {
      if (geoContains(d, [lon, lat])) return d.properties.BEZNR;
    }
    return null;
  };

  for (const file of ['underground', 'tram', 'bus']) {
    const fc = await readJson(`${file}.geojson`);
    for (const f of fc.features) {
      const id = f.properties.lineId;
      const mode = file === 'bus' ? busMode(id) : file;

      // Per-line length from geometry (geoLength returns radians).
      f.properties.lengthKm = Math.round(geoLength(f) * EARTH_RADIUS_KM * 10) / 10;

      // Districts this line passes through (via its stops).
      const touched = new Set();
      for (const s of f.properties.stops) {
        const nr = districtOfPoint([s.lon, s.lat]);
        if (nr != null) touched.add(nr);
      }
      for (const nr of touched) {
        if (facts[nr] && !facts[nr].lines[mode].includes(id)) {
          facts[nr].lines[mode].push(id);
        }
      }
    }
    // Persist lengthKm back into the line file.
    await writeFile(join(DATA, `${file}.geojson`), JSON.stringify(fc));
    console.log(`Enriched ${file}.geojson with lengthKm (${fc.features.length} lines)`);
  }

  // Sort line lists for stable display.
  const sortLines = arr =>
    arr.sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
  for (const nr of Object.keys(facts)) {
    for (const mode of Object.keys(facts[nr].lines)) sortLines(facts[nr].lines[mode]);
  }

  await writeFile(join(DATA, 'district-facts.json'), JSON.stringify(facts));
  console.log(`Wrote district-facts.json (${Object.keys(facts).length} districts)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
