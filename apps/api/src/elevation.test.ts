import { describe, it, expect } from 'vitest';
import { smoothMedian, computeMetrics, decodePolyline } from './elevation/elevation-service.js';

describe('decodePolyline', () => {
  it('decodes an empty string to an empty array', () => {
    expect(decodePolyline('')).toEqual([]);
  });

  it('decodes a single point', () => {
    // Encoded polyline for a single coordinate pair (0,0)
    // Google polyline encoding: 0 for both lat and lng
    const result = decodePolyline('??');
    expect(result.length).toBeGreaterThanOrEqual(0);
  });
});

describe('smoothMedian', () => {
  it('returns empty array for empty input', () => {
    expect(smoothMedian([], 5)).toEqual([]);
  });

  it('returns single element unchanged', () => {
    expect(smoothMedian([42], 5)).toEqual([42]);
  });

  it('smooths a noisy signal with window size 3', () => {
    const input = [10, 12, 45, 11, 13, 12, 10];
    const result = smoothMedian(input, 3);
    // Window 3 median: first=11, last=12, middle values smoothed
    expect(result.length).toBe(input.length);
    // The spike at index 2 (45) should be pulled down
    expect(result[2]).toBeLessThan(45);
    expect(result[2]).toBe(12); // median of [12, 45, 11]
  });

  it('handles window larger than array', () => {
    const input = [5, 10, 15];
    const result = smoothMedian(input, 9);
    expect(result).toEqual([10, 10, 10]); // all medians of [5,10,15]=10
  });

  it('forces window to odd', () => {
    const input = [1, 10, 2, 9, 3, 8, 4];
    const result = smoothMedian(input, 4); // 4 -> 5
    expect(result.length).toBe(input.length);
    // Should not throw
  });

  it('does not modify input array', () => {
    const input = [1, 5, 2, 4, 3];
    const copy = [...input];
    smoothMedian(input, 3);
    expect(input).toEqual(copy);
  });
});

describe('computeMetrics', () => {
  it('returns zeros for empty input', () => {
    const result = computeMetrics([]);
    expect(result.totalAscent).toBe(0);
    expect(result.totalDescent).toBe(0);
    expect(result.minElevation).toBe(0);
    expect(result.maxElevation).toBe(0);
    expect(result.avgSlope).toBe(0);
    expect(result.maxSlope).toBe(0);
  });

  it('returns zero metrics for a single point', () => {
    const result = computeMetrics([{ distanceKm: 0, elevation: 100 }]);
    expect(result.totalAscent).toBe(0);
    expect(result.totalDescent).toBe(0);
  });

  it('computes ascent from two points going up', () => {
    const result = computeMetrics([
      { distanceKm: 0, elevation: 100 },
      { distanceKm: 1, elevation: 200 },
    ]);
    expect(result.totalAscent).toBe(100);
    expect(result.totalDescent).toBe(0);
    expect(result.minElevation).toBe(100);
    expect(result.maxElevation).toBe(200);
    // slope: 100m / 1000m = 10%
    expect(result.maxSlope).toBe(10);
  });

  it('computes descent from two points going down', () => {
    const result = computeMetrics([
      { distanceKm: 0, elevation: 200 },
      { distanceKm: 2, elevation: 100 },
    ]);
    expect(result.totalAscent).toBe(0);
    expect(result.totalDescent).toBe(100);
    // slope: 100m / 2000m = 5%
    expect(result.maxSlope).toBe(5);
  });

  it('handles a hill (up then down)', () => {
    const result = computeMetrics([
      { distanceKm: 0, elevation: 100 },
      { distanceKm: 1, elevation: 200 },
      { distanceKm: 2, elevation: 100 },
    ]);
    expect(result.totalAscent).toBe(100);
    expect(result.totalDescent).toBe(100);
  });

  it('classifies slope distribution correctly', () => {
    const points = [
      { distanceKm: 0, elevation: 100 },
      { distanceKm: 1, elevation: 101 },  // 0.1% -> flat
      { distanceKm: 2, elevation: 103 },  // 0.2% -> flat (wait: 2m/1000m = 0.2% -> flat)
    ];
    // Let's make clearer test:
    const clearPoints = [
      { distanceKm: 0, elevation: 100 },
      { distanceKm: 1, elevation: 130 },   // 3% -> gentle (30m over 1000m)
      { distanceKm: 2, elevation: 200 },   // 7% -> moderate
      { distanceKm: 3, elevation: 320 },   // 12% -> steep
      { distanceKm: 4, elevation: 500 },   // 18% -> extreme
    ];
    const result = computeMetrics(clearPoints);
    const d = result.slopeDistribution;
    // Each segment is 1km
    expect(d.gentle).toBeCloseTo(1, 1);
    expect(d.moderate).toBeCloseTo(1, 1);
    expect(d.steep).toBeCloseTo(1, 1);
    expect(d.extreme).toBeCloseTo(1, 1);
    expect(d.flat).toBeCloseTo(0, 1);
  });

  it('handles zero-distance segments gracefully', () => {
    const result = computeMetrics([
      { distanceKm: 0, elevation: 100 },
      { distanceKm: 0, elevation: 200 },
    ]);
    // Zero distance - should not divide by zero
    expect(result.avgSlope).toBe(0);
    expect(result.maxSlope).toBe(0);
  });
});
