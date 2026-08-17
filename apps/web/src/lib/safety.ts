import type { RouteAnalysis, RoadClassDistribution } from '@cycleplanner/shared';

export interface SafetyResult {
  /** 0 (dangerous) – 100 (very safe) */
  score: number;
  /** 'good' | 'moderate' | 'poor' */
  level: 'good' | 'moderate' | 'poor';
  /** Share of the route that is car-free (cycleway/path/footway) in % */
  carFreePct: number;
  /** Share on busy roads (primary/trunk/motorway) in % */
  busyRoadPct: number;
  /** Bike network share in % */
  bikeNetworkPct: number;
  /** Human-readable improvement tips */
  tips: string[];
}

/** Danger weight per road class (0 = car-free, 1 = worst) */
const ROAD_CLASS_WEIGHTS: Record<keyof RoadClassDistribution, number> = {
  motorway: 1.0,
  trunk: 1.0,
  primary: 0.9,
  secondary: 0.6,
  tertiary: 0.35,
  residential: 0.15,
  service: 0.2,
  track: 0.3,
  path: 0.0,
  cycleway: 0.0,
  footway: 0.0,
  other: 0.5,
};

/**
 * Compute a safety score (0–100) from the route analysis.
 * Pure function → unit-testable.
 */
export function computeSafety(analysis: RouteAnalysis): SafetyResult {
  const rd = analysis.roadClassDistribution;
  let weighted = 0;
  let total = 0;
  for (const [cls, share] of Object.entries(rd) as Array<[keyof RoadClassDistribution, number]>) {
    weighted += share * ROAD_CLASS_WEIGHTS[cls];
    total += share;
  }
  const dangerShare = total > 0 ? weighted / total : 0; // 0..1
  const score = Math.max(0, Math.min(100, Math.round(100 * (1 - dangerShare))));

  const carFreePct = rd.cycleway + rd.path + rd.footway;
  const busyRoadPct = rd.primary + rd.trunk + rd.motorway;
  const bikeNetworkPct = analysis.bikeNetworkPercentage ?? 0;

  const tips: string[] = [];
  if (busyRoadPct >= 10) {
    tips.push(`${busyRoadPct.toFixed(0)} % der Strecke verlaufen auf stark befahrenen Straßen — Alternative mit mehr Radwegen suchen.`);
  } else if (busyRoadPct > 0) {
    tips.push(`Nur ${busyRoadPct.toFixed(0)} % auf stark befahrenen Straßen.`);
  }
  if (carFreePct >= 50) {
    tips.push(`${carFreePct.toFixed(0)} % autofreie Wege — sehr angenehm zu fahren.`);
  } else if (carFreePct >= 20) {
    tips.push(`${carFreePct.toFixed(0)} % autofreie Wege.`);
  } else {
    tips.push('Wenig autofreie Wege — auf Seitenstraßen ausweichen, falls möglich.');
  }
  if (bikeNetworkPct >= 20) {
    tips.push(`${bikeNetworkPct.toFixed(0)} % verlaufen auf ausgewiesenen Radrouten.`);
  }
  if (analysis.crossingCount > 0) {
    tips.push(`${analysis.crossingCount} größere Straßenquerungen auf der Strecke.`);
  }

  const level: SafetyResult['level'] = score >= 80 ? 'good' : score >= 60 ? 'moderate' : 'poor';
  return {
    score,
    level,
    carFreePct: Math.round(carFreePct * 10) / 10,
    busyRoadPct: Math.round(busyRoadPct * 10) / 10,
    bikeNetworkPct: Math.round(bikeNetworkPct * 10) / 10,
    tips,
  };
}
