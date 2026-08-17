/**
 * Weather Service (P4)
 *
 * Fetches hourly forecasts from Open-Meteo (free, no API key) for a few
 * points along the route and evaluates weather along the route for a given
 * start time and average speed. Also evaluates departure windows for the
 * start-time optimizer.
 */
import type {
  RouteWeatherReport,
  RouteWeatherSummary,
  StartWindow,
  WeatherRiskLevel,
  WeatherSegment,
} from '@cycleplanner/shared';

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
/** Number of grid points fetched along the route */
const GRID_POINTS = 6;
/** Number of distance buckets for the segment report */
const SEGMENT_BUCKETS = 10;
/** Default average speed in km/h */
const DEFAULT_SPEED_KMH = 18;

// ── Geometry helpers ─────────────────────────

export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Bearing from a to b in degrees (0-360) */
export function bearingDeg(a: [number, number], b: [number, number]): number {
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Tailwind component along the travel direction.
 * windDirDeg = meteorological direction (where the wind comes FROM).
 * Returns positive for tailwind, negative for headwind.
 */
export function tailwindComponentKmh(
  windSpeedKmh: number,
  windDirDeg: number,
  travelBearingDeg: number,
): number {
  const velocityDir = (windDirDeg + 180) % 360;
  const diff = ((travelBearingDeg - velocityDir + 540) % 360) - 180;
  return windSpeedKmh * Math.cos((diff * Math.PI) / 180);
}

// ── Weather classification ───────────────────

/** Map WMO weather code to a German label */
export function weatherLabel(code: number): string {
  if (code === 0) return 'Sonnig';
  if (code <= 2) return 'Leicht bewölkt';
  if (code === 3) return 'Bedeckt';
  if (code === 45 || code === 48) return 'Nebel';
  if (code >= 95) return 'Gewitter';
  if (code >= 80) return 'Schauer';
  if (code >= 71) return 'Schnee';
  if (code >= 61) return 'Regen';
  if (code >= 51) return 'Niesel';
  return 'Unbekannt';
}

/** Risk level 0/1/2 for a segment */
export function weatherRiskLevel(
  weatherCode: number,
  precipProbPct: number,
  rainMm: number,
): WeatherRiskLevel {
  if (weatherCode >= 95) return 2; // thunderstorm
  if (precipProbPct >= 60 || rainMm >= 1) return 2;
  if (precipProbPct >= 30 || rainMm >= 0.2) return 1;
  return 0;
}

// ── Open-Meteo fetch ─────────────────────────

interface HourlyData {
  timeSec: number[];
  tempC: number[];
  precipProbPct: number[];
  rainMm: number[];
  windSpeedKmh: number[];
  windDirDeg: number[];
  weatherCode: number[];
}

export interface GridPoint {
  lat: number;
  lng: number;
  /** Fraction along the route (0..1) */
  frac: number;
  hourly: HourlyData;
}

function parseIsoHour(iso: string): number {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 1000);
}

async function fetchGridPoint(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string,
): Promise<GridPoint | null> {
  const url = new URL(OPEN_METEO);
  url.searchParams.set('latitude', lat.toFixed(4));
  url.searchParams.set('longitude', lng.toFixed(4));
  url.searchParams.set(
    'hourly',
    'temperature_2m,precipitation_probability,precipitation,weathercode,wind_speed_10m,wind_direction_10m',
  );
  url.searchParams.set('wind_speed_unit', 'kmh');
  url.searchParams.set('start_date', startDate);
  url.searchParams.set('end_date', endDate);
  url.searchParams.set('timezone', 'auto');

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      hourly?: {
        time?: string[];
        temperature_2m?: number[];
        precipitation_probability?: number[];
        precipitation?: number[];
        wind_speed_10m?: number[];
        wind_direction_10m?: number[];
        weathercode?: number[];
      };
    };
    const h = data.hourly;
    if (!h || !h.time) return null;
    return {
      lat,
      lng,
      frac: 0, // set by caller
      hourly: {
        timeSec: h.time.map(parseIsoHour),
        tempC: h.temperature_2m ?? [],
        precipProbPct: h.precipitation_probability ?? h.time.map(() => 0),
        rainMm: h.precipitation ?? h.time.map(() => 0),
        windSpeedKmh: h.wind_speed_10m ?? h.time.map(() => 0),
        windDirDeg: h.wind_direction_10m ?? h.time.map(() => 0),
        weatherCode: h.weathercode ?? h.time.map(() => 0),
      },
    };
  } catch {
    return null;
  }
}

function dateStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Sample the route down to at most `count` points with cumulative fractions */
export function sampleRoute(
  route: Array<[number, number]>,
  count: number,
): Array<{ lng: number; lat: number; frac: number; distKm: number }> {
  if (route.length === 0) return [];
  if (route.length === 1) {
    return [{ lng: route[0][0], lat: route[0][1], frac: 0, distKm: 0 }];
  }
  const dists: number[] = [0];
  for (let i = 1; i < route.length; i++) {
    dists.push(dists[i - 1] + haversineKm(route[i - 1], route[i]));
  }
  const total = dists[dists.length - 1] || 1;
  const countCapped = Math.min(count, route.length);
  const out: Array<{ lng: number; lat: number; frac: number; distKm: number }> = [];
  for (let i = 0; i < countCapped; i++) {
    const targetDist = (total * i) / (countCapped - 1 || 1);
    // find index with dists[idx] >= targetDist
    let idx = 0;
    while (idx < route.length - 1 && dists[idx + 1] < targetDist) idx++;
    const segStart = dists[idx];
    const segLen = dists[idx + 1] - segStart;
    const f = segLen > 0 ? (targetDist - segStart) / segLen : 0;
    const lng = route[idx][0] + (route[idx + 1][0] - route[idx][0]) * f;
    const lat = route[idx][1] + (route[idx + 1][1] - route[idx][1]) * f;
    out.push({ lng, lat, frac: i / (countCapped - 1 || 1), distKm: targetDist });
  }
  return out;
}

async function fetchGrid(
  route: Array<[number, number]>,
  startMs: number,
  endMs: number,
): Promise<GridPoint[]> {
  const samples = sampleRoute(route, GRID_POINTS);
  const startDate = dateStr(startMs);
  const endDate = dateStr(endMs);
  const results = await Promise.all(
    samples.map((s) => fetchGridPoint(s.lat, s.lng, startDate, endDate)),
  );
  const grid: GridPoint[] = [];
  samples.forEach((s, i) => {
    const gp = results[i];
    if (gp) {
      gp.frac = s.frac;
      grid.push(gp);
    }
  });
  return grid;
}

/** Public alias used by the wind-optimized route endpoint */
export function fetchWeatherGrid(
  route: Array<[number, number]>,
  startMs: number,
  durationMs: number,
): Promise<GridPoint[]> {
  return fetchGrid(route, startMs, startMs + durationMs + 3600000);
}

// ── Interpolation over the grid ──────────────

function valueAtHour(h: HourlyData, hourSec: number, field: keyof HourlyData): number {
  const times = h.timeSec;
  if (times.length === 0) return 0;
  if (hourSec <= times[0]) return (h[field] as number[])[0] ?? 0;
  if (hourSec >= times[times.length - 1]) return (h[field] as number[])[times.length - 1] ?? 0;
  // nearest hour
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(times[i] - hourSec);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return (h[field] as number[])[best] ?? 0;
}

interface InterpolatedWeather {
  tempC: number;
  precipProbPct: number;
  rainMm: number;
  windSpeedKmh: number;
  windDirDeg: number;
  weatherCode: number;
}

/** Weather at a route fraction and absolute time, interpolated over the grid */
export function weatherAt(
  grid: GridPoint[],
  frac: number,
  timeMs: number,
): InterpolatedWeather | null {
  if (grid.length === 0) return null;
  const hourSec = Math.floor(timeMs / 1000 / 3600) * 3600;
  const g = grid[0];
  if (grid.length === 1) {
    return {
      tempC: valueAtHour(g.hourly, hourSec, 'tempC'),
      precipProbPct: valueAtHour(g.hourly, hourSec, 'precipProbPct'),
      rainMm: valueAtHour(g.hourly, hourSec, 'rainMm'),
      windSpeedKmh: valueAtHour(g.hourly, hourSec, 'windSpeedKmh'),
      windDirDeg: valueAtHour(g.hourly, hourSec, 'windDirDeg'),
      weatherCode: Math.round(valueAtHour(g.hourly, hourSec, 'weatherCode')),
    };
  }
  // find bracketing grid points by frac
  let a = grid[0];
  let b = grid[grid.length - 1];
  for (let i = 0; i < grid.length - 1; i++) {
    if (frac >= grid[i].frac && frac <= grid[i + 1].frac) {
      a = grid[i];
      b = grid[i + 1];
      break;
    }
  }
  const span = b.frac - a.frac || 1;
  const t = Math.max(0, Math.min(1, (frac - a.frac) / span));
  const lerp = (va: number, vb: number) => va + (vb - va) * t;
  const read = (field: keyof HourlyData) =>
    lerp(valueAtHour(a.hourly, hourSec, field), valueAtHour(b.hourly, hourSec, field));

  return {
    tempC: read('tempC'),
    precipProbPct: read('precipProbPct'),
    rainMm: read('rainMm'),
    windSpeedKmh: read('windSpeedKmh'),
    windDirDeg: read('windDirDeg'),
    weatherCode: Math.round(read('weatherCode')),
  };
}

// ── Route evaluation ─────────────────────────

export interface EvaluatedRoute {
  segments: WeatherSegment[];
  summary: RouteWeatherSummary;
}

/** Evaluate weather along the route for a given start time and speed */
export function evaluateRouteOnGrid(
  route: Array<[number, number]>,
  startMs: number,
  avgSpeedKmh: number,
  grid: GridPoint[],
): EvaluatedRoute | null {
  const samples = sampleRoute(route, 120);
  if (samples.length < 2 || grid.length === 0) return null;
  const totalKm = samples[samples.length - 1].distKm;
  const durationMs = (totalKm / Math.max(avgSpeedKmh, 5)) * 3600 * 1000;

  const segments: WeatherSegment[] = [];
  const bucketKm = Math.max(totalKm / SEGMENT_BUCKETS, 0.2);
  let bucketStart = 0;

  while (bucketStart < totalKm - 1e-6) {
    const bucketEnd = Math.min(bucketStart + bucketKm, totalKm);
    const midKm = (bucketStart + bucketEnd) / 2;
    const midFrac = totalKm > 0 ? midKm / totalKm : 0;
    const timeMs = startMs + durationMs * midFrac;
    const w = weatherAt(grid, midFrac, timeMs);
    // bearing over the bucket
    const a = samples.find((s) => s.distKm >= bucketStart) ?? samples[0];
    const b = samples.find((s) => s.distKm >= bucketEnd) ?? samples[samples.length - 1];
    const brg = bearingDeg([a.lng, a.lat], [b.lng, b.lat]);
    const headwind = w ? -tailwindComponentKmh(w.windSpeedKmh, w.windDirDeg, brg) : 0;
    const code = w?.weatherCode ?? 0;
    const precipProb = w?.precipProbPct ?? 0;
    const rain = w?.rainMm ?? 0;
    segments.push({
      fromKm: Math.round(bucketStart * 100) / 100,
      toKm: Math.round(bucketEnd * 100) / 100,
      level: weatherRiskLevel(code, precipProb, rain),
      tempC: Math.round((w?.tempC ?? 0) * 10) / 10,
      precipProbPct: Math.round(precipProb),
      rainMm: Math.round(rain * 10) / 10,
      windSpeedKmh: Math.round(w?.windSpeedKmh ?? 0),
      windDirDeg: Math.round(w?.windDirDeg ?? 0),
      headwindKmh: Math.round(headwind * 10) / 10,
      weatherCode: code,
      weatherLabel: weatherLabel(code),
    });
    bucketStart = bucketEnd;
  }

  const head = segments.filter((s) => s.headwindKmh > 0).map((s) => s.headwindKmh);
  const tail = segments.filter((s) => s.headwindKmh < 0).map((s) => -s.headwindKmh);
  const summary: RouteWeatherSummary = {
    avgHeadwindKmh: Math.round((head.reduce((x, y) => x + y, 0) / (head.length || 1)) * 10) / 10,
    avgTailwindKmh: Math.round((tail.reduce((x, y) => x + y, 0) / (tail.length || 1)) * 10) / 10,
    maxPrecipProbPct: Math.max(...segments.map((s) => s.precipProbPct)),
    avgTempC: Math.round((segments.reduce((x, s) => x + s.tempC, 0) / segments.length) * 10) / 10,
    avgWindKmh: Math.round((segments.reduce((x, s) => x + s.windSpeedKmh, 0) / segments.length) * 10) / 10,
    stormRisk: segments.some((s) => s.weatherCode >= 95),
  };
  return { segments, summary };
}

// ── Departure window evaluation ──────────────

/** Comfort score 0-100 + level for a window */
export function scoreWindow(summary: RouteWeatherSummary): { score: number; level: WeatherRiskLevel } {
  let score = 100;
  score -= Math.min(60, summary.maxPrecipProbPct * 0.6);
  if (summary.stormRisk) score -= 25;
  const t = summary.avgTempC;
  if (t < 5) score -= 25;
  else if (t < 12) score -= 10;
  else if (t > 30) score -= 25;
  else if (t > 25) score -= 10;
  score += Math.min(15, summary.avgTailwindKmh);
  score -= Math.min(20, summary.avgHeadwindKmh * 0.5);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const level: WeatherRiskLevel = score >= 75 ? 0 : score >= 45 ? 1 : 2;
  return { score, level };
}

/**
 * Evaluate departure windows: every full hour from now on, within the horizon.
 * Returns windows sorted by score (best first).
 */
export function evaluateWindowsOnGrid(
  route: Array<[number, number]>,
  grid: GridPoint[],
  avgSpeedKmh: number,
  horizonHours: number,
  nowMs: number,
): StartWindow[] {
  const totalKm = sampleRoute(route, 120).at(-1)?.distKm ?? 0;
  const durationMs = (totalKm / Math.max(avgSpeedKmh, 5)) * 3600 * 1000;
  const windows: StartWindow[] = [];
  let start = Math.ceil(nowMs / 3600000) * 3600000;
  const horizonEnd = nowMs + horizonHours * 3600000;
  let guard = 0;
  while (start + durationMs < horizonEnd && guard < 120) {
    // Only daytime departures (06:00–20:00 local time) make sense for cycling
    const hour = new Date(start).getHours();
    if (hour < 6 || hour >= 20) {
      start += 3600000;
      guard++;
      continue;
    }
    const evaluated = evaluateRouteOnGrid(route, start, avgSpeedKmh, grid);
    if (evaluated) {
      const { score, level } = scoreWindow(evaluated.summary);
      windows.push({
        startTimeIso: new Date(start).toISOString(),
        level,
        score,
        maxPrecipProbPct: evaluated.summary.maxPrecipProbPct,
        avgTempC: evaluated.summary.avgTempC,
        avgHeadwindKmh: evaluated.summary.avgHeadwindKmh,
        avgTailwindKmh: evaluated.summary.avgTailwindKmh,
        weatherLabel: weatherLabel(evaluated.segments[0]?.weatherCode ?? 0),
      });
    }
    start += 3600000;
    guard++;
  }
  windows.sort((a, b) => b.score - a.score);
  return windows;
}

// ── Public service functions ─────────────────

export async function getRouteWeatherReport(
  route: Array<[number, number]>,
  startTimeIso: string | undefined,
  avgSpeedKmh: number | undefined,
): Promise<RouteWeatherReport | null> {
  if (route.length < 2) return null;
  const speed = avgSpeedKmh ?? DEFAULT_SPEED_KMH;
  const startMs = startTimeIso ? Date.parse(startTimeIso) : Date.now();
  if (isNaN(startMs)) return null;
  const totalKm = sampleRoute(route, 120).at(-1)?.distKm ?? 0;
  const durationMs = (totalKm / Math.max(speed, 5)) * 3600 * 1000;
  const grid = await fetchGrid(route, startMs, startMs + durationMs + 3600000);
  const evaluated = evaluateRouteOnGrid(route, startMs, speed, grid);
  if (!evaluated) return null;
  return {
    startTimeIso: new Date(startMs).toISOString(),
    segments: evaluated.segments,
    summary: evaluated.summary,
  };
}

export async function getStartWindows(
  route: Array<[number, number]>,
  avgSpeedKmh: number | undefined,
  horizonHours: number | undefined,
): Promise<StartWindow[]> {
  if (route.length < 2) return [];
  const speed = avgSpeedKmh ?? DEFAULT_SPEED_KMH;
  const horizon = Math.min(horizonHours ?? 48, 72);
  const nowMs = Date.now();
  const totalKm = sampleRoute(route, 120).at(-1)?.distKm ?? 0;
  const durationMs = (totalKm / Math.max(speed, 5)) * 3600 * 1000;
  const grid = await fetchGrid(route, nowMs, nowMs + horizon * 3600000 + durationMs);
  return evaluateWindowsOnGrid(route, grid, speed, horizon, nowMs);
}
