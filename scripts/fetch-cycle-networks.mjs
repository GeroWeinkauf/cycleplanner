#!/usr/bin/env node
/**
 * Fetch official D-Netz (Radnetz Deutschland) and EuroVelo GPX tracks,
 * convert them to simplified GeoJSON FeatureCollections for the frontend.
 *
 * Sources:
 *  - D-Netz:   https://www.radroutenplaner-deutschland.de/api/droutes/<id>/download
 *              (linked from https://www.radnetz-deutschland.de/.../downloads_node.html)
 *  - EuroVelo: https://en.eurovelo.com/route/get-gpx/<routeId>
 *              (linked from https://en.eurovelo.com/ev<n>)
 *
 * Output (UTF-8):
 *  - apps/web/public/data/d-netz.geojson
 *  - apps/web/public/data/eurovelo.geojson
 *
 * Raw GPX files are cached under scripts/downloads/ so the script can be
 * re-run offline. Tune via env: TOLERANCE (deg), ROUND (decimals).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(__dirname, "downloads");
const OUT_DIR = join(__dirname, "..", "apps", "web", "public", "data");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Douglas-Peucker tolerance in degrees (~0.0001 deg ~= 11 m).
// D-Netz fits comfortably under 5 MB at the requested ~10 m tolerance.
// EuroVelo is a much larger network (17 routes); a slightly relaxed tolerance
// (~0.00025 deg ~= 28 m) keeps the full route set under the 5 MB target.
// Rounding to 5 decimals (~1.1 m) further trims size without meaningful loss.
const SIMPLIFY = {
  dnetz: {
    tolerance: parseFloat(process.env.DNETZ_TOLERANCE ?? "0.0001"),
    round: parseInt(process.env.DNETZ_ROUND ?? "6", 10),
  },
  eurovelo: {
    tolerance: parseFloat(process.env.EV_TOLERANCE ?? "0.00025"),
    round: parseInt(process.env.EV_ROUND ?? "5", 10),
  },
};

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

// id is the radroutenplaner API identifier (13 is exposed as "ICT").
const D_ROUTES = [
  { ref: "D1", id: "1", name: "Nordseeküsten-Route" },
  { ref: "D2", id: "2", name: "Ostseeküsten-Route" },
  { ref: "D3", id: "3", name: "Europaradweg R1" },
  { ref: "D4", id: "4", name: "Mittelland-Route" },
  { ref: "D5", id: "5", name: "Saar-Mosel-Main" },
  { ref: "D6", id: "6", name: "Donauroute" },
  { ref: "D7", id: "7", name: "Pilgerroute" },
  { ref: "D8", id: "8", name: "Rhein-Route" },
  { ref: "D9", id: "9", name: "Weser-Romantische Straße" },
  { ref: "D10", id: "10", name: "Elberadweg" },
  { ref: "D11", id: "11", name: "Ostsee-Oberbayern-Route" },
  { ref: "D12", id: "12", name: "Oder-Neiße-Radweg" },
  { ref: "D13", id: "ICT", name: "Iron Curtain Trail" },
];

// EuroVelo route page -> get-gpx id, with a German display name.
const EV_ROUTES = [
  { ref: "EV1", gpxId: 2, name: "Atlantikküsten-Route" },
  { ref: "EV2", gpxId: 25, name: "Hauptstädte-Route" },
  { ref: "EV3", gpxId: 26, name: "Pilgerroute" },
  { ref: "EV4", gpxId: 27, name: "Mitteleuropa-Route" },
  { ref: "EV5", gpxId: 28, name: "Via Romea Francigena" },
  { ref: "EV6", gpxId: 29, name: "Atlantik–Schwarzes Meer" },
  { ref: "EV7", gpxId: 30, name: "Sonnenroute" },
  { ref: "EV8", gpxId: 31, name: "Mittelmeer-Route" },
  { ref: "EV9", gpxId: 32, name: "Ostsee-Adria-Route" },
  { ref: "EV10", gpxId: 33, name: "Ostseeküsten-Route" },
  { ref: "EV11", gpxId: 34, name: "Osteuropa-Route" },
  { ref: "EV12", gpxId: 35, name: "Nordseeküsten-Route" },
  { ref: "EV13", gpxId: 1, name: "Iron Curtain Trail" },
  { ref: "EV14", gpxId: 512, name: "Gewässer Mitteleuropas" },
  { ref: "EV15", gpxId: 36, name: "Rheinradweg" },
  { ref: "EV17", gpxId: 37, name: "Rhone-Route" },
  { ref: "EV19", gpxId: 135, name: "Maas-Route" },
];

// ---------------------------------------------------------------------------
// Fetching (with raw-file cache)
// ---------------------------------------------------------------------------

async function fetchText(url, cacheName) {
  const cachePath = join(RAW_DIR, cacheName);
  if (existsSync(cachePath)) {
    return readFileSync(cachePath, "utf8");
  }
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/gpx+xml, application/xml, text/xml, */*",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  writeFileSync(cachePath, text, "utf8");
  return text;
}

// ---------------------------------------------------------------------------
// GPX parsing (regex-based; robust for simple GPX 1.1 files)
// ---------------------------------------------------------------------------

function parseGpx(xml) {
  const points = [];
  const re = /<trkpt[^>]*\slat="([^"]+)"\slon="([^"]+)"/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    points.push([parseFloat(m[2]), parseFloat(m[1])]); // [lon, lat]
  }
  return points;
}

// ---------------------------------------------------------------------------
// Douglas-Peucker line simplification (iterative, index-based)
// ---------------------------------------------------------------------------

function perpDistSq(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) {
    const pdx = p[0] - a[0];
    const pdy = p[1] - a[1];
    return pdx * pdx + pdy * pdy;
  }
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const tc = Math.max(0, Math.min(1, t));
  const cx = a[0] + tc * dx;
  const cy = a[1] + tc * dy;
  const pdx = p[0] - cx;
  const pdy = p[1] - cy;
  return pdx * pdx + pdy * pdy;
}

function simplify(points, tolSq) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    let maxDist = -1;
    let index = -1;
    const a = points[start];
    const b = points[end];
    for (let i = start + 1; i < end; i++) {
      const d = perpDistSq(points[i], a, b);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > tolSq && index !== -1) {
      keep[index] = 1;
      stack.push([start, index]);
      stack.push([index, end]);
    }
  }
  const out = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) out.push(points[i]);
  }
  return out;
}

function roundPoint(p, round) {
  const f = Math.pow(10, round);
  return [Math.round(p[0] * f) / f, Math.round(p[1] * f) / f];
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

async function processRoute({ url, cacheName, ref, name, network }) {
  const xml = await fetchText(url, cacheName);
  let points = parseGpx(xml);
  if (points.length === 0) {
    throw new Error("no trackpoints found");
  }
  const rawCount = points.length;
  const cfg = SIMPLIFY[network];
  points = simplify(points, cfg.tolerance * cfg.tolerance);
  const coords = points.map((p) => roundPoint(p, cfg.round));
  const feature = {
    type: "Feature",
    properties: { name: `${ref} (${name})`, ref, network },
    geometry: { type: "LineString", coordinates: coords },
  };
  return { feature, rawCount, simplifiedCount: coords.length };
}

function writeFeatureCollection(file, features) {
  const featuresJson = features.map((f) => JSON.stringify(f));
  const out =
    "{\n" +
    '  "type": "FeatureCollection",\n' +
    '  "features": [\n    ' +
    featuresJson.join(",\n    ") +
    "\n  ]\n}\n";
  writeFileSync(file, out, "utf8");
  return Buffer.byteLength(out, "utf8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(RAW_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const summary = { dnetz: [], eurovelo: [], failed: [] };

  console.log(
    `dnetz: tolerance=${SIMPLIFY.dnetz.tolerance} round=${SIMPLIFY.dnetz.round} | ` +
      `eurovelo: tolerance=${SIMPLIFY.eurovelo.tolerance} round=${SIMPLIFY.eurovelo.round}`
  );

  // --- D-Netz ---
  console.log("=== D-Netz (Radnetz Deutschland) ===");
  const dFeatures = [];
  for (const route of D_ROUTES) {
    const url = `https://www.radroutenplaner-deutschland.de/api/droutes/${route.id}/download`;
    try {
      const { feature, rawCount, simplifiedCount } = await processRoute({
        url,
        cacheName: `dnetz-${route.ref}.gpx`,
        ref: route.ref,
        name: route.name,
        network: "dnetz",
      });
      dFeatures.push(feature);
      summary.dnetz.push({ ref: route.ref, name: route.name, rawCount, simplifiedCount });
      console.log(`  ${route.ref} ok  ${rawCount} -> ${simplifiedCount} pts`);
    } catch (err) {
      summary.failed.push({ net: "dnetz", ref: route.ref, url, error: err.message });
      console.log(`  ${route.ref} FAILED: ${err.message}`);
    }
  }

  // --- EuroVelo ---
  console.log("=== EuroVelo ===");
  const evFeatures = [];
  for (const route of EV_ROUTES) {
    const url = `https://en.eurovelo.com/route/get-gpx/${route.gpxId}`;
    try {
      const { feature, rawCount, simplifiedCount } = await processRoute({
        url,
        cacheName: `eurovelo-${route.ref}.gpx`,
        ref: route.ref,
        name: route.name,
        network: "eurovelo",
      });
      evFeatures.push(feature);
      summary.eurovelo.push({ ref: route.ref, name: route.name, rawCount, simplifiedCount });
      console.log(`  ${route.ref} ok  ${rawCount} -> ${simplifiedCount} pts`);
    } catch (err) {
      summary.failed.push({ net: "eurovelo", ref: route.ref, url, error: err.message });
      console.log(`  ${route.ref} FAILED: ${err.message}`);
    }
  }

  // --- Write ---
  const dFile = join(OUT_DIR, "d-netz.geojson");
  const evFile = join(OUT_DIR, "eurovelo.geojson");
  const dSize = writeFeatureCollection(dFile, dFeatures);
  const evSize = writeFeatureCollection(evFile, evFeatures);

  console.log("\n=== Result ===");
  console.log(`  d-netz.geojson   : ${dFeatures.length} routes, ${(dSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  eurovelo.geojson : ${evFeatures.length} routes, ${(evSize / 1024 / 1024).toFixed(2)} MB`);
  if (summary.failed.length) {
    console.log("\n  FAILED downloads:");
    for (const f of summary.failed) {
      console.log(`    ${f.net}/${f.ref}: ${f.error} (${f.url})`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
