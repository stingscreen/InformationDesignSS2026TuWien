// Converts the Wiener Linien GTFS feed into per-mode GeoJSON for the map.
// Source: https://www.wienerlinien.at/ogd_realtime/doku/ogd/gtfs/gtfs.zip (CC-BY-4.0)
//
// For each city line (one entry per route_short_name) it emits a single
// representative LineString (the longest shape across the line's trips) plus
// the ordered stops of that representative trip. Output: public/data/{mode}.geojson
//
// Usage: node scripts/build-transit-geojson.mjs <gtfs-dir>
// The GTFS .txt files are expected to already be extracted in <gtfs-dir>.

import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join, resolve } from 'node:path';

const GTFS_DIR = resolve(process.argv[2] ?? '.gtfs_tmp');
const OUT_DIR = resolve('public/data');
const WIENER_LINIEN_AGENCY = '04';
const MODE_BY_TYPE = { '0': 'tram', '1': 'underground', '3': 'bus' };
const COORD_PRECISION = 5;

function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { fields.push(cur); cur = ''; }
    else cur += ch;
  }
  fields.push(cur);
  return fields;
}

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

async function eachRow(file, onRow) {
  const rl = createInterface({
    input: createReadStream(join(GTFS_DIR, file)),
    crlfDelay: Infinity
  });
  let header = null;
  for await (const raw of rl) {
    if (!raw) continue;
    const fields = parseCsvLine(raw);
    if (!header) {
      header = fields.map((h, i) => (i === 0 ? stripBom(h) : h));
      continue;
    }
    const row = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = fields[i];
    onRow(row);
  }
}

const round = n => Math.round(n * 10 ** COORD_PRECISION) / 10 ** COORD_PRECISION;

async function main() {
  console.log('Reading routes.txt ...');
  // route_id -> { mode, shortName, longName, color }
  const routeInfo = new Map();
  const groupOfRoute = new Map(); // route_id -> "mode|shortName"
  await eachRow('routes.txt', r => {
    if (r.agency_id !== WIENER_LINIEN_AGENCY) return;
    const mode = MODE_BY_TYPE[r.route_type];
    if (!mode) return;
    const shortName = r.route_short_name;
    if (/^SEV/i.test(shortName) || /Schienenersatzverkehr/i.test(r.route_long_name)) return;
    routeInfo.set(r.route_id, {
      mode,
      shortName,
      longName: r.route_long_name,
      color: r.route_color ? `#${r.route_color}` : null
    });
    groupOfRoute.set(r.route_id, `${mode}|${shortName}`);
  });
  console.log(`  kept ${routeInfo.size} Wiener Linien routes`);

  console.log('Reading trips.txt ...');
  const shapeToGroup = new Map();  // shape_id -> groupKey
  const shapeToTrip = new Map();   // shape_id -> a representative trip_id
  const shapeToRoute = new Map();  // shape_id -> route_id
  await eachRow('trips.txt', t => {
    if (!routeInfo.has(t.route_id) || !t.shape_id) return;
    shapeToGroup.set(t.shape_id, groupOfRoute.get(t.route_id));
    if (!shapeToTrip.has(t.shape_id)) shapeToTrip.set(t.shape_id, t.trip_id);
    shapeToRoute.set(t.shape_id, t.route_id);
  });
  console.log(`  ${shapeToGroup.size} shapes of interest`);

  console.log('Counting shape lengths (shapes.txt pass 1) ...');
  const shapeCount = new Map();
  await eachRow('shapes.txt', s => {
    if (!shapeToGroup.has(s.shape_id)) return;
    shapeCount.set(s.shape_id, (shapeCount.get(s.shape_id) ?? 0) + 1);
  });

  // Pick the longest shape per group as its representative geometry.
  const repShapeOfGroup = new Map(); // groupKey -> shape_id
  const bestCount = new Map();
  for (const [shapeId, groupKey] of shapeToGroup) {
    const count = shapeCount.get(shapeId) ?? 0;
    if (count > (bestCount.get(groupKey) ?? -1)) {
      bestCount.set(groupKey, count);
      repShapeOfGroup.set(groupKey, shapeId);
    }
  }
  const repShapes = new Set(repShapeOfGroup.values());
  const repTrips = new Map(); // trip_id -> groupKey
  for (const [groupKey, shapeId] of repShapeOfGroup) {
    repTrips.set(shapeToTrip.get(shapeId), groupKey);
  }
  console.log(`  ${repShapeOfGroup.size} representative lines`);

  console.log('Collecting representative geometries (shapes.txt pass 2) ...');
  const shapeCoords = new Map(); // shape_id -> [{seq, lon, lat}]
  await eachRow('shapes.txt', s => {
    if (!repShapes.has(s.shape_id)) return;
    if (!shapeCoords.has(s.shape_id)) shapeCoords.set(s.shape_id, []);
    shapeCoords.get(s.shape_id).push({
      seq: +s.shape_pt_sequence,
      lon: round(+s.shape_pt_lon),
      lat: round(+s.shape_pt_lat)
    });
  });

  console.log('Reading stops.txt ...');
  const stops = new Map(); // stop_id -> { name, lon, lat }
  await eachRow('stops.txt', s => {
    stops.set(s.stop_id, {
      name: s.stop_name,
      lon: round(+s.stop_lon),
      lat: round(+s.stop_lat)
    });
  });

  console.log('Collecting stops for representative trips (stop_times.txt, streaming) ...');
  const tripStops = new Map(); // trip_id -> [{seq, stop_id}]
  await eachRow('stop_times.txt', st => {
    if (!repTrips.has(st.trip_id)) return;
    if (!tripStops.has(st.trip_id)) tripStops.set(st.trip_id, []);
    tripStops.get(st.trip_id).push({ seq: +st.stop_sequence, stopId: st.stop_id });
  });

  // Assemble per-mode FeatureCollections.
  const collections = { underground: [], tram: [], bus: [] };
  for (const [groupKey, shapeId] of repShapeOfGroup) {
    const [mode, shortName] = groupKey.split('|');
    const info = routeInfo.get(shapeToRoute.get(shapeId));
    const coords = (shapeCoords.get(shapeId) ?? [])
      .sort((a, b) => a.seq - b.seq)
      .map(p => [p.lon, p.lat]);
    if (coords.length < 2) continue;

    const tripId = shapeToTrip.get(shapeId);
    const orderedStops = (tripStops.get(tripId) ?? [])
      .sort((a, b) => a.seq - b.seq)
      .map(s => stops.get(s.stopId))
      .filter(Boolean)
      .map(s => ({ name: s.name, lon: s.lon, lat: s.lat }));

    collections[mode].push({
      type: 'Feature',
      properties: {
        lineId: shortName,
        name: shortName,
        longName: info.longName,
        mode,
        color: info.color,
        stops: orderedStops
      },
      geometry: { type: 'LineString', coordinates: coords }
    });
  }

  for (const [mode, features] of Object.entries(collections)) {
    features.sort((a, b) =>
      a.properties.lineId.localeCompare(b.properties.lineId, 'de', { numeric: true })
    );
    const fc = { type: 'FeatureCollection', features };
    const outPath = join(OUT_DIR, `${mode}.geojson`);
    await writeFile(outPath, JSON.stringify(fc));
    console.log(`Wrote ${outPath} (${features.length} lines)`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
