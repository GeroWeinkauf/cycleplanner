import { useQuery } from '@tanstack/react-query';
import { useWaypointStore } from '../store/useWaypointStore';
import { useProfileStore } from '../store/useProfileStore';
import type { RouteResponse } from '@cycleplanner/shared';

const API_BASE = '/api';

/**
 * Route query — fires whenever waypoints, profile, or overrides change.
 * TanStack Query handles deduplication and caching internally.
 * Previous requests are aborted when a new one starts.
 */
export function useRouteQuery() {
  const waypoints = useWaypointStore((s) => s.waypoints);
  const blockedSegment = useWaypointStore((s) => s.blockedSegment);
  const profile = useProfileStore((s) => s.profile);
  const overrides = useProfileStore((s) => s.overrides);
  const exclusionFlags = useProfileStore((s) => s.exclusionFlags);

  // Build a stable query key from all inputs
  const queryKey = [
    'route',
    waypoints.map((wp) => `${wp.lat.toFixed(5)},${wp.lng.toFixed(5)}`).join('|'),
    profile,
    JSON.stringify(overrides),
    JSON.stringify(exclusionFlags),
    blockedSegment ? blockedSegment.map((c) => `${c[0].toFixed(5)},${c[1].toFixed(5)}`).join('|') : '',
  ];

  return useQuery<RouteResponse>({
    queryKey,
    queryFn: async ({ signal }) => {
      const currentWaypoints = useWaypointStore.getState().waypoints;
      const currentProfile = useProfileStore.getState().profile;
      const currentOverrides = useProfileStore.getState().overrides;
      const currentExclusions = useProfileStore.getState().exclusionFlags;
      const currentBlockedSegment = useWaypointStore.getState().blockedSegment;

      const body: Record<string, unknown> = {
        waypoints: currentWaypoints.map((wp) => ({ lat: wp.lat, lng: wp.lng, label: wp.label })),
        profile: currentProfile,
        costingOverrides: currentOverrides,
        exclusionFlags: currentExclusions,
      };

      if (currentBlockedSegment && currentBlockedSegment.length >= 2) {
        body.excludePolygon = currentBlockedSegment.map((c) => ({ lng: c[0], lat: c[1] }));
      }

      const controller = new AbortController();
      const combinedSignal = signal
        ? anySignal([signal, controller.signal])
        : controller.signal;

      const res = await fetch(`${API_BASE}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: combinedSignal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error((err as { message?: string }).message || `Route error: ${res.status}`);
      }
      return res.json() as Promise<RouteResponse>;
    },
    enabled: waypoints.length >= 2,
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  });
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) { controller.abort(signal.reason); return controller.signal; }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}
