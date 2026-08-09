/**
 * Decode a polyline string (or JSON coordinate array) to [lng, lat] pairs.
 * Supports both Valhalla-encoded polyline strings (Google format, precision 6)
 * and JSON arrays of [lng, lat] coordinate pairs.
 */
export function decodePolyline(str: string): Array<[number, number]> {
  if (!str) return [];

  // New format: JSON array of [lng, lat] pairs
  if (str.startsWith('[[') || str.startsWith('[')) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as Array<[number, number]>;
      }
    } catch { /* fall through to legacy decoding */ }
  }

  // Legacy format: Valhalla-encoded polyline
  const coords: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < str.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coords.push([lng / 1e6, lat / 1e6]);
  }

  return coords;
}

/**
 * Find the nearest point on a polyline to a given point.
 * Returns the closest coordinate and its segment index (0-based).
 */
export function nearestPointOnLine(
  pt: [number, number],
  line: Array<[number, number]>,
): { coord: [number, number]; index: number } {
  if (line.length === 0) return { coord: pt, index: 0 };
  if (line.length === 1) return { coord: line[0], index: 0 };

  let bestDist = Infinity;
  let bestCoord: [number, number] = line[0];
  let bestIndex = 0;

  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const nearest = nearestPointOnSegment(pt, a, b);
    const dist = squaredDist(pt, nearest);
    if (dist < bestDist) {
      bestDist = dist;
      bestCoord = nearest;
      bestIndex = i;
    }
  }

  return { coord: bestCoord, index: bestIndex };
}

function nearestPointOnSegment(
  pt: [number, number],
  a: [number, number],
  b: [number, number],
): [number, number] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return a;
  let t = ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return [a[0] + t * dx, a[1] + t * dy];
}

function squaredDist(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}
