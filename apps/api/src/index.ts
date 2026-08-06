import Fastify from 'fastify';
import type { HealthStatus, RouteRequest, RouteResponse } from '@cycleplanner/shared';

const PORT = parseInt(process.env.API_PORT || '3000', 10);
const HOST = process.env.API_HOST || '127.0.0.1';
const VALHALLA_URL = process.env.VALHALLA_URL || 'http://127.0.0.1:8002';

const app = Fastify({ logger: true });

// ── Health check ──────────────────────────────
app.get<{ Reply: HealthStatus }>('/api/health', async (_req, reply) => {
  return reply.send({ status: 'ok' });
});

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
        enum: ['Rennrad', 'Trekking', 'Gravel', 'MTB'],
      },
      costingOptions: {
        type: 'object',
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
    const { waypoints, profile: _profile, costingOptions } = req.body;

    // Map profile to Valhalla bicycle_type
    const bicycleTypeMap: Record<string, string> = {
      Rennrad: 'Road',
      Trekking: 'Hybrid',
      Gravel: 'Cross',
      MTB: 'Mountain',
    };

    // Build Valhalla request
    const valhallaBody: Record<string, unknown> = {
      locations: waypoints.map((wp) => ({ lat: wp.lat, lon: wp.lng })),
      costing: 'bicycle',
      costing_options: {
        bicycle: {
          bicycle_type: bicycleTypeMap[_profile] || 'Hybrid',
          use_hills: 0.35,
          avoid_bad_surfaces: 0.6,
          ...costingOptions,
        },
      },
      directions_options: { units: 'km' },
    };

    // Forward hard exclusion flags to top-level costing_options
    if (costingOptions) {
      const hardExclusions: Record<string, boolean> = {};
      if (costingOptions.exclude_ferries) hardExclusions.exclude_ferries = true;
      if (costingOptions.exclude_highways) hardExclusions.exclude_highways = true;
      if (Object.keys(hardExclusions).length > 0) {
        (valhallaBody.costing_options as Record<string, unknown>).bicycle_exclude = hardExclusions;
      }
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
        message: 'Valhalla service is not available',
      } as unknown as RouteResponse);
    }

    if (!valhallaRes.ok) {
      const errorBody = await valhallaRes.text();
      req.log.error({ status: valhallaRes.status, body: errorBody }, 'Valhalla error');
      return reply.status(502).send({
        error: 'Routing engine error',
        message: `Valhalla returned ${valhallaRes.status}`,
      } as unknown as RouteResponse);
    }

    const data = (await valhallaRes.json()) as {
      trip?: {
        summary?: { length?: number; time?: number };
        legs?: Array<{ shape?: string }>;
      };
    };

    const trip = data.trip;
    if (!trip) {
      return reply.status(502).send({
        error: 'No route found',
        message: 'Valhalla returned no trip data',
      } as unknown as RouteResponse);
    }

    const summary = trip.summary || { length: 0, time: 0 };
    const encodedShape = trip.legs?.map((l) => l.shape || '').join('') || '';

    return reply.send({
      geometry: encodedShape,
      summary: {
        distanceKm: Math.round((summary.length || 0) * 100) / 100,
        durationMin: Math.round(((summary.time || 0) / 60) * 100) / 100,
        ascentM: 0, // Valhalla /route doesn't return ascent directly; will be added via trace_attributes in P3
        descentM: 0,
      },
    });
  },
);

// ── Start ─────────────────────────────────────
try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`API listening on http://${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

export default app;
