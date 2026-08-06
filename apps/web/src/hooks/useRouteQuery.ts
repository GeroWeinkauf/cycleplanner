import { useQuery } from '@tanstack/react-query';
import { useWaypointStore } from '../store/useWaypointStore';
import type { RouteResponse, Profile } from '@cycleplanner/shared';
import { useRef, useState, useEffect } from 'react';

const API_BASE = '/api';
const DEBOUNCE_MS = 250;

/**
 * Debounced route query.
 *
 * waypoints change → 250 ms debounce → query fires.
 * Parallel requests are discarded via AbortController.
 * Stale results from previous queries are never applied.
 */
export function useRouteQuery(profile: Profile = 'Trekking') {
  const waypoints = useWaypointStore((s) => s.waypoints);
  const abortRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef(0);

  // Debounce waypoint changes
  const [debouncedKey, setDebouncedKey] = useState('');
  useEffect(() => {
    const key = waypoints.map((wp) => `${wp.lat.toFixed(5)},${wp.lng.toFixed(5)}`).join('|');
    const timer = setTimeout(() => setDebouncedKey(key), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    waypoints.map((wp) => `${wp.lat.toFixed(5)},${wp.lng.toFixed(5)}`).join('|'),
  ]);

  const waypointKey = debouncedKey;
  const enabled = waypoints.length >= 2 && !!waypointKey;

  return useQuery<RouteResponse>({
    queryKey: ['route', profile, waypointKey],
    queryFn: async ({ signal }) => {
      // Abort any previous in-flight request
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      // Track request order — discard if a newer request started
      const myReqId = ++reqIdRef.current;

      const res = await fetch(`${API_BASE}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waypoints: waypoints.map((wp) => ({ lat: wp.lat, lng: wp.lng, label: wp.label })),
          profile,
        }),
        // Merge external signal with our own
        signal: signal ? anySignal([signal, controller.signal]) : controller.signal,
      });

      if (myReqId !== reqIdRef.current) {
        // A newer request was started, discard this result
        throw new Error('STALE_REQUEST');
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error((err as { message?: string }).message || `Route error: ${res.status}`);
      }
      return res.json() as Promise<RouteResponse>;
    },
    enabled,
    staleTime: 0,
    retry: (_failureCount, error) => {
      if ((error as Error).message === 'STALE_REQUEST') return false;
      return true;
    },
  });
}

/** Combine multiple AbortSignals into one */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}
