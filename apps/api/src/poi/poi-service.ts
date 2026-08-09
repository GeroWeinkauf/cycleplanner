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

// ── Overpass query building ─────────────────

function buildOverpassQuery(
  bbox: string,
  categories: PoiCategory[],
  limit: number,
): string {
  const cats = categories.length > 0
    ? categories
    : POI_CATEGORIES.map((c) => c.key);

  const tagSets: string[][] = [];
  for (const cat of cats) {
    const meta = POI_CATEGORIES.find((c) => c.key === cat);
    if (meta && meta.osmTags.length > 0) {
      tagSets.push(meta.osmTags);
    }
  }

  // Flatten all tags into union query
  const tagFilters = tagSets.flat().map((tag) => {
    const [key, value] = tag.split('=');
    return 'node["' + key + '"="' + value + '"]' + bbox + ';';
  });

  const query =
    '[out:json][timeout:15][maxsize:1073741824];(' +
    tagFilters.join('\n') +
    ');out body ' + limit + ';';

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

  // Call Overpass API
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: query,
    });

    if (!res.ok) return [];

    const data = (await res.json()) as { elements?: OverpassElement[] };
    const elements = data.elements || [];

    const pois: Poi[] = elements
      .filter((el) => el.type === 'node' && el.lat !== undefined && el.lon !== undefined)
      .map((el) => {
        const tags = el.tags || {};
        const category = classifyPoi(tags);
        return {
          id: 'poi-' + el.id,
          name: tags.name || tags.ref || '',
          lat: el.lat!,
          lng: el.lon!,
          category,
          tags,
          source: 'overpass' as PoiSource,
        };
      })
      .slice(0, limit);

    setCache(ck, pois);
    return pois;
  } catch {
    return [];
  }
}

/**
 * Clear the POI cache (useful for testing/debugging).
 */
export function clearPoiCache(): void {
  cache.clear();
}
