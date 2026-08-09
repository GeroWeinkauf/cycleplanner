import { useQuery } from '@tanstack/react-query';
import { useProfileStore } from '../store/useProfileStore';
import type { RouteAnalysis, RouteAnalysisRequest } from '@cycleplanner/shared';

const API_BASE = '/api';

/**
 * Fetch per-edge route analysis for coloring and scoring.
 * Depends on route geometry being available.
 */
export function useRouteAnalysis(geometry: string | undefined) {
  const profile = useProfileStore((s) => s.profile);

  return useQuery<RouteAnalysis>({
    queryKey: ['routeAnalysis', geometry, profile],
    queryFn: async () => {
      if (!geometry) throw new Error('No geometry');
      const res = await fetch(API_BASE + '/route/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geometry, profile } satisfies RouteAnalysisRequest),
      });
      if (!res.ok) throw new Error('Analysis failed: ' + res.status);
      return res.json() as Promise<RouteAnalysis>;
    },
    enabled: !!geometry && geometry.length > 0,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}
