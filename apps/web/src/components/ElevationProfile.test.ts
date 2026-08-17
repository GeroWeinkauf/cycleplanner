import { describe, it, expect } from 'vitest';
import { interpolateAt } from './ElevationProfile';
import type { ElevationPoint } from '@cycleplanner/shared';

function pt(distanceKm: number, elevation: number, lat = 51, lng = 12): ElevationPoint {
  return { distanceKm, elevation, lat, lng };
}

describe('interpolateAt', () => {
  const points = [pt(0, 100), pt(0.05, 110), pt(0.1, 90)];

  it('interpolates elevation, position and slope between two samples', () => {
    const info = interpolateAt(points, 0.075);
    expect(info.elevation).toBeCloseTo(100, 6);
    // slope over 50 m: (90 - 110) / 50 m * 100 = -40 %
    expect(info.slopePercent).toBeCloseTo(-40, 6);
    // lat/lng interpolated halfway between points[1] and points[2]
    expect(info.lat).toBeCloseTo(51, 6);
    expect(info.lng).toBeCloseTo(12, 6);
  });

  it('returns the first sample with the first segment slope before the start', () => {
    const info = interpolateAt(points, 0);
    expect(info.elevation).toBe(100);
    expect(info.slopePercent).toBeCloseTo(20, 6); // (110-100)/50m*100
  });

  it('returns the last sample with the last segment slope after the end', () => {
    const info = interpolateAt(points, 0.2);
    expect(info.elevation).toBe(90);
    expect(info.slopePercent).toBeCloseTo(-40, 6);
  });

  it('handles an exact sample hit using the forward segment slope', () => {
    const info = interpolateAt(points, 0.05);
    expect(info.elevation).toBe(110);
    expect(info.slopePercent).toBeCloseTo(-40, 6);
  });

  it('handles a single point with zero slope', () => {
    const info = interpolateAt([pt(0, 250)], 0.001);
    expect(info.elevation).toBe(250);
    expect(info.slopePercent).toBe(0);
  });

  it('handles an empty point list with zeros', () => {
    const info = interpolateAt([], 1);
    expect(info.elevation).toBe(0);
    expect(info.slopePercent).toBe(0);
  });

  it('interpolates lat/lng correctly', () => {
    const pts = [pt(0, 100, 51.0, 12.0), pt(1, 200, 52.0, 13.0)];
    const info = interpolateAt(pts, 0.25);
    expect(info.lat).toBeCloseTo(51.25, 6);
    expect(info.lng).toBeCloseTo(12.25, 6);
    expect(info.elevation).toBeCloseTo(125, 6);
  });
});
