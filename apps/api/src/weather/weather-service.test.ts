import { describe, it, expect } from 'vitest';
import {
  bearingDeg,
  haversineKm,
  tailwindComponentKmh,
  weatherLabel,
  weatherRiskLevel,
  scoreWindow,
  sampleRoute,
  evaluateRouteOnGrid,
  type GridPoint,
} from './weather-service';
import type { RouteWeatherSummary } from '@cycleplanner/shared';

describe('haversineKm', () => {
  it('measures ~111 km per degree of latitude', () => {
    const d = haversineKm([12, 51], [12, 52]);
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  it('returns 0 for identical points', () => {
    expect(haversineKm([12, 51], [12, 51])).toBe(0);
  });
});

describe('bearingDeg', () => {
  it('points north (0°)', () => {
    expect(bearingDeg([12, 51], [12, 52])).toBeCloseTo(0, 1);
  });
  it('points east (~90°)', () => {
    // Great-circle bearing along a parallel at 51°N is slightly below 90°
    expect(bearingDeg([12, 51], [13, 51])).toBeCloseTo(90, 0);
  });
  it('points south (180°)', () => {
    expect(bearingDeg([12, 52], [12, 51])).toBeCloseTo(180, 1);
  });
});

describe('tailwindComponentKmh', () => {
  it('wind from behind = positive tailwind', () => {
    // traveling north (0°), wind comes FROM south (180°) → tailwind
    expect(tailwindComponentKmh(20, 180, 0)).toBeCloseTo(20, 5);
  });
  it('wind from ahead = negative (headwind)', () => {
    // traveling north (0°), wind comes FROM north (0°) → headwind
    expect(tailwindComponentKmh(20, 0, 0)).toBeCloseTo(-20, 5);
  });
  it('side wind = ~0', () => {
    expect(tailwindComponentKmh(20, 90, 0)).toBeCloseTo(0, 5);
  });
});

describe('weatherLabel', () => {
  it('maps common codes', () => {
    expect(weatherLabel(0)).toBe('Sonnig');
    expect(weatherLabel(61)).toBe('Regen');
    expect(weatherLabel(95)).toBe('Gewitter');
    expect(weatherLabel(45)).toBe('Nebel');
  });
});

describe('weatherRiskLevel', () => {
  it('thunderstorm is always critical', () => {
    expect(weatherRiskLevel(95, 0, 0)).toBe(2);
  });
  it('high rain probability is critical', () => {
    expect(weatherRiskLevel(3, 70, 0)).toBe(2);
  });
  it('medium probability is a warning', () => {
    expect(weatherRiskLevel(3, 40, 0)).toBe(1);
  });
  it('dry weather is ok', () => {
    expect(weatherRiskLevel(1, 5, 0)).toBe(0);
  });
});

describe('scoreWindow', () => {
  const good: RouteWeatherSummary = {
    avgHeadwindKmh: 0, avgTailwindKmh: 0, maxPrecipProbPct: 0,
    avgTempC: 18, avgWindKmh: 5, stormRisk: false,
  };
  it('good weather scores high and green', () => {
    const r = scoreWindow(good);
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.level).toBe(0);
  });
  it('rain lowers the score', () => {
    const goodScore = scoreWindow(good).score;
    const r = scoreWindow({ ...good, maxPrecipProbPct: 100 });
    expect(r.score).toBeLessThan(goodScore - 40);
  });
  it('storm lowers the score strongly', () => {
    const r = scoreWindow({ ...good, stormRisk: true });
    expect(r.score).toBeLessThanOrEqual(75);
  });
});

describe('sampleRoute', () => {
  const route: Array<[number, number]> = [[12, 51], [12, 52], [13, 52]];
  it('returns start and end fractions', () => {
    const s = sampleRoute(route, 6);
    expect(s[0].frac).toBe(0);
    expect(s[s.length - 1].frac).toBeCloseTo(1, 6);
  });
  it('caps at the number of route points', () => {
    expect(sampleRoute(route, 60).length).toBe(3);
  });
  it('cumulative distances are monotonic', () => {
    const s = sampleRoute(route, 6);
    for (let i = 1; i < s.length; i++) {
      expect(s[i].distKm).toBeGreaterThan(s[i - 1].distKm);
    }
  });
});

/** Synthetic grid: constant values over 72 hours */
function makeGrid(baseTimeSec: number, fracs: number[], windSpeed = 20, windDir = 270): GridPoint[] {
  const hourly = {
    timeSec: Array.from({ length: 72 }, (_, i) => baseTimeSec + i * 3600),
    tempC: Array.from({ length: 72 }, () => 18),
    precipProbPct: Array.from({ length: 72 }, () => 10),
    rainMm: Array.from({ length: 72 }, () => 0),
    windSpeedKmh: Array.from({ length: 72 }, () => windSpeed),
    windDirDeg: Array.from({ length: 72 }, () => windDir),
    weatherCode: Array.from({ length: 72 }, () => 1),
  };
  return fracs.map((frac) => ({ lat: 51, lng: 12, frac, hourly }));
}

describe('evaluateRouteOnGrid', () => {
  const route: Array<[number, number]> = [[12, 51], [12.2, 51], [12.4, 51]]; // west → east
  const baseTime = Math.floor(Date.UTC(2026, 7, 17, 8, 0) / 1000);

  it('detects tailwind when wind comes from behind (west wind, eastbound)', () => {
    const grid = makeGrid(baseTime, [0, 0.5, 1], 20, 270); // wind FROM west
    const result = evaluateRouteOnGrid(route, baseTime * 1000, 18, grid);
    expect(result).not.toBeNull();
    expect(result!.summary.avgTailwindKmh).toBeCloseTo(20, 0);
    expect(result!.summary.avgHeadwindKmh).toBe(0);
  });

  it('detects headwind when wind comes from ahead', () => {
    const grid = makeGrid(baseTime, [0, 0.5, 1], 20, 90); // wind FROM east
    const result = evaluateRouteOnGrid(route, baseTime * 1000, 18, grid);
    expect(result).not.toBeNull();
    expect(result!.summary.avgHeadwindKmh).toBeCloseTo(20, 0);
    expect(result!.summary.avgTailwindKmh).toBe(0);
  });

  it('produces one segment per distance bucket', () => {
    const grid = makeGrid(baseTime, [0, 0.5, 1]);
    const result = evaluateRouteOnGrid(route, baseTime * 1000, 18, grid);
    expect(result!.segments.length).toBeGreaterThanOrEqual(5);
    expect(result!.segments.length).toBeLessThanOrEqual(12);
  });

  it('returns null for an empty grid', () => {
    expect(evaluateRouteOnGrid(route, baseTime * 1000, 18, [])).toBeNull();
  });
});
