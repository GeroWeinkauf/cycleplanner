import { describe, it, expect } from 'vitest';
import { computeSafety } from './safety';
import type { RouteAnalysis } from '@cycleplanner/shared';

function analysis(partial: Partial<RouteAnalysis['roadClassDistribution']>): RouteAnalysis {
  return {
    totalDistanceKm: 10,
    durationMin: 30,
    totalAscent: 100,
    totalDescent: 80,
    surfaceDistribution: { asphalt: 100, gravel: 0, dirt: 0, paved: 0, unknown: 0 },
    roadClassDistribution: {
      motorway: 0, trunk: 0, primary: 0, secondary: 0, tertiary: 0,
      residential: 0, service: 0, track: 0, path: 0, cycleway: 0,
      footway: 0, other: 0, ...partial,
    },
    bikeNetworkPercentage: 0,
    crossingCount: 0,
    edges: [],
  };
}

describe('computeSafety', () => {
  it('gives a perfect score for a fully car-free route', () => {
    const r = computeSafety(analysis({ cycleway: 80, path: 20 }));
    expect(r.score).toBe(100);
    expect(r.level).toBe('good');
    expect(r.carFreePct).toBe(100);
  });

  it('penalizes busy roads', () => {
    const r = computeSafety(analysis({ primary: 50, cycleway: 50 }));
    expect(r.score).toBe(55);
    expect(r.level).toBe('poor');
    expect(r.busyRoadPct).toBe(50);
    expect(r.tips.some((t) => t.includes('stark befahrenen'))).toBe(true);
  });

  it('rates mixed routes as moderate', () => {
    const r = computeSafety(analysis({ cycleway: 30, residential: 60, secondary: 10 }));
    // weighted: 0*30 + 0.15*60 + 0.6*10 = 15 → danger 0.15 → score 85
    expect(r.score).toBe(85);
    expect(r.level).toBe('good');
  });

  it('handles empty analysis gracefully', () => {
    const r = computeSafety(analysis({}));
    expect(r.score).toBe(100);
  });

  it('mentions crossings when present', () => {
    const a = analysis({ cycleway: 100 });
    a.crossingCount = 4;
    const r = computeSafety(a);
    expect(r.tips.some((t) => t.includes('Straßenquerungen'))).toBe(true);
  });
});
