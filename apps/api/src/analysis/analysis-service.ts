/**
 * Route Analysis Service (P3-1)
 *
 * Fetches edge-level attributes from Valhalla's /trace_attributes endpoint
 * and aggregates them into a structured analysis object.
 */
import type {
  RouteAnalysis,
  EdgeAttributes,
  SurfaceDistribution,
  RoadClassDistribution,
  ProfileId,
} from '@cycleplanner/shared';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGeometry, encodePolyline } from '../elevation/elevation-service.js';

const VALHALLA_URL = process.env.VALHALLA_URL || 'http://127.0.0.1:8002';
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Helpers ─────────────────────────────────

/** Default empty analysis */
function emptyAnalysis(): RouteAnalysis {
  return {
    totalDistanceKm: 0,
    durationMin: 0,
    totalAscent: 0,
    totalDescent: 0,
    surfaceDistribution: { asphalt: 0, gravel: 0, dirt: 0, paved: 0, unknown: 0 },
    roadClassDistribution: {
      motorway: 0, trunk: 0, primary: 0, secondary: 0, tertiary: 0,
      residential: 0, service: 0, track: 0, path: 0, cycleway: 0,
      footway: 0, other: 0,
    },
    bikeNetworkPercentage: 0,
    crossingCount: 0,
    edges: [],
  };
}

/** Normalize surface string to a known category */
function normalizeSurface(raw: string): keyof SurfaceDistribution {
  const s = (raw || '').toLowerCase();
  if (s.includes('asphalt') || s.includes('paved') || s.includes('concrete') || s.includes('paving')) return 'asphalt';
  if (s.includes('gravel') || s.includes('pebblestone') || s.includes('fine_gravel')) return 'gravel';
  if (s.includes('dirt') || s.includes('earth') || s.includes('ground') || s.includes('grass') || s.includes('sand') || s.includes('mud')) return 'dirt';
  if (s.includes('paved') || s.includes('compacted')) return 'paved';
  return 'unknown';
}

/** Normalize road class string to a known category */
function normalizeRoadClass(raw: string): keyof RoadClassDistribution {
  const s = (raw || '').toLowerCase();
  if (s === 'motorway' || s === 'trunk') return s as keyof RoadClassDistribution;
  if (s === 'primary') return 'primary';
  if (s === 'secondary') return 'secondary';
  if (s === 'tertiary') return 'tertiary';
  if (s === 'residential' || s === 'unclassified' || s === 'living_street') return 'residential';
  if (s === 'service' || s === 'driveway' || s === 'alley' || s === 'parking_aisle') return 'service';
  if (s === 'track' || s === 'road') return 'track';
  if (s === 'path' || s === 'bridleway' || s === 'steps') return 'path';
  if (s === 'cycleway') return 'cycleway';
  if (s === 'footway' || s === 'pedestrian' || s === 'sidewalk') return 'footway';
  return 'other';
}

/** Load score weights from config */
function loadScoreWeights(profile: ProfileId): Record<string, number> {
  try {
    const candidates = [
      resolve(process.cwd(), 'config/score-weights.json'),
      resolve(__dirname, '../../../config/score-weights.json'),
      '/config/score-weights.json',
    ];
    for (const path of candidates) {
      if (existsSync(path)) {
        const raw = readFileSync(path, 'utf-8');
        const data = JSON.parse(raw);
        return data[profile] || data['Tourenrad'] || {};
      }
    }
  } catch { /* fall through */ }
  // Fallback weights
  return {
    surfaceQuality: 0.3, bikeInfrastructure: 0.25, trafficExposure: 0.2,
    stopDensity: 0.1, elevationComfort: 0.1, amenityDensity: 0.05,
  };
}

// ── Valhalla trace_attributes call ──────────

interface ValhallaEdge {
  length: number;
  speed: number;
  surface?: string;
  road_class?: string;
  bike_network?: string;
  names?: string[];
}

interface TraceAttributesResponse {
  units?: string;
  edges?: ValhallaEdge[];
  admins?: Array<{ country_code?: string }>;
}

/**
 * Call Valhalla's /trace_attributes to get per-edge data.
 */
async function fetchTraceAttributes(
  encodedPolyline: string,
): Promise<TraceAttributesResponse> {
  const body = {
    encoded_polyline: encodedPolyline,
    costing: 'bicycle',
    directions_options: { units: 'km' },
    filters: {
      attributes: [
        'edge.length',
        'edge.speed',
        'edge.surface',
        'edge.road_class',
        'edge.bike_network',
        'edge.names',
      ],
      action: 'include',
    },
  };

  const res = await fetch(VALHALLA_URL + '/trace_attributes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error('Valhalla trace_attributes failed: ' + res.status);
  }

  return (await res.json()) as TraceAttributesResponse;
}

// ── Main analysis function ──────────────────

/**
 * Analyze a route given its encoded polyline.
 * Returns a full RouteAnalysis object with per-edge breakdown.
 */
export async function analyzeRoute(
  geometry: string,
  profile: ProfileId,
): Promise<RouteAnalysis> {
  if (!geometry || geometry.length === 0) {
    return emptyAnalysis();
  }

  // Convert JSON geometry to Google-encoded polyline for Valhalla
  const coords = parseGeometry(geometry);
  const encodedPolyline = encodePolyline(coords);

  let trace: TraceAttributesResponse;
  try {
    trace = await fetchTraceAttributes(encodedPolyline);
  } catch {
    return emptyAnalysis();
  }

  const edges: EdgeAttributes[] = [];
  const surfaceCounts: Record<string, number> = {};
  const roadClassCounts: Record<string, number> = {};
  let totalLength = 0;
  let bikeNetworkLength = 0;
  let crossingCount = 0;

  const edgeList = trace.edges || [];

  for (const valhallaEdge of edgeList) {
    const lengthKm = (valhallaEdge.length || 0);
    if (lengthKm <= 0) continue;

    const surface = normalizeSurface(valhallaEdge.surface || '');
    const roadClass = normalizeRoadClass(valhallaEdge.road_class || '');
    const bikeNetwork = valhallaEdge.bike_network || '';

    const edge: EdgeAttributes = {
      length: Math.round(lengthKm * 1000) / 1000,
      surface,
      roadClass,
      bikeNetwork,
      speed: valhallaEdge.speed || 0,
      slope: 0, // Valhalla doesn't return slope per edge in trace_attributes
    };

    edges.push(edge);
    totalLength += lengthKm;

    // Count surfaces
    surfaceCounts[surface] = (surfaceCounts[surface] || 0) + lengthKm;

    // Count road classes
    roadClassCounts[roadClass] = (roadClassCounts[roadClass] || 0) + lengthKm;

    // Count bike network
    if (bikeNetwork && bikeNetwork !== '') {
      bikeNetworkLength += lengthKm;
    }

    // Count crossings (major road intersections where class changes to primary+)
    if (roadClass === 'primary' || roadClass === 'trunk' || roadClass === 'motorway') {
      crossingCount++;
    }
  }

  // Compute percentages
  const surfaceDist: SurfaceDistribution = { asphalt: 0, gravel: 0, dirt: 0, paved: 0, unknown: 0 };
  const roadClassDist: RoadClassDistribution = {
    motorway: 0, trunk: 0, primary: 0, secondary: 0, tertiary: 0,
    residential: 0, service: 0, track: 0, path: 0, cycleway: 0,
    footway: 0, other: 0,
  };

  if (totalLength > 0) {
    for (const [key, len] of Object.entries(surfaceCounts)) {
      const pct = Math.round((len / totalLength) * 100 * 10) / 10;
      (surfaceDist as Record<string, number>)[key] = pct;
    }
    for (const [key, len] of Object.entries(roadClassCounts)) {
      const pct = Math.round((len / totalLength) * 100 * 10) / 10;
      (roadClassDist as Record<string, number>)[key] = pct;
    }
  }

  const bikeNetworkPct = totalLength > 0
    ? Math.round((bikeNetworkLength / totalLength) * 100 * 10) / 10
    : 0;

  return {
    totalDistanceKm: Math.round(totalLength * 100) / 100,
    durationMin: Math.round((totalLength / 20) * 60), // rough estimate at 20 km/h avg
    totalAscent: 0,
    totalDescent: 0,
    surfaceDistribution: surfaceDist,
    roadClassDistribution: roadClassDist,
    bikeNetworkPercentage: bikeNetworkPct,
    crossingCount,
    edges,
  };
}

// Re-export for use in score service
export { loadScoreWeights };
