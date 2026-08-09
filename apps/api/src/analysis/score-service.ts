/**
 * Quality Score Service (P3-3)
 *
 * Computes a 0-100 quality score from a RouteAnalysis object.
 * Score weights are loaded from config/score-weights.json and vary per profile.
 *
 * Sub-scores measure how well the route matches the profile's expectations.
 */
import type {
  RouteAnalysis,
  QualityScore,
  SubScore,
  ProfileId,
} from '@cycleplanner/shared';
import { loadScoreWeights } from './analysis-service.js';

/**
 * Compute all sub-scores from a route analysis.
 *
 * Each sub-score is 0-100. Values are designed so that:
 * - 100 = perfectly matches the profile
 * - 0 = actively undesirable for the profile
 *
 * Profile-specific tuning is achieved via the weight config,
 * so sub-scores are computed the same way for all profiles.
 */
function computeSubScores(analysis: RouteAnalysis, profile: ProfileId): SubScore[] {
  const dist = analysis.totalDistanceKm || 1; // avoid division by zero
  const sd = analysis.surfaceDistribution;
  const rd = analysis.roadClassDistribution;

  // 1. Surface Quality: how much of the route is on good surface
  //    For Gravel/MTB, "good" includes unpaved. Weight tuning handles this.
  const surfaceGood = sd.asphalt + sd.paved;
  const surfaceScore = Math.min(100, Math.round((surfaceGood / 100) * 100));

  // 2. Bike Infrastructure: percentage on bike networks + cycleways
  const infraPct = analysis.bikeNetworkPercentage;
  const cyclewayPct = rd.cycleway || 0;
  const infraScore = Math.min(100, Math.round(infraPct + cyclewayPct * 2));

  // 3. Traffic Exposure: inverse of major road percentage
  const majorRoadPct = (rd.motorway || 0) + (rd.trunk || 0) + (rd.primary || 0);
  const trafficScore = Math.max(0, Math.min(100, Math.round(100 - majorRoadPct * 2)));

  // 4. Stop Density: fewer crossings = better, normalized to per 10km
  const crossingsPer10km = (analysis.crossingCount / dist) * 10;
  const stopScore = Math.max(0, Math.min(100, Math.round(100 - crossingsPer10km * 10)));

  // 5. Elevation Comfort: based on ascent per km (flat = high score)
  const ascentPerKm = analysis.totalAscent / dist;
  const elevScore = Math.max(0, Math.min(100, Math.round(100 - ascentPerKm * 2)));

  // 6. Amenity Density: placeholder until P4 POI layer is implemented
  const amenityScore = 50; // neutral default

  return [
    { key: 'surfaceQuality', label: 'Oberflaechenqualitaet', value: surfaceScore, weight: 0, weighted: 0, icon: '🛣️' },
    { key: 'bikeInfrastructure', label: 'Radinfrastruktur', value: infraScore, weight: 0, weighted: 0, icon: '🚲' },
    { key: 'trafficExposure', label: 'Verkehrsbelastung', value: trafficScore, weight: 0, weighted: 0, icon: '🚗' },
    { key: 'stopDensity', label: 'Halte- & Kreuzungsdichte', value: stopScore, weight: 0, weighted: 0, icon: '🛑' },
    { key: 'elevationComfort', label: 'Hoehenkomfort', value: elevScore, weight: 0, weighted: 0, icon: '⛰️' },
    { key: 'amenityDensity', label: 'Versorgungsdichte', value: amenityScore, weight: 0, weighted: 0, icon: '☕' },
  ];
}

/**
 * Compute the full quality score for a route.
 */
export function computeQualityScore(
  analysis: RouteAnalysis,
  profile: ProfileId,
): QualityScore {
  const weights = loadScoreWeights(profile);
  const subScores = computeSubScores(analysis, profile);

  // Apply weights
  let totalWeight = 0;
  let weightedSum = 0;

  for (const sub of subScores) {
    const w = weights[sub.key] ?? 0.1;
    sub.weight = w;
    sub.weighted = Math.round(sub.value * w * 10) / 10;
    weightedSum += sub.weighted;
    totalWeight += w;
  }

  // Normalize to 0-100
  const total = totalWeight > 0
    ? Math.round((weightedSum / totalWeight))
    : Math.round(weightedSum);

  return {
    total: Math.min(100, Math.max(0, total)),
    subScores,
    profile,
  };
}
