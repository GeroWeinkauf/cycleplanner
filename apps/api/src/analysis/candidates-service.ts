/**
 * Candidate Route Service (P3-4)
 *
 * Generates multiple route candidates by:
 * (a) Requesting Valhalla alternatives for the base parameters
 * (b) Running a parameter sweep with different cost profiles
 *
 * Each candidate is analyzed and scored. Candidates are sorted by
 * quality score. Filters can exclude candidates (e.g. highway exclusion).
 */
import type {
  CandidateRoute,
  CandidatesResponse,
  RouteAnalysis,
  QualityScore,
  ProfileId,
  CostingOverrides,
  ExclusionFlags,
  Waypoint,
} from '@cycleplanner/shared';
import { analyzeRoute } from './analysis-service.js';
import { computeQualityScore } from './score-service.js';

const VALHALLA_URL = process.env.VALHALLA_URL || 'http://127.0.0.1:8002';

/** Costing parameter sweep configurations */
interface SweepConfig {
  label: string;
  overrides: Partial<CostingOverrides>;
}

const SWEEP_CONFIGS: SweepConfig[] = [
  { label: 'Hill-friendly', overrides: { use_hills: 0.2 } },
  { label: 'Hill-avoidant', overrides: { use_hills: 0.8 } },
  { label: 'Road-avoidant', overrides: { street_avoidance: 0.9 } },
  { label: 'Trail-friendly', overrides: { use_trails: 0.9 } },
  { label: 'Fast-direct', overrides: { cycling_speed: 30, maneuver_penalty: 2 } },
];

/**
 * Call Valhalla /route with given parameters and return geometry + summary.
 */
async function callValhallaRoute(
  waypoints: Waypoint[],
  profile: ProfileId,
  costingOverrides: CostingOverrides,
  exclusionFlags: ExclusionFlags,
  alternatives: number,
): Promise<{ geometry: string; summary: { distanceKm: number; durationMin: number } } | null> {
  const body: Record<string, unknown> = {
    locations: waypoints.map((wp) => ({ lat: wp.lat, lon: wp.lng })),
    costing: 'bicycle',
    costing_options: {
      bicycle: {
        bicycle_type: profileToBicycleType(profile),
        cycling_speed: costingOverrides.cycling_speed ?? 20,
        use_hills: costingOverrides.use_hills ?? 0.35,
        use_ferry: costingOverrides.use_ferry ?? 0.5,
        avoid_bad_surfaces: costingOverrides.avoid_bad_surfaces ?? 0.6,
        use_living_streets: costingOverrides.use_living_streets ?? 0.5,
        use_trails: costingOverrides.use_trails ?? 0.5,
        service_penalty: costingOverrides.service_penalty ?? 0,
        maneuver_penalty: costingOverrides.maneuver_penalty ?? 5,
      },
    },
    directions_options: { units: 'km' },
    alternates: alternatives,
  };

  // Apply hierarchy pruning if requested
  if (costingOverrides.disable_hierarchy_pruning) {
    (body.costing_options as Record<string, unknown>).disable_hierarchy_pruning = true;
  }

  try {
    const res = await fetch(VALHALLA_URL + '/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      trip?: {
        summary?: { length?: number; time?: number };
        legs?: Array<{ shape?: string }>;
      };
      alternates?: Array<{
        trip?: { summary?: { length?: number; time?: number }; legs?: Array<{ shape?: string }> };
      }>;
    };

    const trip = data.trip;
    if (!trip) return null;

    return {
      geometry: trip.legs?.map((l) => l.shape || '').join('') || '',
      summary: {
        distanceKm: Math.round((trip.summary?.length || 0) * 100) / 100,
        durationMin: Math.round(((trip.summary?.time || 0) / 60) * 100) / 100,
      },
    };
  } catch {
    return null;
  }
}

function profileToBicycleType(profile: ProfileId): string {
  switch (profile) {
    case 'Rennrad': return 'Road';
    case 'Gravel': return 'Cross';
    case 'MTB': return 'Mountain';
    default: return 'Hybrid';
  }
}

/**
 * Generate multiple route candidates for the given waypoints.
 */
export async function generateCandidates(
  waypoints: Waypoint[],
  profile: ProfileId,
  costingOverrides: CostingOverrides = {},
  exclusionFlags: ExclusionFlags = {},
): Promise<CandidatesResponse> {
  if (waypoints.length < 2) {
    return { candidates: [] };
  }

  const candidates: CandidateRoute[] = [];
  let idCounter = 0;

  // (a) Base route with Valhalla alternatives
  const baseRoute = await callValhallaRoute(waypoints, profile, costingOverrides, exclusionFlags, 3);

  if (baseRoute) {
    const analysis = await analyzeRoute(baseRoute.geometry, profile);
    const score = computeQualityScore(analysis, profile);

    // Highway exclusion filter
    const highwayPct = analysis.roadClassDistribution.primary +
      analysis.roadClassDistribution.trunk +
      analysis.roadClassDistribution.motorway;

    // Apply highway exclusion if configured
    if (exclusionFlags.exclude_highways && highwayPct > 10) {
      // Skip this candidate due to highway exclusion
    } else {
      candidates.push({
        id: 'c-' + (++idCounter),
        geometry: baseRoute.geometry,
        summary: { ...baseRoute.summary, ascentM: 0, descentM: 0 },
        analysis,
        score,
        source: 'alternative',
        params: { ...costingOverrides },
      });
    }
  }

  // (b) Parameter sweep candidates
  for (const sweep of SWEEP_CONFIGS) {
    const sweepOverrides: CostingOverrides = {
      ...costingOverrides,
      ...sweep.overrides,
    };

    const route = await callValhallaRoute(waypoints, profile, sweepOverrides, exclusionFlags, 0);

    if (route) {
      const analysis = await analyzeRoute(route.geometry, profile);
      const score = computeQualityScore(analysis, profile);

      const highwayPct = analysis.roadClassDistribution.primary +
        analysis.roadClassDistribution.trunk +
        analysis.roadClassDistribution.motorway;

      if (exclusionFlags.exclude_highways && highwayPct > 10) {
        continue; // Skip due to highway exclusion filter
      }

      candidates.push({
        id: 'c-' + (++idCounter),
        geometry: route.geometry,
        summary: { ...route.summary, ascentM: 0, descentM: 0 },
        analysis,
        score,
        source: 'sweep',
        params: { ...sweepOverrides, sweepLabel: sweep.label },
      });
    }
  }

  // Sort by quality score descending
  candidates.sort((a, b) => b.score.total - a.score.total);

  return { candidates };
}
