import { useQuery } from '@tanstack/react-query';
import type { ElevationProfile, ElevationProfileRequest } from '@cycleplanner/shared';

const API_BASE = '/api';

/**
 * Fetch elevation profile for a route polyline.
 * Only fires when a valid (non-empty) polyline is provided.
 * Cached per polyline string so repeated requests for the same route
 * are served from the cache.
 */
export function useElevationQuery(polyline: string | undefined) {
  return useQuery<ElevationProfile>({
    queryKey: ['elevation', polyline],
    queryFn: async () => {
      const res = await fetch(API_BASE + '/elevation/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ polyline } satisfies ElevationProfileRequest),
      });
      if (!res.ok) {
        throw new Error('Elevation fetch failed: ' + res.status);
      }
      return res.json() as Promise<ElevationProfile>;
    },
    enabled: !!polyline && polyline.length > 0,
    staleTime: 0, // 5 min cache
    retry: 2,
  });
}
