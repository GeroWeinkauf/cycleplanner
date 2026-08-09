#!/usr/bin/env -S npx tsx
/**
 * Calibration Tool (P2-3)
 *
 * Compares computed routes against reference tours stored in calibration/.
 *
 * Each reference tour consists of:
 *   - A .gpx file (the reference track)
 *   - A .json file with { name, profile, note, startLat, startLng, endLat, endLng }
 *
 * Usage:
 *   pnpm calibrate --preset <name>
 *   pnpm calibrate --compare <run1> <run2>
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const CALIBRATION_DIR = resolve(process.cwd(), 'calibration');
const API_BASE = process.env.API_URL || 'http://127.0.0.1:3000';

interface ReferenceTour {
  id: string;
  name: string;
  profile: string;
  note: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  gpxPath: string;
}

interface CalibrationResult {
  tourId: string;
  tourName: string;
  computedDistanceKm: number;
  referenceDistanceKm: number;
  distanceDeviationPct: number;
  areaDeviation?: number;
  success: boolean;
  error?: string;
}

/** Load reference tours from the calibration directory */
function loadReferenceTours(): ReferenceTour[] {
  if (!existsSync(CALIBRATION_DIR)) {
    console.error('Calibration directory not found:', CALIBRATION_DIR);
    return [];
  }

  const files = readdirSync(CALIBRATION_DIR);
  const tours: ReferenceTour[] = [];

  for (const file of files) {
    if (file.endsWith('.json')) {
      try {
        const raw = readFileSync(resolve(CALIBRATION_DIR, file), 'utf-8');
        const data = JSON.parse(raw);
        const gpxFile = file.replace('.json', '.gpx');
        const gpxPath = resolve(CALIBRATION_DIR, gpxFile);

        tours.push({
          id: basename(file, '.json'),
          name: data.name || file,
          profile: data.profile || 'Tourenrad',
          note: data.note || '',
          startLat: data.startLat,
          startLng: data.startLng,
          endLat: data.endLat,
          endLng: data.endLng,
          gpxPath: existsSync(gpxPath) ? gpxPath : '',
        });
      } catch (err) {
        console.warn('Failed to parse', file, ':', (err as Error).message);
      }
    }
  }

  return tours;
}

/** Parse distance from GPX file by summing track segment distances */
function parseGpxDistance(gpxPath: string): number {
  if (!existsSync(gpxPath)) return 0;

  const content = readFileSync(gpxPath, 'utf-8');

  // Extract all track points
  const ptRegex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"/g;
  const points: Array<{ lat: number; lng: number }> = [];
  let match;
  while ((match = ptRegex.exec(content)) !== null) {
    points.push({
      lat: parseFloat(match[1]),
      lng: parseFloat(match[2]),
    });
  }

  // Also try route points if no track points
  if (points.length === 0) {
    const rteRegex = /<rtept\s+lat="([^"]+)"\s+lon="([^"]+)"/g;
    while ((match = rteRegex.exec(content)) !== null) {
      points.push({
        lat: parseFloat(match[1]),
        lng: parseFloat(match[2]),
      });
    }
  }

  if (points.length < 2) return 0;

  // Compute haversine distance
  let totalKm = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversineKm(
      points[i - 1].lng, points[i - 1].lat,
      points[i].lng, points[i].lat,
    );
    totalKm += d;
  }

  return Math.round(totalKm * 100) / 100;
}

function haversineKm(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Compute a route via the CyclePlanner API */
async function computeRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  profile: string,
  preset?: string,
): Promise<{ distanceKm: number; geometry: string } | null> {
  try {
    const body: Record<string, unknown> = {
      waypoints: [
        { lat: startLat, lng: startLng },
        { lat: endLat, lng: endLng },
      ],
      profile,
    };

    const res = await fetch(API_BASE + '/api/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      summary?: { distanceKm?: number };
      geometry?: string;
    };

    return {
      distanceKm: data.summary?.distanceKm || 0,
      geometry: data.geometry || '',
    };
  } catch (err) {
    console.error('  Route computation error:', (err as Error).message);
    return null;
  }
}

/** Main calibration run */
async function runCalibration(preset?: string): Promise<CalibrationResult[]> {
  const tours = loadReferenceTours();
  if (tours.length === 0) {
    console.log('No reference tours found in', CALIBRATION_DIR);
    console.log('Add .gpx + .json files to calibrate.');
    return [];
  }

  console.log('Calibrating against', tours.length, 'reference tours...\n');
  const results: CalibrationResult[] = [];

  for (const tour of tours) {
    process.stdout.write('  ' + tour.name + ' ... ');

    // Parse reference distance from GPX
    const refDist = parseGpxDistance(tour.gpxPath);

    // Compute route
    const route = await computeRoute(
      tour.startLat, tour.startLng,
      tour.endLat, tour.endLng,
      tour.profile, preset,
    );

    if (!route) {
      console.log('FAILED (no route)');
      results.push({
        tourId: tour.id,
        tourName: tour.name,
        computedDistanceKm: 0,
        referenceDistanceKm: refDist,
        distanceDeviationPct: 0,
        success: false,
        error: 'No route found',
      });
      continue;
    }

    const deviationPct = refDist > 0
      ? Math.round(Math.abs(route.distanceKm - refDist) / refDist * 100 * 10) / 10
      : 0;

    const status = deviationPct < 15 ? 'OK' : deviationPct < 30 ? 'WARN' : 'BAD';
    console.log(
      route.distanceKm.toFixed(1) + ' km (ref ' + refDist.toFixed(1) + ', ' +
      deviationPct.toFixed(1) + '% dev) [' + status + ']',
    );

    results.push({
      tourId: tour.id,
      tourName: tour.name,
      computedDistanceKm: route.distanceKm,
      referenceDistanceKm: refDist,
      distanceDeviationPct: deviationPct,
      success: true,
    });
  }

  return results;
}

/** Print summary table */
function printSummary(results: CalibrationResult[]): void {
  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('Calibration Summary');
  console.log('──────────────────────────────────────────────────────────────');

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  if (successful.length > 0) {
    const avgDev = successful.reduce((sum, r) => sum + r.distanceDeviationPct, 0) / successful.length;
    console.log('  Successful:', successful.length, 'tours');
    console.log('  Average deviation:', avgDev.toFixed(1) + '%');
  }
  if (failed.length > 0) {
    console.log('  Failed:', failed.length, 'tours');
  }

  // Save results
  const outPath = resolve(process.cwd(), 'calibration', 'last-run.json');
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log('\n  Results saved to calibration/last-run.json');
}

/** Compare two calibration runs */
function compareRuns(run1Path: string, run2Path: string): void {
  try {
    const run1: CalibrationResult[] = JSON.parse(readFileSync(run1Path, 'utf-8'));
    const run2: CalibrationResult[] = JSON.parse(readFileSync(run2Path, 'utf-8'));

    console.log('Comparing calibration runs:');
    console.log('  Run 1:', basename(run1Path));
    console.log('  Run 2:', basename(run2Path));
    console.log('');

    const run2Map = new Map(run2.map((r) => [r.tourId, r]));

    let improved = 0;
    let worsened = 0;
    let unchanged = 0;

    for (const r1 of run1) {
      const r2 = run2Map.get(r1.tourId);
      if (!r2 || !r1.success || !r2.success) continue;

      const diff = r1.distanceDeviationPct - r2.distanceDeviationPct;
      if (diff > 1) {
        console.log('  ↑ ' + r1.tourName + ': ' + r1.distanceDeviationPct.toFixed(1) + '% → ' + r2.distanceDeviationPct.toFixed(1) + '% (better)');
        improved++;
      } else if (diff < -1) {
        console.log('  ↓ ' + r1.tourName + ': ' + r1.distanceDeviationPct.toFixed(1) + '% → ' + r2.distanceDeviationPct.toFixed(1) + '% (worse)');
        worsened++;
      } else {
        unchanged++;
      }
    }

    console.log('');
    console.log('  Improved:', improved);
    console.log('  Worsened:', worsened);
    console.log('  Unchanged:', unchanged);
  } catch (err) {
    console.error('Failed to compare runs:', (err as Error).message);
  }
}

// ── CLI entry ──────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--compare')) {
    const idx = args.indexOf('--compare');
    const run1 = args[idx + 1];
    const run2 = args[idx + 2];
    if (!run1 || !run2) {
      console.error('Usage: pnpm calibrate --compare <run1.json> <run2.json>');
      process.exit(1);
    }
    compareRuns(resolve(run1), resolve(run2));
    return;
  }

  const presetIdx = args.indexOf('--preset');
  const preset = presetIdx >= 0 ? args[presetIdx + 1] : undefined;

  const results = await runCalibration(preset);
  printSummary(results);
}

main().catch((err) => {
  console.error('Calibration error:', err);
  process.exit(1);
});
