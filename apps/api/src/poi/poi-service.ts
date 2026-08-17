/**
 * POI Service (P4-1)
 *
 * Fetches points of interest from OpenStreetMap via the Overpass API.
 * Supports bounding-box and corridor queries.
 * Caches results in-memory with TTL to reduce Overpass load.
 */
import { POI_CATEGORIES } from '@cycleplanner/shared';
import type { Poi, PoiCategory, PoiSource } from '@cycleplanner/shared';

// ── Cache ───────────────────────────────────

interface CacheEntry {
  data: Poi[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function cacheKey(bbox: string, categories: string[]): string {
  return bbox + '|' + categories.sort().join(',');
}

function getCached(key: string): Poi[] | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS) {
    return entry.data;
  }
  if (entry) cache.delete(key);
  return null;
}

function setCache(key: string, data: Poi[]): void {
  cache.set(key, { data, fetchedAt: Date.now() });
  // Simple LRU: remove oldest if too many entries
  if (cache.size > 200) {
    let oldestKey = '';
    let oldestTime = Infinity;
    for (const [k, v] of cache) {
      if (v.fetchedAt < oldestTime) { oldestTime = v.fetchedAt; oldestKey = k; }
    }
    cache.delete(oldestKey);
  }
}

// ── Overpass endpoints ──────────────────────

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// ── Overpass query building ─────────────────

/** Minimum perimeter (m) for a closed water way to count as a "larger" lake */
const LAKE_MIN_PERIMETER_M = 2500;

function buildOverpassQuery(
  bbox: string,
  categories: PoiCategory[],
  limit: number,
): string {
  const cats = categories.length > 0
    ? categories
    : POI_CATEGORIES.map((c) => c.key);

  const parts: string[] = [];
  for (const cat of cats) {
    // Lakes are mapped as ways/relations in OSM — query them with
    // `out center` and a size filter (closed ways only, min perimeter).
    if (cat === 'lake') {
      parts.push(
        'way["natural"="water"]["name"](if: is_closed() && length() > ' + LAKE_MIN_PERIMETER_M + ')' + bbox + ';',
        'relation["natural"="water"]["name"]' + bbox + ';',
      );
      continue;
    }
    const meta = POI_CATEGORIES.find((c) => c.key === cat);
    if (meta && meta.osmTags.length > 0) {
      for (const tag of meta.osmTags) {
        const [key, value] = tag.split('=');
        parts.push('node["' + key + '"="' + value + '"]' + bbox + ';');
      }
    }
  }

  const query =
    '[out:json][timeout:10];(' +
    parts.join('\n') +
    ');out center ' + limit + ';';

  return query;
}

function buildCorridorQuery(
  corridorPolyline: string,
  _bufferM: number,
  categories: PoiCategory[],
  limit: number,
): string {
  // For corridor queries, we decode the polyline to get a bbox and use
  // a wider search. Overpass doesn't support geometry filtering natively,
  // so we query with a bbox encompassing the corridor.
  // A better approach would be to compute a polygon buffer, but for now
  // we use the bounding box of the route.

  // Decode polyline to get bbox
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  let idx = 0, lat = 0, lng = 0;

  while (idx < corridorPolyline.length) {
    let shift = 0, result = 0, byte: number;
    do {
      byte = corridorPolyline.charCodeAt(idx++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0; result = 0;
    do {
      byte = corridorPolyline.charCodeAt(idx++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    const latDeg = lat / 1e6;
    const lngDeg = lng / 1e6;
    if (latDeg < minLat) minLat = latDeg;
    if (latDeg > maxLat) maxLat = latDeg;
    if (lngDeg < minLng) minLng = lngDeg;
    if (lngDeg > maxLng) maxLng = lngDeg;
  }

  // Expand bbox slightly
  const pad = 0.02;
  const bbox = '(' + (minLat - pad).toFixed(4) + ',' + (minLng - pad).toFixed(4) + ',' +
    (maxLat + pad).toFixed(4) + ',' + (maxLng + pad).toFixed(4) + ')';

  return buildOverpassQuery(bbox, categories, limit);
}

// ── Main query function ─────────────────────

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  /** Center point for ways/relations when using `out center` */
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function classifyPoi(tags: Record<string, string>): PoiCategory {
  for (const cat of POI_CATEGORIES) {
    for (const osmTag of cat.osmTags) {
      const [key, value] = osmTag.split('=');
      if (tags[key] === value) return cat.key;
    }
  }
  return 'viewpoint'; // fallback
}

/**
 * Query POIs from Overpass API.
 */
export async function queryPois(
  bbox: string | undefined,
  categories: PoiCategory[],
  corridor?: string,
  limit = 100,
): Promise<Poi[]> {
  const cats = categories.length > 0 ? categories : POI_CATEGORIES.map((c) => c.key);

  // Check cache first
  let effectiveBbox = bbox || '';
  let query: string;

  if (corridor) {
    query = buildCorridorQuery(corridor, 500, cats as PoiCategory[], limit);
    effectiveBbox = 'corridor';
  } else if (bbox) {
    const bboxStr = '(' + bbox.split(',').map(Number).join(',') + ')';
    query = buildOverpassQuery(bboxStr, cats as PoiCategory[], limit);
  } else {
    return [];
  }

  const ck = cacheKey(effectiveBbox, cats);
  const cached = getCached(ck);
  if (cached) return cached;

  // Call Overpass API with fallback endpoints
  let lastError: unknown = null;
  
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log('[poi] Trying endpoint:', endpoint);
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'User-Agent': 'CyclePlanner/1.0' },
        body: query,
      });

      console.log('[poi] Response status:', res.status);
      
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('[poi] Error from', endpoint, ':', errText.substring(0, 200));
        lastError = new Error('HTTP ' + res.status + ': ' + errText.substring(0, 100));
        continue; // try next endpoint
      }

      const rawText = await res.text();
      console.log('[poi] Got', rawText.length, 'bytes from', endpoint);
      
      let data: { elements?: OverpassElement[] };
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        console.error('[poi] JSON parse error from', endpoint, ':', String(parseErr));
        lastError = parseErr;
        continue;
      }
      
      const elements = data.elements || [];
      console.log('[poi] Overpass returned', elements.length, 'elements');

      const pois: Poi[] = elements
        .map((el) => {
          // Nodes carry lat/lon directly; ways/relations carry a `center`
          // (Overpass `out center`) — used for lakes.
          let lat: number | undefined;
          let lng: number | undefined;
          if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
            lat = el.lat;
            lng = el.lon;
          } else if (el.center && el.center.lat !== undefined && el.center.lon !== undefined) {
            lat = el.center.lat;
            lng = el.center.lon;
          }
          if (lat === undefined || lng === undefined) return null;

          const tags = el.tags || {};
          const category = classifyPoi(tags);
          return {
            id: 'poi-' + el.id,
            name: tags.name || tags.ref || '',
            lat,
            lng,
            category,
            tags,
            source: 'overpass' as PoiSource,
          };
        })
        .filter((p): p is Poi => p !== null)
        .slice(0, limit);

      console.log('[poi] Returning', pois.length, 'POIs');
      setCache(ck, pois);
      return pois;
    } catch (err) {
      console.error('[poi] Fetch error for', endpoint, ':', String(err));
      lastError = err;
    }
  }
  
  console.error('[poi] All Overpass endpoints failed. Last error:', String(lastError));
  return [];
}

/**
 * Clear the POI cache (useful for testing/debugging).
 */
export function clearPoiCache(): void {
  cache.clear();
}
