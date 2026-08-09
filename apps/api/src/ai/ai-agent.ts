/**
 * AI Tour Planning Agent (P6-1)
 *
 * An LLM-powered agent that plans bicycle tours from natural language
 * descriptions. The agent has four tools and runs in a max-4-iteration loop.
 *
 * Tools:
 *   1. search_pois — Search for points of interest near a location
 *   2. plan_route — Compute a bicycle route between waypoints
 *   3. get_elevation — Get elevation profile for a route
 *   4. analyze_route — Get edge-level analysis of a route
 *
 * The result is an editable waypoint list that can be loaded into
 * the CyclePlanner UI for further refinement.
 */

import { randomUUID } from 'node:crypto';
import type { Poi, PoiCategory } from '@cycleplanner/shared';
import { queryPois } from '../poi/poi-service.js';

// ── Configuration ───────────────────────────

/** LLM API endpoint (configurable via env, defaults to DeepSeek) */
const LLM_URL = process.env.LLM_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const LLM_KEY = process.env.LLM_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-chat';

/** Maximum iterations before forced stop */
const MAX_ITERATIONS = 4;

/** Maximum tokens per LLM call */
const MAX_TOKENS = 2000;

// ── Types ────────────────────────────────────

interface WaypointOutput {
  lat: number;
  lng: number;
  label: string;
}

interface AgentResult {
  waypoints: WaypointOutput[];
  summary: string;
  iterations: number;
  tokensUsed: number;
  toolCalls: Array<{ tool: string; args: Record<string, unknown>; result: string }>;
}

interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

interface LlmResponse {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
  }>;
  usage?: { total_tokens: number };
}

// ── Tool definitions ────────────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_pois',
      description: 'Search for points of interest (cafés, restaurants, viewpoints, bike shops, etc.) near a location.',
      parameters: {
        type: 'object',
        properties: {
          lat: { type: 'number', description: 'Latitude' },
          lng: { type: 'number', description: 'Longitude' },
          categories: {
            type: 'array',
            items: { type: 'string', enum: ['cafe', 'restaurant', 'viewpoint', 'water', 'bikeShop', 'trainStation', 'picnic', 'shelter', 'campsite'] },
            description: 'POI categories to search for',
          },
          radius: { type: 'number', description: 'Search radius in km (default 5)' },
        },
        required: ['lat', 'lng'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'plan_route',
      description: 'Plan a bicycle route between waypoints. Returns distance, duration, and geometry.',
      parameters: {
        type: 'object',
        properties: {
          waypoints: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                lat: { type: 'number' },
                lng: { type: 'number' },
                label: { type: 'string' },
              },
              required: ['lat', 'lng'],
            },
            description: 'Ordered list of waypoints',
          },
          profile: { type: 'string', enum: ['Tourenrad', 'Rennrad', 'Gravel', 'MTB'], description: 'Bicycle profile' },
        },
        required: ['waypoints', 'profile'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_elevation',
      description: 'Get the elevation profile (ascent, descent, max slope) for a route.',
      parameters: {
        type: 'object',
        properties: {
          geometry: { type: 'string', description: 'Encoded polyline of the route' },
        },
        required: ['geometry'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_route',
      description: 'Analyze a route: surface types, road classes, bike network percentage.',
      parameters: {
        type: 'object',
        properties: {
          geometry: { type: 'string', description: 'Encoded polyline of the route' },
          profile: { type: 'string', enum: ['Tourenrad', 'Rennrad', 'Gravel', 'MTB'] },
        },
        required: ['geometry', 'profile'],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are a bicycle tour planning assistant for CyclePlanner, a tool for planning high-quality bicycle tours in Germany and Mid-Europe.

Your job is to plan a bicycle tour based on the user's request. You can use tools to:
- Search for POIs (cafés, viewpoints, etc.) to include as stops
- Compute routes between waypoints
- Check elevation profiles
- Analyze route quality

After gathering information, respond with a JSON object containing:
{
  "waypoints": [
    { "lat": 51.34, "lng": 12.37, "label": "Start: Leipzig Hbf" },
    { "lat": 51.29, "lng": 12.45, "label": "Kaffeepause: Café am See" },
    ...
  ],
  "summary": "A 45km gravel tour from Leipzig to Lake Cospuden with a café stop..."
}

IMPORTANT:
- Use real coordinates from tool results, never invent coordinates
- The first waypoint is the start, the last is the end
- Include meaningful labels for each waypoint in German
- Round trips should have the same start and end point
- If the user specifies a distance, plan accordingly
- If the user specifies a profile (Gravel, Rennrad, etc.), use it
- You may use up to 4 tool calls to gather information`;

// ── Tool implementations ────────────────────

async function executeSearchPois(args: Record<string, unknown>): Promise<string> {
  const lat = args.lat as number;
  const lng = args.lng as number;
  const categories = (args.categories as PoiCategory[]) || ['cafe', 'restaurant'];
  const radiusKm = (args.radius as number) || 5;

  // Build a bbox around the point
  const degPerKm = 1 / 111.32;
  const pad = radiusKm * degPerKm;
  const bbox = `${(lat - pad).toFixed(4)},${(lng - pad).toFixed(4)},${(lat + pad).toFixed(4)},${(lng + pad).toFixed(4)}`;

  const pois = await queryPois(bbox, categories, undefined, 20);

  if (pois.length === 0) {
    return JSON.stringify({ count: 0, pois: [], message: 'No POIs found in this area' });
  }

  const summary = pois.slice(0, 10).map((p: Poi) => ({
    name: p.name || 'Unnamed',
    category: p.category,
    lat: p.lat,
    lng: p.lng,
  }));

  return JSON.stringify({ count: pois.length, pois: summary });
}

async function executePlanRoute(args: Record<string, unknown>): Promise<string> {
  const waypoints = args.waypoints as Array<{ lat: number; lng: number; label?: string }>;
  const profile = (args.profile as string) || 'Tourenrad';

  if (!waypoints || waypoints.length < 2) {
    return JSON.stringify({ error: 'Need at least 2 waypoints' });
  }

  try {
    const valhallaUrl = process.env.VALHALLA_URL || 'http://127.0.0.1:8002';
    const res = await fetch(valhallaUrl + '/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: waypoints.map((wp) => ({ lat: wp.lat, lon: wp.lng })),
        costing: 'bicycle',
        costing_options: {
          bicycle: {
            bicycle_type: profile === 'Rennrad' ? 'Road' : profile === 'Gravel' ? 'Cross' : profile === 'MTB' ? 'Mountain' : 'Hybrid',
            use_hills: 0.35,
            avoid_bad_surfaces: 0.6,
          },
        },
        directions_options: { units: 'km' },
      }),
    });

    if (!res.ok) {
      return JSON.stringify({ error: 'Route computation failed: ' + res.status });
    }

    const data = (await res.json()) as {
      trip?: { summary?: { length?: number; time?: number }; legs?: Array<{ shape?: string }> };
    };

    const trip = data.trip;
    if (!trip) {
      return JSON.stringify({ error: 'No route found' });
    }

    return JSON.stringify({
      distanceKm: Math.round((trip.summary?.length || 0) * 100) / 100,
      durationMin: Math.round(((trip.summary?.time || 0) / 60) * 100) / 100,
      geometry: trip.legs?.map((l: { shape?: string }) => l.shape || '').join('') || '',
      success: true,
    });
  } catch (err) {
    return JSON.stringify({ error: 'Route planning error: ' + (err as Error).message });
  }
}

async function executeGetElevation(args: Record<string, unknown>): Promise<string> {
  const geometry = args.geometry as string;
  if (!geometry) return JSON.stringify({ error: 'No geometry provided' });

  try {
    const { computeElevationProfile } = await import('../elevation/elevation-service.js');
    const profile = await computeElevationProfile(geometry);
    return JSON.stringify({
      totalAscent: profile.metrics.totalAscent,
      totalDescent: profile.metrics.totalDescent,
      maxElevation: profile.metrics.maxElevation,
      minElevation: profile.metrics.minElevation,
      avgSlope: profile.metrics.avgSlope,
      maxSlope: profile.metrics.maxSlope,
    });
  } catch (err) {
    return JSON.stringify({ error: 'Elevation error: ' + (err as Error).message });
  }
}

async function executeAnalyzeRoute(args: Record<string, unknown>): Promise<string> {
  const geometry = args.geometry as string;
  const profile = (args.profile as string) || 'Tourenrad';

  if (!geometry) return JSON.stringify({ error: 'No geometry provided' });

  try {
    const { analyzeRoute } = await import('../analysis/analysis-service.js');
    const analysis = await analyzeRoute(geometry, profile as import('@cycleplanner/shared').ProfileId);
    return JSON.stringify({
      distanceKm: analysis.totalDistanceKm,
      surface: analysis.surfaceDistribution,
      roadClasses: analysis.roadClassDistribution,
      bikeNetworkPct: analysis.bikeNetworkPercentage,
      crossings: analysis.crossingCount,
    });
  } catch (err) {
    return JSON.stringify({ error: 'Analysis error: ' + (err as Error).message });
  }
}

async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case 'search_pois': return executeSearchPois(args);
    case 'plan_route': return executePlanRoute(args);
    case 'get_elevation': return executeGetElevation(args);
    case 'analyze_route': return executeAnalyzeRoute(args);
    default: return JSON.stringify({ error: 'Unknown tool: ' + name });
  }
}

// ── LLM call ─────────────────────────────────

async function callLlm(messages: LlmMessage[]): Promise<LlmResponse> {
  const res = await fetch(LLM_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + LLM_KEY,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      max_tokens: MAX_TOKENS,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    throw new Error('LLM API error: ' + res.status + ' ' + (await res.text()));
  }

  return (await res.json()) as LlmResponse;
}

// ── Result parsing ───────────────────────────

function parseFinalOutput(content: string): { waypoints: WaypointOutput[]; summary: string } | null {
  // Try to extract JSON from the content
  const jsonMatch = content.match(/\{[\s\S]*"waypoints"[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.waypoints && Array.isArray(parsed.waypoints)) {
      return {
        waypoints: parsed.waypoints.map((wp: Record<string, unknown>) => ({
          lat: wp.lat as number,
          lng: wp.lng as number,
          label: (wp.label as string) || '',
        })),
        summary: (parsed.summary as string) || '',
      };
    }
  } catch {
    // JSON parse failed
  }

  return null;
}

// ── Main agent loop ──────────────────────────

export async function runAiAgent(
  userQuery: string,
  onProgress?: (msg: string) => void,
): Promise<AgentResult> {
  const messages: LlmMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userQuery },
  ];

  let iterations = 0;
  let totalTokens = 0;
  const toolCalls: AgentResult['toolCalls'] = [];

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    onProgress?.(`Iteration ${iterations}/${MAX_ITERATIONS}...`);

    const response = await callLlm(messages);
    totalTokens += response.usage?.total_tokens || 0;

    const choice = response.choices[0];
    if (!choice) throw new Error('No response from LLM');

    const msg = choice.message;

    // If the LLM responded with content (final answer), parse it
    if (msg.content && !msg.tool_calls) {
      const parsed = parseFinalOutput(msg.content);
      if (parsed) {
        return {
          waypoints: parsed.waypoints,
          summary: parsed.summary,
          iterations,
          tokensUsed: totalTokens,
          toolCalls,
        };
      }
      // Not JSON — maybe the LLM wants to say something. Add as assistant message.
      messages.push({ role: 'assistant', content: msg.content });
      continue;
    }

    // If the LLM wants to call tools
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: msg.content || '',
        tool_calls: msg.tool_calls,
      });

      for (const tc of msg.tool_calls) {
        const fn = tc.function;
        onProgress?.(`  Tool: ${fn.name}(${fn.arguments.substring(0, 80)}...)`);

        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(fn.arguments);
        } catch {
          // Invalid JSON args — skip
        }

        const result = await executeToolCall(fn.name, args);
        toolCalls.push({ tool: fn.name, args, result: result.substring(0, 200) });

        // Add tool result message
        messages.push({
          role: 'tool',
          content: result,
          tool_call_id: tc.id,
        });
      }
      continue;
    }

    // Fallback: no content, no tool calls — ask the LLM to proceed
    messages.push({
      role: 'user',
      content: 'Please provide the final JSON result with waypoints and summary now.',
    });
  }

  // Max iterations reached — ask for final result
  onProgress?.('Max iterations reached, requesting final result...');
  messages.push({
    role: 'user',
    content: 'Stop using tools and provide the final JSON result with waypoints and summary right now.',
  });

  const finalResponse = await callLlm(messages);
  totalTokens += finalResponse.usage?.total_tokens || 0;
  const finalContent = finalResponse.choices[0]?.message?.content || '';

  const parsed = parseFinalOutput(finalContent);
  if (parsed) {
    return {
      waypoints: parsed.waypoints,
      summary: parsed.summary,
      iterations,
      tokensUsed: totalTokens,
      toolCalls,
    };
  }

  // Last resort: return empty
  return {
    waypoints: [],
    summary: 'Could not parse tour plan from AI response.',
    iterations,
    tokensUsed: totalTokens,
    toolCalls,
  };
}
