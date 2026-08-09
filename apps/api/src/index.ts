import Fastify from 'fastify';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  HealthStatus,
  RouteRequest,
  RouteResponse,
  ProfileConfig,
  ProfileId,
  CostingOverrides,
  ExclusionFlags,
  ElevationProfileRequest,
  ElevationProfile,
  RouteAnalysis,
  QualityScore,
  CandidatesRequest,
  CandidatesResponse,
  PoiQueryResponse,
  PoiCategory,
} from '@cycleplanner/shared';
import { computeElevationProfile } from './elevation/elevation-service.js';
import { analyzeRoute } from './analysis/analysis-service.js';
import { computeQualityScore } from './analysis/score-service.js';
import { generateCandidates } from './analysis/candidates-service.js';
import { queryPois } from './poi/poi-service.js';
import { runAiAgent } from './ai/ai-agent.js';
import {
  listPresets,
  getPreset,
  createPreset,
  updatePreset,
  deletePreset,
} from './tuning/presets.js';
import type {
  TuningPreset,
  TuningPresetCreateRequest,
  TuningPresetUpdateRequest,
  TuningPresetListResponse,
} from '@cycleplanner/shared';

const VALHALLA_URL = process.env.VALHALLA_URL || 'http://127.0.0.1:8002';

// ── Load profiles configuration ─────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));

function loadProfiles(): Record<ProfileId, ProfileConfig> {
  // Try multiple paths: config mount, project root, relative to this file
  const candidates = [
    resolve(process.cwd(), 'config/profiles.json'),
    resolve(__dirname, '../../../config/profiles.json'),
    '/config/profiles.json',
  ];

  for (const path of candidates) {
    if (existsSync(path)) {
      const raw = readFileSync(path, 'utf-8');
      const data = JSON.parse(raw);
      return data.profiles as Record<ProfileId, ProfileConfig>;
    }
  }

  // Fallback: hardcoded defaults (must match config/profiles.json)
  console.warn('profiles.json not found, using embedded fallback');
  return getFallbackProfiles();
}

function getFallbackProfiles(): Record<ProfileId, ProfileConfig> {
  return {
    Tourenrad: {
      label: 'Tourenrad',
      costing: {
        bicycle_type: 'Hybrid', cycling_speed: 20, use_hills: 0.35, use_ferry: 0.5,
        avoid_bad_surfaces: 0.6, use_living_streets: 0.6, service_penalty: 0, maneuver_penalty: 5, gate_penalty: 300, driveway_penalty: 300, alley_factor: 1.0, country_crossing_penalty: 0, use_trails: 0.5,
      },
      implications: {
        exclude_unpaved: false, surface_strictness: 60, street_avoidance: 15, ferry_allowance: 'medium',
      },
      description: 'Tourenrad – ausgewogen.',
    },
    Rennrad: {
      label: 'Rennrad',
      costing: {
        bicycle_type: 'Road', cycling_speed: 27, use_hills: 0.5, use_ferry: 0.3,
        avoid_bad_surfaces: 0.95, use_living_streets: 0.4, service_penalty: 0, maneuver_penalty: 10, gate_penalty: 500, driveway_penalty: 500, alley_factor: 1.0, country_crossing_penalty: 0, use_trails: 0.3,
      },
      implications: {
        exclude_unpaved: true, surface_strictness: 95, street_avoidance: 50, ferry_allowance: 'low',
      },
      description: 'Rennrad – Schotter ausgeschlossen.',
    },
    Gravel: {
      label: 'Gravel',
      costing: {
        bicycle_type: 'Cross', cycling_speed: 21, use_hills: 0.5, use_ferry: 0.5,
        avoid_bad_surfaces: 0.15, use_living_streets: 0.5, service_penalty: 0, maneuver_penalty: 3, gate_penalty: 100, driveway_penalty: 100, alley_factor: 1.0, country_crossing_penalty: 0, use_trails: 0.75,
      },
      implications: {
        exclude_unpaved: false, surface_strictness: 15, street_avoidance: 20, ferry_allowance: 'medium',
      },
      description: 'Gravel – unbefestigt erwünscht.',
    },
    MTB: {
      label: 'MTB',
      costing: {
        bicycle_type: 'Mountain', cycling_speed: 16, use_hills: 0.8, use_ferry: 0.5,
        avoid_bad_surfaces: 0.05, use_living_streets: 0.5, service_penalty: 0, maneuver_penalty: 2, gate_penalty: 50, driveway_penalty: 50, alley_factor: 1.0, country_crossing_penalty: 0, use_trails: 1,
      },
      implications: {
        exclude_unpaved: false, surface_strictness: 5, street_avoidance: 10, ferry_allowance: 'medium',
      },
      description: 'Mountainbike – alles fahrbar.',
    },
  };
}

const PROFILES = loadProfiles();

/**
 * Merge profile defaults with user overrides and exclusion flags
 * to produce the final Valhalla costing options.
 */
function mergeCosting(
  profileId: ProfileId,
  overrides: CostingOverrides | undefined,
  exclusionFlags: ExclusionFlags | undefined,
): { costing: Record<string, unknown>; exclusions: Record<string, boolean> } {
  const profile = PROFILES[profileId];
  const costing = profile.costing;
  const impl = profile.implications;

  // Build Valhalla bicycle costing options
  const costOpts: Record<string, unknown> = {
    bicycle_type: costing.bicycle_type,
    cycling_speed: overrides?.cycling_speed ?? costing.cycling_speed,
    use_hills: overrides?.use_hills ?? costing.use_hills,
    use_ferry: overrides?.use_ferry ?? costing.use_ferry,
    avoid_bad_surfaces: overrides?.avoid_bad_surfaces ?? costing.avoid_bad_surfaces,
    use_living_streets: overrides?.use_living_streets ?? costing.use_living_streets,
    service_penalty: overrides?.service_penalty ?? costing.service_penalty ?? 0,
    maneuver_penalty: overrides?.maneuver_penalty ?? costing.maneuver_penalty ?? 5,
    gate_penalty: overrides?.gate_penalty ?? costing.gate_penalty ?? 300,
    driveway_penalty: overrides?.driveway_penalty ?? costing.driveway_penalty ?? 300,
    alley_factor: overrides?.alley_factor ?? costing.alley_factor ?? 1.0,
    country_crossing_penalty: overrides?.country_crossing_penalty ?? costing.country_crossing_penalty ?? 0,
    use_trails: overrides?.use_trails ?? costing.use_trails,
  };

  // Handle hierarchy pruning toggle
  if (overrides?.disable_hierarchy_pruning) {
    costOpts.disable_hierarchy_pruning = true;
  }

  // Build hard exclusions for Valhalla's exclude_polygons / bicycle_exclude
  const exclusions: Record<string, boolean> = {};

  // exclude_unpaved: user flag first, then profile implication
  const unpavedExcluded =
    exclusionFlags?.exclude_unpaved !== undefined
      ? exclusionFlags.exclude_unpaved
      : impl.exclude_unpaved;
  if (unpavedExcluded) {
    exclusions.exclude_unpaved = true;
  }

  if (exclusionFlags?.exclude_ferries) {
    exclusions.exclude_ferries = true;
  }
  if (exclusionFlags?.exclude_tunnels) {
    exclusions.exclude_tunnels = true;
  }
  if (exclusionFlags?.exclude_bridges) {
    exclusions.exclude_bridges = true;
  }
  if (exclusionFlags?.exclude_highways) {
    exclusions.exclude_highways = true;
  }

  return { costing: costOpts, exclusions };
}

export function buildApp() {
  const app = Fastify({ logger: false });

  // ── Health check ──────────────────────────────
  app.get<{ Reply: HealthStatus }>('/api/health', async (_req, reply) => {
    return reply.send({ status: 'ok' });
  });

  // ── Valhalla status ────────────────────────────
  app.get<{ Reply: { running: boolean; message: string } }>(
    '/api/valhalla/status',
    async (_req, reply) => {
      try {
        const res = await fetch(`${VALHALLA_URL}/status`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          return reply.send({ running: true, message: 'Valhalla läuft' });
        }
        return reply.send({ running: false, message: 'Valhalla antwortet nicht (Status: ' + res.status + ')' });
      } catch {
        return reply.send({ running: false, message: 'Valhalla ist nicht erreichbar' });
      }
    },
  );

  // ── Valhalla start (Docker Compose) ─────────────
  app.post<{ Reply: { ok: boolean; message: string } }>(
    '/api/valhalla/start',
    async (_req, reply) => {
      try {
        const { execSync } = await import('node:child_process');
        // Try starting valhalla via docker compose
        const cwd = process.cwd();
        execSync('docker compose up -d valhalla', {
          cwd: process.env.COMPOSE_DIR || cwd,
          timeout: 30000,
          stdio: 'pipe',
        });
        return reply.send({ ok: true, message: 'Valhalla wird gestartet...' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({
          ok: false,
          message: 'Konnte Valhalla nicht starten: ' + msg,
        });
      }
    },
  );

  // ── Elevation profile ─────────────────────────
  const elevationSchema = {
    body: {
      type: 'object',
      required: ['polyline'],
      properties: {
        polyline: { type: 'string', minLength: 1 },
      },
    },
  } as const;

  app.post<{ Body: ElevationProfileRequest; Reply: ElevationProfile }>(
    '/api/elevation/profile',
    { schema: elevationSchema },
    async (req, reply) => {
      try {
        const profile = await computeElevationProfile(req.body.polyline);
        return reply.send(profile);
      } catch (err) {
        req.log.error({ err }, 'Elevation profile computation failed');
        return reply.status(500).send({
          points: [],
          metrics: {
            totalAscent: 0, totalDescent: 0,
            minElevation: 0, maxElevation: 0,
            avgSlope: 0, maxSlope: 0,
            slopeDistribution: { flat: 0, gentle: 0, moderate: 0, steep: 0, extreme: 0 },
          },
        } as ElevationProfile);
      }
    },
  );

  // ── Route calculation ─────────────────────────
  const routeSchema = {
    body: {
      type: 'object',
      required: ['waypoints', 'profile'],
      properties: {
        waypoints: {
          type: 'array',
          minItems: 2,
          maxItems: 20,
          items: {
            type: 'object',
            required: ['lat', 'lng'],
            properties: {
              lat: { type: 'number', minimum: -90, maximum: 90 },
              lng: { type: 'number', minimum: -180, maximum: 180 },
              label: { type: 'string' },
            },
          },
        },
        profile: {
          type: 'string',
          enum: ['Tourenrad', 'Rennrad', 'Gravel', 'MTB'],
        },
        costingOverrides: {
          type: 'object',
          properties: {
            use_hills: { type: 'number', minimum: 0, maximum: 1 },
            street_avoidance: { type: 'number', minimum: 0, maximum: 1 },
            avoid_bad_surfaces: { type: 'number', minimum: 0, maximum: 1 },
            use_ferry: { type: 'number', minimum: 0, maximum: 1 },
            use_living_streets: { type: 'number', minimum: 0, maximum: 1 },
            use_trails: { type: 'number', minimum: 0, maximum: 1 },
            service_penalty: { type: 'number' },
            cycling_speed: { type: 'number', minimum: 5, maximum: 50 },
            maneuver_penalty: { type: 'number', minimum: 0, maximum: 100 },
            gate_penalty: { type: 'number', minimum: 0, maximum: 2000 },
            driveway_penalty: { type: 'number', minimum: 0, maximum: 2000 },
            alley_factor: { type: 'number', minimum: 0, maximum: 5 },
            country_crossing_penalty: { type: 'number', minimum: 0, maximum: 1000 },
            disable_hierarchy_pruning: { type: 'boolean' },
          },
        },
        excludePolygon: {
          type: 'array',
          maxItems: 100,
          items: {
            type: 'object',
            required: ['lat', 'lng'],
            properties: {
              lat: { type: 'number', minimum: -90, maximum: 90 },
              lng: { type: 'number', minimum: -180, maximum: 180 },
            },
          },
        },
        exclusionFlags: {
          type: 'object',
          properties: {
            exclude_unpaved: { type: 'boolean' },
            exclude_ferries: { type: 'boolean' },
            exclude_tunnels: { type: 'boolean' },
            exclude_bridges: { type: 'boolean' },
            exclude_highways: { type: 'boolean' },
          },
        },
      },
    },
    response: {
      200: {
        type: 'object',
        properties: {
          geometry: { type: 'string' },
          summary: {
            type: 'object',
            properties: {
              distanceKm: { type: 'number' },
              durationMin: { type: 'number' },
              ascentM: { type: 'number' },
              descentM: { type: 'number' },
            },
          },
        },
      },
    },
  } as const;

  app.post<{ Body: RouteRequest; Reply: RouteResponse }>(
    '/api/route',
    { schema: routeSchema },
    async (req, reply) => {
      const { waypoints, profile, costingOverrides, exclusionFlags, excludePolygon } = req.body;

      // Merge profile defaults → user overrides → exclusion flags
      const { costing, exclusions } = mergeCosting(profile, costingOverrides, exclusionFlags);

      // Convert street_avoidance override to Valhalla-appropriate form if present
      if (costingOverrides?.street_avoidance !== undefined) {
        // street_avoidance (0=avoid streets, 1=indifferent) maps inversely
        // to Valhalla's use_roads-like behavior. We pass it as a custom field
        // and let Valhalla's default bicycle costing handle road classes.
        // For now, high street avoidance = prefer lower road classes via service_penalty.
        costing.service_penalty =
          Math.round(costingOverrides.street_avoidance * 100) + (costing.service_penalty as number);
      }

      const valhallaBody: Record<string, unknown> = {
        locations: waypoints.map((wp) => ({ lat: wp.lat, lon: wp.lng })),
        costing: 'bicycle',
        costing_options: {
          bicycle: costing,
        },
        directions_options: { units: 'km' },
      };

      // Attach hard exclusions to Valhalla request
      if (Object.keys(exclusions).length > 0) {
        (valhallaBody.costing_options as Record<string, unknown>).bicycle_exclude = exclusions;
      }

      // Attach exclusion polygon (blocked segment) if provided
      if (excludePolygon && excludePolygon.length >= 2) {
        // Buffer the segment into a narrow corridor (~30m)
        // Build a polygon by offsetting the line in both directions
        const bufferMeters = 0.0003; // ~30m in degrees (approximate)
        const ring: Array<{ lat: number; lon: number }> = [];

        // Compute perpendicular offsets for each point
        const offsetPoints: Array<Array<{ lat: number; lon: number }>> = [];
        for (let i = 0; i < excludePolygon.length; i++) {
          const curr = excludePolygon[i];
          let dx = 0;
          let dy = 0;

          if (i === 0 && excludePolygon.length > 1) {
            // Use forward direction
            const next = excludePolygon[i + 1];
            dx = next.lng - curr.lng;
            dy = next.lat - curr.lat;
          } else if (i === excludePolygon.length - 1) {
            // Use backward direction
            const prev = excludePolygon[i - 1];
            dx = curr.lng - prev.lng;
            dy = curr.lat - prev.lat;
          } else {
            // Average of forward and backward
            const prev = excludePolygon[i - 1];
            const next = excludePolygon[i + 1];
            dx = next.lng - prev.lng;
            dy = next.lat - prev.lat;
          }

          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          // Perpendicular vector (normalized)
          const perpX = -dy / len;
          const perpY = dx / len;

          offsetPoints.push([
            { lat: curr.lat + perpY * bufferMeters, lon: curr.lng + perpX * bufferMeters },
            { lat: curr.lat - perpY * bufferMeters, lon: curr.lng - perpX * bufferMeters },
          ]);
        }

        // Build ring: traverse forward on one side, backward on other
        for (const pair of offsetPoints) {
          ring.push(pair[0]);
        }
        for (let i = offsetPoints.length - 1; i >= 0; i--) {
          ring.push(offsetPoints[i][1]);
        }
        // Close the ring
        ring.push(offsetPoints[0][0]);

        (valhallaBody as Record<string, unknown>).exclude_polygons = [ring];
      }

      req.log.info({ valhallaUrl: VALHALLA_URL }, 'Calling Valhalla /route');

      let valhallaRes;
      try {
        valhallaRes = await fetch(`${VALHALLA_URL}/route`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(valhallaBody),
        });
      } catch (err) {
        req.log.error({ err }, 'Valhalla unreachable');
        return reply.status(502).send({
          error: 'Routing engine unreachable',
        } as unknown as RouteResponse);
      }

      if (!valhallaRes.ok) {
        const errorBody = await valhallaRes.text();
        req.log.error({ status: valhallaRes.status, body: errorBody }, 'Valhalla error');

        // Detect hard exclusion failure and give a helpful message
        let errorMsg = 'Routing engine error';
        try {
          const parsed = JSON.parse(errorBody);
          if (parsed.error_code === 442 || parsed.error_code === 400) {
            errorMsg =
              'Keine Route gefunden. Möglicherweise verhindert ein harter Ausschluss die Routenfindung. Versuche, Ausschlüsse zu lockern.';
          }
        } catch {
          // keep generic message
        }

        return reply.status(502).send({
          error: errorMsg,
        } as unknown as RouteResponse);
      }

      const data = (await valhallaRes.json()) as {
        trip?: { summary?: { length?: number; time?: number }; legs?: Array<{ shape?: string }> };
      };

      const trip = data.trip;
      if (!trip) {
        return reply.status(502).send({
          error: 'Keine Route gefunden.',
        } as unknown as RouteResponse);
      }

      const summary = trip.summary || { length: 0, time: 0 };
      // Decode and merge all leg shapes into a single coordinate array
      const legShapes = trip.legs?.map((l) => l.shape || '') || [];
      const allCoords: Array<[number, number]> = [];
      for (const shape of legShapes) {
        if (!shape) continue;
        let idx = 0, lat = 0, lng = 0;
        while (idx < shape.length) {
          let shift = 0, result = 0, byte: number;
          do { byte = shape.charCodeAt(idx++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
          const dlat = result & 1 ? ~(result >> 1) : result >> 1;
          lat += dlat;
          shift = 0; result = 0;
          do { byte = shape.charCodeAt(idx++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
          const dlng = result & 1 ? ~(result >> 1) : result >> 1;
          lng += dlng;
          allCoords.push([lng / 1e6, lat / 1e6]);
        }
      }

      return reply.send({
        geometry: JSON.stringify(allCoords),
        summary: {
          distanceKm: Math.round((summary.length || 0) * 100) / 100,
          durationMin: Math.round(((summary.time || 0) / 60) * 100) / 100,
          ascentM: 0,
          descentM: 0,
        },
      });
    },
  );

  // ── Round trip generation ────────────────────
  const roundTripSchema = {
    body: {
      type: 'object',
      required: ['lat', 'lng', 'targetDistanceKm', 'profile'],
      properties: {
        lat: { type: 'number', minimum: -90, maximum: 90 },
        lng: { type: 'number', minimum: -180, maximum: 180 },
        targetDistanceKm: { type: 'number', minimum: 5, maximum: 500 },
        profile: { type: 'string', enum: ['Tourenrad', 'Rennrad', 'Gravel', 'MTB'] },
        costingOverrides: {
          type: 'object',
          properties: {
            use_hills: { type: 'number', minimum: 0, maximum: 1 },
            street_avoidance: { type: 'number', minimum: 0, maximum: 1 },
            avoid_bad_surfaces: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
        exclusionFlags: {
          type: 'object',
          properties: {
            exclude_unpaved: { type: 'boolean' },
            exclude_ferries: { type: 'boolean' },
            exclude_tunnels: { type: 'boolean' },
            exclude_bridges: { type: 'boolean' },
          },
        },
      },
    },
  } as const;

  app.post<{
    Body: {
      lat: number; lng: number; targetDistanceKm: number; profile: ProfileId;
      costingOverrides?: CostingOverrides; exclusionFlags?: ExclusionFlags;
    };
    Reply: { variants: Array<{ id: string; geometry: string; summary: { distanceKm: number; durationMin: number; ascentM: number; descentM: number }; deviationKm: number }> };
  }>(
    '/api/tours/roundtrip',
    { schema: roundTripSchema },
    async (req, reply) => {
      const { lat, lng, targetDistanceKm, profile, costingOverrides, exclusionFlags } = req.body;

      // Compute circle radius from target distance (circumference = 2*pi*r -> r = dist/(2*pi))
      const radiusKm = targetDistanceKm / (2 * Math.PI);
      // Cap at reasonable values
      const cappedRadius = Math.max(5, Math.min(radiusKm, 80));

      // Generate waypoints in a circle, with different rotation angles for variants
      const angles = [0, 60, 120, 180, 240, 300]; // degrees
      const arms = 3; // number of intermediate waypoints for each direction

      const variants: Array<{
        id: string;
        geometry: string;
        summary: { distanceKm: number; durationMin: number; ascentM: number; descentM: number };
        deviationKm: number;
      }> = [];

      const { costing, exclusions } = mergeCosting(profile, costingOverrides, exclusionFlags);

      // Compute each variant
      const variantPromises = angles.slice(0, 4).map(async (baseAngleDeg) => {
        const directions = [0, 120, 240]; // triangular distribution
        const points: Array<{ lat: number; lng: number }> = [{ lat, lng }];

        for (const dirOffset of directions) {
          const angleDeg = baseAngleDeg + dirOffset;
          const angleRad = (angleDeg * Math.PI) / 180;
          // Approximate: 1 deg lat ~ 111.32 km, 1 deg lng ~ 111.32 * cos(lat) km
          const cosLat = Math.cos((lat * Math.PI) / 180);
          const dLat = (cappedRadius * Math.cos(angleRad)) / 111.32;
          const dLng = (cappedRadius * Math.sin(angleRad)) / (111.32 * cosLat);
          points.push({ lat: lat + dLat, lng: lng + dLng });
        }
        // Close the loop
        points.push({ lat, lng });

        // Build Valhalla request
        const valhallaBody: Record<string, unknown> = {
          locations: points.map((p) => ({ lat: p.lat, lon: p.lng })),
          costing: 'bicycle',
          costing_options: { bicycle: costing },
          directions_options: { units: 'km' },
        };
        if (Object.keys(exclusions).length > 0) {
          (valhallaBody.costing_options as Record<string, unknown>).bicycle_exclude = exclusions;
        }

        try {
          const res = await fetch(VALHALLA_URL + '/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(valhallaBody),
          });

          if (!res.ok) return null;

          const data = (await res.json()) as {
            trip?: { summary?: { length?: number; time?: number }; legs?: Array<{ shape?: string }> };
          };

          const trip = data.trip;
          if (!trip) return null;

          const summary = trip.summary || { length: 0, time: 0 };
          const legShapesRt = trip.legs?.map((l) => l.shape || '') || [];
          const geometry = mergeEncodedPolylines(legShapesRt);
          const distKm = (summary.length || 0);
          const deviation = Math.abs(distKm - targetDistanceKm);

          return {
            id: 'rt-' + baseAngleDeg,
            geometry,
            summary: {
              distanceKm: Math.round(distKm * 100) / 100,
              durationMin: Math.round(((summary.time || 0) / 60) * 100) / 100,
              ascentM: 0,
              descentM: 0,
            },
            deviationKm: Math.round(deviation * 100) / 100,
          };
        } catch {
          return null;
        }
      });

      const results = (await Promise.all(variantPromises)).filter(
        (v): v is NonNullable<typeof v> => v !== null,
      );

      // Sort: closest to target distance first
      results.sort((a, b) => a.deviationKm - b.deviationKm);

      return reply.send({ variants: results });
    },
  );

  // ── GPX Export ────────────────────────────────
  app.post<{
    Body: { geometry: string; waypoints: Array<{ lat: number; lng: number; label?: string }>; name?: string; mode: string };
    Reply: { gpx: string; filename: string };
  }>(
    '/api/export/gpx',
    {
      schema: {
        body: {
          type: 'object',
          required: ['geometry', 'waypoints', 'mode'],
          properties: {
            geometry: { type: 'string' },
            waypoints: {
              type: 'array',
              items: {
                type: 'object',
                required: ['lat', 'lng'],
                properties: {
                  lat: { type: 'number' },
                  lng: { type: 'number' },
                  label: { type: 'string' },
                },
              },
            },
            name: { type: 'string' },
            mode: { type: 'string', enum: ['track', 'route', 'waypoints'] },
          },
        },
      } as const,
    },
    async (req, reply) => {
      const { geometry, waypoints, name, mode } = req.body;

      // Decode polyline for track/route export
      let coords: Array<{ lat: number; lng: number }> = [];
      if (mode === 'track' || mode === 'route') {
        const decoder = await import('./elevation/elevation-service.js');
        coords = decoder.decodePolyline(geometry).map(([lng, lat]) => ({ lat, lng }));
      }

      const timestamp = new Date().toISOString();
      const routeName = name || 'CyclePlanner-Route';

      // Build GPX XML
      let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n';
      gpx += '<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1"\n';
      gpx += '  creator="CyclePlanner"\n';
      gpx += '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n';
      gpx += '  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">\n';
      gpx += '  <metadata>\n';
      gpx += '    <name>' + escapeXml(routeName) + '</name>\n';
      gpx += '    <time>' + timestamp + '</time>\n';
      gpx += '  </metadata>\n';

      if (mode === 'track') {
        gpx += '  <trk>\n';
        gpx += '    <name>' + escapeXml(routeName) + '</name>\n';
        gpx += '    <trkseg>\n';
        for (const pt of coords) {
          gpx += '      <trkpt lat="' + pt.lat.toFixed(6) + '" lon="' + pt.lng.toFixed(6) + '"></trkpt>\n';
        }
        gpx += '    </trkseg>\n';
        gpx += '  </trk>\n';
      } else if (mode === 'route') {
        gpx += '  <rte>\n';
        gpx += '    <name>' + escapeXml(routeName) + '</name>\n';
        for (const pt of coords) {
          gpx += '    <rtept lat="' + pt.lat.toFixed(6) + '" lon="' + pt.lng.toFixed(6) + '"></rtept>\n';
        }
        gpx += '  </rte>\n';
      }

      if (mode === 'waypoints' || mode === 'track' || mode === 'route') {
        for (let i = 0; i < waypoints.length; i++) {
          const wp = waypoints[i];
          gpx += '  <wpt lat="' + wp.lat.toFixed(6) + '" lon="' + wp.lng.toFixed(6) + '">\n';
          gpx += '    <name>' + escapeXml(wp.label || 'WP' + (i + 1)) + '</name>\n';
          gpx += '  </wpt>\n';
        }
      }

      gpx += '</gpx>\n';

      const safeName = routeName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const ext = '.gpx';
      const filename = safeName + '_' + mode + ext;

      return reply.send({ gpx, filename });
    },
  );

  // ── GPX Import ────────────────────────────────
  app.post<{
    Body: { gpx: string; profile?: string };
    Reply: { waypoints: Array<{ lat: number; lng: number; label?: string }>; geometry?: string };
  }>(
    '/api/import/gpx',
    {
      schema: {
        body: {
          type: 'object',
          required: ['gpx'],
          properties: {
            gpx: { type: 'string' },
            profile: { type: 'string' },
          },
        },
      } as const,
    },
    async (req, reply) => {
      const { gpx } = req.body;

      // Simple regex-based GPX parser (avoids XML library dependency)
      const waypoints: Array<{ lat: number; lng: number; label?: string }> = [];

      // Extract <wpt> elements
      const wptRegex = /<wpt\s+lat="([^"]+)"\s+lon="([^"]+)">[\s\S]*?<name>([^<]*)<\/name>[\s\S]*?<\/wpt>/g;
      let match;
      while ((match = wptRegex.exec(gpx)) !== null) {
        waypoints.push({
          lat: parseFloat(match[1]),
          lng: parseFloat(match[2]),
          label: match[3] || undefined,
        });
      }

      // If no waypoints found from <wpt>, extract from <trkpt> or <rtept>
      if (waypoints.length === 0) {
        const ptRegex = /<(?:trkpt|rtept)\s+lat="([^"]+)"\s+lon="([^"]+)"/g;
        while ((match = ptRegex.exec(gpx)) !== null) {
          waypoints.push({
            lat: parseFloat(match[1]),
            lng: parseFloat(match[2]),
          });
        }

        // If many track points, reduce to a reasonable number (keep every Nth)
        if (waypoints.length > 20) {
          const step = Math.ceil(waypoints.length / 15);
          const reduced = waypoints.filter((_, i) => i % step === 0);
          // Ensure last point is included
          if (reduced[reduced.length - 1] !== waypoints[waypoints.length - 1]) {
            reduced.push(waypoints[waypoints.length - 1]);
          }
          return reply.send({ waypoints: reduced });
        }
      }

      if (waypoints.length === 0) {
        return reply.status(400).send({
          waypoints: [],
          geometry: undefined,
        } as { waypoints: Array<{ lat: number; lng: number; label?: string }>; geometry?: string });
      }

      return reply.send({ waypoints });
    },
  );

  // ── EuroVelo layer ────────────────────────────
  app.get<{
    Querystring: { bbox?: string };
    Reply: { type: string; features: Array<Record<string, unknown>> };
  }>(
    '/api/layers/eurovelo',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            bbox: { type: 'string' },
          },
        },
      } as const,
    },
    async (req, reply) => {
      const bbox = req.query.bbox;
      if (!bbox) {
        return reply.send({ type: 'FeatureCollection', features: [] });
      }

      // Build Overpass query for EuroVelo routes (ICN bicycle routes)
      const [south, west, north, east] = bbox.split(',').map(Number);
      const overpassQuery =
        '[out:json][timeout:15];' +
        '(' +
        'relation["type"="route"]["route"="bicycle"]["network"="icn"](' +
        south + ',' + west + ',' + north + ',' + east +
        ');' +
        ');' +
        'out geom;';

      try {
        const overpassRes = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: overpassQuery,
        });

        if (!overpassRes.ok) {
          return reply.send({ type: 'FeatureCollection', features: [] });
        }

        const overpassData = (await overpassRes.json()) as {
          elements?: Array<{
            type: string;
            id: number;
            tags?: Record<string, string>;
            geometry?: Array<{ lat: number; lon: number }>;
          }>;
        };

        const features = (overpassData.elements || [])
          .filter((el) => el.type === 'relation' && el.geometry && el.geometry.length > 0)
          .map((el) => ({
            type: 'Feature',
            id: el.id,
            properties: {
              name: el.tags?.name || '',
              ref: el.tags?.ref || '',
              network: el.tags?.network || 'icn',
            },
            geometry: {
              type: 'LineString',
              coordinates: el.geometry!.map((pt) => [pt.lon, pt.lat]),
            },
          }));

        return reply.send({ type: 'FeatureCollection', features });
      } catch {
        return reply.send({ type: 'FeatureCollection', features: [] });
      }
    },
  );

  // ── Debug: Search space expansion ──────────────
  // Proxies Valhalla's /expansion endpoint for debugging
  app.get<{
    Querystring: { lat: string; lng: string; profile?: string; skipCache?: string };
    Reply: Record<string, unknown>;
  }>(
    '/api/debug/expansion',
    async (req, reply) => {
      const lat = parseFloat(req.query.lat || '');
      const lng = parseFloat(req.query.lng || '');
      const profile = req.query.profile || 'bicycle';
      const skipCache = req.query.skipCache === '1';

      if (isNaN(lat) || isNaN(lng)) {
        return reply.status(400).send({ error: 'lat and lng required' });
      }

      const valhallaBody = {
        locations: [{ lat, lon: lng }],
        costing: profile,
        costing_options: {
          [profile]: {
            bicycle_type: 'Hybrid',
            use_hills: 0.35,
            avoid_bad_surfaces: 0.6,
          },
        },
        directions_type: 'none',
        skip_opposites: true,
        expansion_type: 'full',
      };

      try {
        const res = await fetch(VALHALLA_URL + '/expansion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(valhallaBody),
        });

        if (!res.ok) {
          return reply.status(502).send({ error: 'Valhalla expansion failed: ' + res.status });
        }

        const data = await res.json();
        return reply.send(data as Record<string, unknown>);
      } catch (err) {
        return reply.status(502).send({ error: 'Valhalla unreachable' });
      }
    },
  );

  // ── Tuning Presets CRUD ────────────────────────
  // GET /api/tuning/presets — list all
  app.get<{ Reply: TuningPresetListResponse }>(
    '/api/tuning/presets',
    async (_req, reply) => {
      return reply.send(listPresets());
    },
  );

  // GET /api/tuning/presets/:id — get one
  app.get<{ Params: { id: string }; Reply: TuningPreset | { error: string } }>(
    '/api/tuning/presets/:id',
    async (req, reply) => {
      const preset = getPreset(req.params.id);
      if (!preset) {
        return reply.status(404).send({ error: 'Preset not found' });
      }
      return reply.send(preset);
    },
  );

  // POST /api/tuning/presets — create
  app.post<{ Body: TuningPresetCreateRequest; Reply: TuningPreset | { error: string } }>(
    '/api/tuning/presets',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'profile', 'overrides', 'exclusionFlags'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            profile: { type: 'string', enum: ['Tourenrad', 'Rennrad', 'Gravel', 'MTB'] },
            overrides: { type: 'object' },
            exclusionFlags: { type: 'object' },
          },
        },
      } as const,
    },
    async (req, reply) => {
      const preset = createPreset(req.body);
      return reply.status(201).send(preset);
    },
  );

  // PUT /api/tuning/presets/:id — update
  app.put<{ Params: { id: string }; Body: TuningPresetUpdateRequest; Reply: TuningPreset | { error: string } }>(
    '/api/tuning/presets/:id',
    async (req, reply) => {
      const preset = updatePreset(req.params.id, req.body);
      if (!preset) {
        return reply.status(404).send({ error: 'Preset not found' });
      }
      return reply.send(preset);
    },
  );

  // DELETE /api/tuning/presets/:id
  app.delete<{ Params: { id: string }; Reply: { ok: boolean } | { error: string } }>(
    '/api/tuning/presets/:id',
    async (req, reply) => {
      const ok = deletePreset(req.params.id);
      if (!ok) {
        return reply.status(404).send({ error: 'Preset not found or built-in' });
      }
      return reply.send({ ok: true });
    },
  );

  // ── Route Analysis (P3-1) ──────────────────────
  app.post<{
    Body: { geometry: string; profile: string };
    Reply: RouteAnalysis | { error: string };
  }>(
    '/api/route/analyze',
    {
      schema: {
        body: {
          type: 'object',
          required: ['geometry', 'profile'],
          properties: {
            geometry: { type: 'string', minLength: 1 },
            profile: { type: 'string', enum: ['Tourenrad', 'Rennrad', 'Gravel', 'MTB'] },
          },
        },
      } as const,
    },
    async (req, reply) => {
      try {
        const analysis = await analyzeRoute(req.body.geometry, req.body.profile as ProfileId);
        return reply.send(analysis);
      } catch (err) {
        req.log.error({ err }, 'Route analysis failed');
        return reply.status(500).send({ error: 'Analysis failed' });
      }
    },
  );

  // ── Quality Score (P3-3) ──────────────────────
  app.post<{
    Body: { geometry: string; profile: string };
    Reply: QualityScore | { error: string };
  }>(
    '/api/route/score',
    {
      schema: {
        body: {
          type: 'object',
          required: ['geometry', 'profile'],
          properties: {
            geometry: { type: 'string', minLength: 1 },
            profile: { type: 'string', enum: ['Tourenrad', 'Rennrad', 'Gravel', 'MTB'] },
          },
        },
      } as const,
    },
    async (req, reply) => {
      try {
        const analysis = await analyzeRoute(req.body.geometry, req.body.profile as ProfileId);
        const score = computeQualityScore(analysis, req.body.profile as ProfileId);
        return reply.send(score);
      } catch (err) {
        req.log.error({ err }, 'Score computation failed');
        return reply.status(500).send({ error: 'Score failed' });
      }
    },
  );

  // ── Route Candidates (P3-4) ────────────────────
  app.post<{
    Body: CandidatesRequest;
    Reply: CandidatesResponse | { error: string };
  }>(
    '/api/route/candidates',
    {
      schema: {
        body: {
          type: 'object',
          required: ['waypoints', 'profile'],
          properties: {
            waypoints: {
              type: 'array',
              minItems: 2,
              maxItems: 20,
              items: {
                type: 'object',
                required: ['lat', 'lng'],
                properties: {
                  lat: { type: 'number' },
                  lng: { type: 'number' },
                },
              },
            },
            profile: { type: 'string', enum: ['Tourenrad', 'Rennrad', 'Gravel', 'MTB'] },
            costingOverrides: { type: 'object' },
            exclusionFlags: { type: 'object' },
          },
        },
      } as const,
    },
    async (req, reply) => {
      try {
        const result = await generateCandidates(
          req.body.waypoints,
          req.body.profile,
          req.body.costingOverrides,
          req.body.exclusionFlags,
        );
        return reply.send(result);
      } catch (err) {
        req.log.error({ err }, 'Candidate generation failed');
        return reply.status(500).send({ error: 'Candidates failed' } as { error: string });
      }
    },
  );

  // ── POI Query (P4-1) ───────────────────────────
  app.post<{
    Body: { bbox?: string; categories?: string[]; corridor?: string; limit?: number };
    Reply: PoiQueryResponse | { error: string };
  }>(
    '/api/pois',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            bbox: { type: 'string' },
            categories: { type: 'array', items: { type: 'string' } },
            corridor: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 500 },
          },
        },
      } as const,
    },
    async (req, reply) => {
      try {
        const pois = await queryPois(
          req.body.bbox,
          (req.body.categories as PoiCategory[]) || [],
          req.body.corridor,
          req.body.limit || 100,
        );
        return reply.send({ pois, source: 'overpass' });
      } catch (err) {
        req.log.error({ err }, 'POI query failed');
        return reply.status(500).send({ error: 'POI query failed' } as { error: string });
      }
    },
  );

  // ── AI Tour Planning (P6-1) ──────────────────────
  app.post<{
    Body: { query: string };
    Reply: { waypoints: Array<{ lat: number; lng: number; label: string }>; summary: string; iterations: number; tokensUsed: number } | { error: string };
  }>(
    '/api/ai/plan',
    {
      schema: {
        body: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string', minLength: 5, maxLength: 500 },
          },
        },
      } as const,
    },
    async (req, reply) => {
      try {
        const result = await runAiAgent(req.body.query);
        return reply.send({
          waypoints: result.waypoints,
          summary: result.summary,
          iterations: result.iterations,
          tokensUsed: result.tokensUsed,
        });
      } catch (err) {
        req.log.error({ err }, 'AI agent failed');
        return reply.status(500).send({
          error: 'AI planning failed: ' + (err as Error).message,
        } as { error: string });
      }
    },
  );

  return app;
}

/**
 * Merge multiple Valhalla-encoded polyline strings into one.
 * Each leg's shape is encoded relative to (0,0) — concatenating
 * strings directly would produce garbage. Instead, decode each,
 * accumulate coordinates, and re-encode as a single polyline.
 */
function mergeEncodedPolylines(shapes: string[]): string {
  if (shapes.length === 0) return '';

  let allCoords: Array<[number, number]> = [];

  for (const shape of shapes) {
    if (!shape) continue;
    let idx = 0, lat = 0, lng = 0;
    while (idx < shape.length) {
      let shift = 0, result = 0, byte: number;
      do {
        byte = shape.charCodeAt(idx++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const dlat = result & 1 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0; result = 0;
      do {
        byte = shape.charCodeAt(idx++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const dlng = result & 1 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      allCoords.push([lng, lat]);
    }
  }

  // Re-encode all coordinates as a single polyline
  let prevLat = 0, prevLng = 0;
  let encoded = '';

  for (const [lng, lat] of allCoords) {
    const dlat = lat - prevLat;
    const dlng = lng - prevLng;
    prevLat = lat;
    prevLng = lng;

    // Encode delta
    encoded += encodeSignedNumber(dlat);
    encoded += encodeSignedNumber(dlng);
  }

  return encoded;
}

/** Encode a signed integer for Google polyline format */
function encodeSignedNumber(num: number): string {
  // Use BigInt-safe approach: convert negative to two's complement manually
  let sgnNum: number;
  if (num < 0) {
    sgnNum = ((-num) << 1) - 1;
  } else {
    sgnNum = num << 1;
  }
  // Ensure positive
  if (sgnNum < 0) sgnNum = (sgnNum >>> 0); // Convert to unsigned 32-bit
  let result = '';
  while (sgnNum >= 0x20) {
    result += String.fromCharCode((0x20 | (sgnNum & 0x1f)) + 63);
    sgnNum = Math.floor(sgnNum / 32); // Use division instead of >> for large numbers
  }
  result += String.fromCharCode(sgnNum + 63);
  return result;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
