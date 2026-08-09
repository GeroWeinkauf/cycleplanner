/**
 * Elevation Profile Service
 *
 * Core logic:
 * 1. Decode polyline -> lat/lng coordinates
 * 2. Sample points every ~50 m along the route
 * 3. For each sample, look up elevation from Terrarium tiles
 * 4. Smooth with moving median filter
 * 5. Compute metrics: ascent, descent, slope distribution, etc.
 */
import { decodePng, type DecodedPng } from './png-decoder.js';
import { tileCache, type ElevationTile } from './tile-cache.js';
import type {
  ElevationPoint,
  ElevationMetrics,
  ElevationProfile,
  SlopeDistribution,
} from '@cycleplanner/shared';

// ---- Constants ----

/** Sample distance in meters */
const SAMPLE_DISTANCE_M = 50;

/** Smoothing window size in samples (must be odd for median) */
const SMOOTH_WINDOW = 5;

/** Earth radius in meters */
const EARTH_RADIUS_M = 6_371_000;

/** Terrarium tile source URL template */
const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

/** Terrarium tile size in pixels */
const TILE_SIZE = 256;

/**
 * Decode a Valhalla-encoded polyline into an array of [lng, lat] pairs.
 */
export function decodePolyline(str: string): Array<[number, number]> {
  const coords: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < str.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coords.push([lng / 1e6, lat / 1e6]);
  }

  return coords;
}

// ---- Distance helpers ----

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Haversine distance between two points in meters.
 */
function haversineDistance(
  lng1: number, lat1: number,
  lng2: number, lat2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/**
 * Interpolate a point at a given fraction between two coordinates.
 */
function interpolate(
  a: [number, number],
  b: [number, number],
  fraction: number,
): [number, number] {
  return [
    a[0] + (b[0] - a[0]) * fraction,
    a[1] + (b[1] - a[1]) * fraction,
  ];
}

// ---- Tile coordinate helpers ----

function lngLatToTile(lng: number, lat: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor((lng + 180) / 360 * n);
  const latRad = toRad(lat);
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}

function lngLatToPixel(lng: number, lat: number, zoom: number): { px: number; py: number } {
  const n = Math.pow(2, zoom);
  const px = ((lng + 180) / 360 * n) % 1 * TILE_SIZE;
  const latRad = toRad(lat);
  const py = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n) % 1 * TILE_SIZE;
  return { px: Math.floor(px), py: Math.floor(py) };
}

// ---- Elevation look-up ----

/**
 * Decode a Terrarium-encoded elevation value from RGBA pixel data.
 * Formula: elevation (meters) = R * 256 + G + B / 256 - 32768
 */
function terrariumToElevation(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/**
 * Fetch a single Terrarium tile PNG from S3 and decode it.
 */
async function fetchTile(x: number, y: number, zoom: number): Promise<DecodedPng> {
  const url = TERRARIUM_URL
    .replace('{z}', String(zoom))
    .replace('{x}', String(x))
    .replace('{y}', String(y));

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Failed to fetch Terrarium tile ' + zoom + '/' + x + '/' + y + ': ' + res.status);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return decodePng(buffer);
}

/**
 * Get elevation at a lat/lng position from Terrarium tiles.
 */
async function getElevation(lat: number, lng: number): Promise<number> {
  const zoom = 12;
  const tileCoords = lngLatToTile(lng, lat, zoom);
  let tile = tileCache.get(tileCoords.x, tileCoords.y, zoom);

  if (!tile) {
    const decoded = await fetchTile(tileCoords.x, tileCoords.y, zoom);
    const elevations = new Float32Array(TILE_SIZE * TILE_SIZE);

    for (let i = 0; i < TILE_SIZE * TILE_SIZE; i++) {
      const r = decoded.data[i * 4];
      const g = decoded.data[i * 4 + 1];
      const b = decoded.data[i * 4 + 2];
      elevations[i] = terrariumToElevation(r, g, b);
    }

    tile = {
      x: tileCoords.x,
      y: tileCoords.y,
      zoom,
      elevations,
      fetchedAt: Date.now(),
    };
    tileCache.set(tile);
  }

  const { px, py } = lngLatToPixel(lng, lat, zoom);
  const idx = py * TILE_SIZE + px;
  return tile.elevations[idx];
}

// ---- Batch fetch ----

async function getElevationsBatch(
  points: Array<{ lat: number; lng: number }>,
): Promise<number[]> {
  const zoom = 12;
  const results: number[] = new Array(points.length).fill(0);

  // Group points by tile
  const tileGroups = new Map<string, number[]>();
  for (let i = 0; i < points.length; i++) {
    const { x, y } = lngLatToTile(points[i].lng, points[i].lat, zoom);
    const key = zoom + '/' + x + '/' + y;
    const group = tileGroups.get(key);
    if (group) {
      group.push(i);
    } else {
      tileGroups.set(key, [i]);
    }
  }

  // Process each tile
  const tilePromises = Array.from(tileGroups.entries()).map(async ([_key, indices]) => {
    const firstPt = points[indices[0]];
    const tileCoords = lngLatToTile(firstPt.lng, firstPt.lat, zoom);
    let tile = tileCache.get(tileCoords.x, tileCoords.y, zoom);

    if (!tile) {
      const decoded = await fetchTile(tileCoords.x, tileCoords.y, zoom);
      const elevations = new Float32Array(TILE_SIZE * TILE_SIZE);
      for (let i = 0; i < TILE_SIZE * TILE_SIZE; i++) {
        const r = decoded.data[i * 4];
        const g = decoded.data[i * 4 + 1];
        const b = decoded.data[i * 4 + 2];
        elevations[i] = terrariumToElevation(r, g, b);
      }
      tile = {
        x: tileCoords.x,
        y: tileCoords.y,
        zoom,
        elevations,
        fetchedAt: Date.now(),
      };
      tileCache.set(tile);
    }

    for (const idx of indices) {
      const { px, py } = lngLatToPixel(points[idx].lng, points[idx].lat, zoom);
      const pixelIdx = py * TILE_SIZE + px;
      results[idx] = tile.elevations[pixelIdx];
    }
  });

  await Promise.all(tilePromises);
  return results;
}

// ---- Smoothing ----

/**
 * Apply moving median smoothing.
 * For each point, takes the median within a window centered on it.
 * Handles edge cases: empty array, single element.
 */
export function smoothMedian(values: number[], windowSize: number): number[] {
  if (values.length === 0) return [];
  if (values.length === 1) return [values[0]];
  if (windowSize <= 1) return [...values];

  const w = windowSize % 2 === 0 ? windowSize + 1 : windowSize;
  const half = Math.floor(w / 2);
  const result: number[] = [];

  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(values.length - 1, i + half);
    const window = values.slice(start, end + 1);
    window.sort((a, b) => a - b);
    const mid = Math.floor(window.length / 2);
    result.push(window[mid]);
  }

  return result;
}

// ---- Metrics computation ----

/**
 * Compute elevation metrics from distance-elevation pairs.
 */
export function computeMetrics(
  points: Array<{ distanceKm: number; elevation: number }>,
): ElevationMetrics {
  if (points.length === 0) {
    return {
      totalAscent: 0,
      totalDescent: 0,
      minElevation: 0,
      maxElevation: 0,
      avgSlope: 0,
      maxSlope: 0,
      slopeDistribution: { flat: 0, gentle: 0, moderate: 0, steep: 0, extreme: 0 },
    };
  }

  let totalAscent = 0;
  let totalDescent = 0;
  let minElevation = points[0].elevation;
  let maxElevation = points[0].elevation;
  let maxSlope = 0;
  let totalSlopeSum = 0;
  let slopeCount = 0;

  const distribution: SlopeDistribution = {
    flat: 0, gentle: 0, moderate: 0, steep: 0, extreme: 0,
  };
  let totalDistance = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const elevationDiff = curr.elevation - prev.elevation;
    const dist = curr.distanceKm - prev.distanceKm;

    if (elevationDiff > 0) {
      totalAscent += elevationDiff;
    } else {
      totalDescent += Math.abs(elevationDiff);
    }

    if (curr.elevation < minElevation) minElevation = curr.elevation;
    if (curr.elevation > maxElevation) maxElevation = curr.elevation;

    if (dist > 0) {
      const slopePercent = (elevationDiff / (dist * 1000)) * 100;
      const absSlope = Math.abs(slopePercent);
      if (absSlope > maxSlope) maxSlope = absSlope;
      totalSlopeSum += absSlope;
      slopeCount++;

      if (absSlope < 2) distribution.flat += dist;
      else if (absSlope < 5) distribution.gentle += dist;
      else if (absSlope < 10) distribution.moderate += dist;
      else if (absSlope < 15) distribution.steep += dist;
      else distribution.extreme += dist;

      totalDistance += dist;
    }
  }

  if (totalDistance > 0) {
    distribution.flat = Math.round(distribution.flat * 1000) / 1000;
    distribution.gentle = Math.round(distribution.gentle * 1000) / 1000;
    distribution.moderate = Math.round(distribution.moderate * 1000) / 1000;
    distribution.steep = Math.round(distribution.steep * 1000) / 1000;
    distribution.extreme = Math.round(distribution.extreme * 1000) / 1000;
  }

  return {
    totalAscent: Math.round(totalAscent),
    totalDescent: Math.round(totalDescent),
    minElevation: Math.round(minElevation),
    maxElevation: Math.round(maxElevation),
    avgSlope: slopeCount > 0 ? Math.round((totalSlopeSum / slopeCount) * 10) / 10 : 0,
    maxSlope: Math.round(maxSlope * 10) / 10,
    slopeDistribution: distribution,
  };
}

// ---- Main service ----

/**
 * Compute the full elevation profile for a route.
 * This is the main entry point called by the API endpoint.
 */
export async function computeElevationProfile(
  encodedPolyline: string,
): Promise<ElevationProfile> {
  const coords = decodePolyline(encodedPolyline);

  if (coords.length === 0) {
    return {
      points: [],
      metrics: {
        totalAscent: 0, totalDescent: 0,
        minElevation: 0, maxElevation: 0,
        avgSlope: 0, maxSlope: 0,
        slopeDistribution: { flat: 0, gentle: 0, moderate: 0, steep: 0, extreme: 0 },
      },
    };
  }

  // Build cumulative distances
  const distances: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const d = haversineDistance(prev[0], prev[1], curr[0], curr[1]);
    distances.push(distances[distances.length - 1] + d);
  }
  const totalDistance = distances[distances.length - 1];

  // Sample points every SAMPLE_DISTANCE_M meters
  const sampleCoords: Array<{ lng: number; lat: number; distanceKm: number }> = [];
  let distPointer = 0;
  let currentTarget = 0;

  // Always include start point
  sampleCoords.push({
    lng: coords[0][0], lat: coords[0][1], distanceKm: 0,
  });

  currentTarget += SAMPLE_DISTANCE_M;

  while (currentTarget < totalDistance && distPointer < coords.length - 1) {
    while (
      distPointer < distances.length - 1 &&
      distances[distPointer + 1] < currentTarget
    ) {
      distPointer++;
    }

    if (distPointer >= distances.length - 1) break;

    const segStart = distances[distPointer];
    const segEnd = distances[distPointer + 1];
    const segLength = segEnd - segStart;

    if (segLength > 0) {
      const fraction = (currentTarget - segStart) / segLength;
      const interp = interpolate(coords[distPointer], coords[distPointer + 1], fraction);

      sampleCoords.push({
        lng: interp[0],
        lat: interp[1],
        distanceKm: currentTarget / 1000,
      });
    }

    currentTarget += SAMPLE_DISTANCE_M;
  }

  // Always include end point
  if (totalDistance > 0) {
    sampleCoords.push({
      lng: coords[coords.length - 1][0],
      lat: coords[coords.length - 1][1],
      distanceKm: totalDistance / 1000,
    });
  }

  // Fetch elevations for all sample points (batched by tile)
  const rawElevations = await getElevationsBatch(
    sampleCoords.map((c) => ({ lng: c.lng, lat: c.lat })),
  );

  // Smooth elevations
  const smoothedElevations = smoothMedian(rawElevations, SMOOTH_WINDOW);

  // Build result points
  const points: ElevationPoint[] = sampleCoords.map((c, i) => ({
    distanceKm: Math.round(c.distanceKm * 1000) / 1000,
    elevation: Math.round(smoothedElevations[i] * 10) / 10,
    lat: Math.round(c.lat * 1e6) / 1e6,
    lng: Math.round(c.lng * 1e6) / 1e6,
  }));

  // Compute metrics
  const metricInput = points.map((p) => ({
    distanceKm: p.distanceKm,
    elevation: p.elevation,
  }));
  const metrics = computeMetrics(metricInput);

  return { points, metrics };
}