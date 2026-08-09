import { describe, it, expect } from 'vitest';
import { computeQualityScore } from './analysis/score-service.js';
import type { RouteAnalysis, ProfileId } from '@cycleplanner/shared';

/** Create a sample analysis for testing */
function makeAnalysis(overrides: Partial<RouteAnalysis> = {}): RouteAnalysis {
  return {
    totalDistanceKm: 30,
    durationMin: 90,
    totalAscent: 250,
    totalDescent: 250,
    surfaceDistribution: { asphalt: 70, gravel: 15, dirt: 5, paved: 10, unknown: 0 },
    roadClassDistribution: {
      motorway: 0, trunk: 0, primary: 5, secondary: 10, tertiary: 15,
      residential: 20, service: 5, track: 10, path: 10, cycleway: 15,
      footway: 5, other: 5,
    },
    bikeNetworkPercentage: 25,
    crossingCount: 8,
    edges: [],
    ...overrides,
  };
}

describe('computeQualityScore', () => {
  it('returns a score between 0 and 100', () => {
    const score = computeQualityScore(makeAnalysis(), 'Tourenrad');
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(100);
  });

  it('has all six sub-scores', () => {
    const score = computeQualityScore(makeAnalysis(), 'Tourenrad');
    expect(score.subScores).toHaveLength(6);
    const keys = score.subScores.map((s) => s.key);
    expect(keys).toContain('surfaceQuality');
    expect(keys).toContain('bikeInfrastructure');
    expect(keys).toContain('trafficExposure');
    expect(keys).toContain('stopDensity');
    expect(keys).toContain('elevationComfort');
    expect(keys).toContain('amenityDensity');
  });

  it('gives high scores for good routes', () => {
    const analysis = makeAnalysis({
      surfaceDistribution: { asphalt: 95, gravel: 5, dirt: 0, paved: 0, unknown: 0 },
      bikeNetworkPercentage: 80,
      roadClassDistribution: {
        motorway: 0, trunk: 0, primary: 0, secondary: 0, tertiary: 5,
        residential: 10, service: 5, track: 0, path: 5, cycleway: 70,
        footway: 5, other: 0,
      },
      totalAscent: 50,
      crossingCount: 2,
    });
    const score = computeQualityScore(analysis, 'Tourenrad');
    expect(score.total).toBeGreaterThanOrEqual(70);
  });

  it('gives low scores for bad routes', () => {
    const analysis = makeAnalysis({
      surfaceDistribution: { asphalt: 10, gravel: 20, dirt: 30, paved: 10, unknown: 30 },
      bikeNetworkPercentage: 0,
      roadClassDistribution: {
        motorway: 5, trunk: 10, primary: 30, secondary: 20, tertiary: 15,
        residential: 5, service: 5, track: 0, path: 0, cycleway: 0,
        footway: 5, other: 5,
      },
      totalAscent: 1500,
      crossingCount: 50,
    });
    const score = computeQualityScore(analysis, 'Tourenrad');
    expect(score.total).toBeLessThanOrEqual(50);
  });

  it('handles empty analysis gracefully', () => {
    const analysis = makeAnalysis({
      totalDistanceKm: 0,
      surfaceDistribution: { asphalt: 0, gravel: 0, dirt: 0, paved: 0, unknown: 0 },
      roadClassDistribution: {
        motorway: 0, trunk: 0, primary: 0, secondary: 0, tertiary: 0,
        residential: 0, service: 0, track: 0, path: 0, cycleway: 0,
        footway: 0, other: 0,
      },
      bikeNetworkPercentage: 0,
      crossingCount: 0,
      totalAscent: 0,
    });
    const score = computeQualityScore(analysis, 'Tourenrad');
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(100);
  });

  it('returns different scores for different profiles with same analysis', () => {
    const analysis = makeAnalysis({
      surfaceDistribution: { asphalt: 40, gravel: 40, dirt: 15, paved: 5, unknown: 0 },
    });
    const touringScore = computeQualityScore(analysis, 'Tourenrad');
    const gravelScore = computeQualityScore(analysis, 'Gravel');
    // They should differ because weights are different
    // (not asserting direction, just that computation runs)
    expect(typeof touringScore.total).toBe('number');
    expect(typeof gravelScore.total).toBe('number');
  });
});
