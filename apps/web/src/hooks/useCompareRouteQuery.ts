import { useQuery } from '@tanstack/react-query';
import { useWaypointStore } from '../store/useWaypointStore';
import type { RouteResponse, ProfileId, CostingOverrides, ExclusionFlags } from '@cycleplanner/shared';

const API_BASE = '/api';
const DEBOUNCE_MS = 500;

interface CompareParams {
  profile: ProfileId;
  overrides: CostingOverrides;
  exclusionFlags: ExclusionFlags;
}

/**
 * Fetch a comparison route with explicitly provided costing parameters.
 * Used for the A/B comparison mode in the tuning panel.
 * Only fires when comparison params are provided and waypoints exist.
 */
export function useCompareRouteQuery(params: CompareParams | null) {
  const waypoints = useWaypointStore((s) => s.waypoints);

  const enabled = !!params && waypoints.length >= 2;

  return useQuery<RouteResponse>({
    queryKey: ['compareRoute', params, waypoints.map((w) => w.id).join(',')],
    queryFn: async () => {
      if (!params) throw new Error('No params');

      const currentWaypoints = useWaypointStore.getState().waypoints;
      const currentBlockedSegment = useWaypointStore.getState().blockedSegment;

      const body: Record<string, unknown> = {
        waypoints: currentWaypoints.map((wp) => ({ lat: wp.lat, lng: wp.lng, label: wp.label })),
        profile: params.profile,
        costingOverrides: params.overrides,
        exclusionFlags: params.exclusionFlags,
      };

      if (currentBlockedSegment && currentBlockedSegment.length >= 2) {
        body.excludePolygon = currentBlockedSegment.map((c) => ({ lng: c[0], lat: c[1] }));
      }

      const res = await fetch(API_BASE + '/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error((err as { message?: string }).message || 'Route error: ' + res.status);
      }
      return res.json() as Promise<RouteResponse>;
    },
    enabled,
    staleTime: 0,
    retry: 1,
  });
}
