import { useQuery } from '@tanstack/react-query';
import type { RouteWeatherReport, WeatherWindowsResponse } from '@cycleplanner/shared';
import { decodePolyline } from '../lib/polyline';

const API_BASE = '/api';

/** Reduce a dense coordinate list to at most `max` points (keeps start/end) */
export function sampleRouteCoords(
  coords: Array<[number, number]>,
  max = 60,
): Array<[number, number]> {
  if (coords.length <= max) return coords;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < max - 1; i++) {
    out.push(coords[Math.floor((i * (coords.length - 1)) / (max - 1))]);
  }
  out.push(coords[coords.length - 1]);
  return out;
}

/**
 * Weather along the route for the configured start time (or "now").
 * Cached 10 minutes per route + start time + speed.
 */
export function useWeatherRouteQuery(
  geometry: string | undefined,
  startTimeIso: string | null,
  avgSpeedKmh: number,
) {
  return useQuery<RouteWeatherReport>({
    queryKey: ['weather-route', geometry?.substring(0, 60), startTimeIso, avgSpeedKmh],
    queryFn: async () => {
      if (!geometry) throw new Error('No geometry');
      const route = sampleRouteCoords(decodePolyline(geometry));
      const res = await fetch(API_BASE + '/weather/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route,
          startTimeIso: startTimeIso ?? undefined,
          avgSpeedKmh,
        }),
      });
      if (!res.ok) throw new Error('Weather fetch failed: ' + res.status);
      return res.json() as Promise<RouteWeatherReport>;
    },
    enabled: !!geometry && geometry.length > 0,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Departure window optimization — only fetched on demand (enabled flag).
 */
export function useWeatherWindowsQuery(
  geometry: string | undefined,
  avgSpeedKmh: number,
  enabled: boolean,
) {
  return useQuery<WeatherWindowsResponse>({
    queryKey: ['weather-windows', geometry?.substring(0, 60), avgSpeedKmh],
    queryFn: async () => {
      if (!geometry) throw new Error('No geometry');
      const route = sampleRouteCoords(decodePolyline(geometry));
      const res = await fetch(API_BASE + '/weather/windows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route, avgSpeedKmh, horizonHours: 48 }),
      });
      if (!res.ok) throw new Error('Weather windows failed: ' + res.status);
      return res.json() as Promise<WeatherWindowsResponse>;
    },
    enabled: enabled && !!geometry,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}
