import { useQuery } from '@tanstack/react-query';
import type { RoundTripResponse, RoundTripRequest } from '@cycleplanner/shared';
import { useProfileStore } from '../store/useProfileStore';

const API_BASE = '/api';

interface RoundTripParams {
  lat: number;
  lng: number;
  targetDistanceKm: number;
}

/**
 * Fetch round trip variants for a given starting point and target distance.
 */
export function useRoundTripQuery(params: RoundTripParams | null) {
  const profile = useProfileStore((s) => s.profile);
  const overrides = useProfileStore((s) => s.overrides);
  const exclusionFlags = useProfileStore((s) => s.exclusionFlags);

  return useQuery<RoundTripResponse>({
    queryKey: ['roundtrip', params, profile, overrides, exclusionFlags],
    queryFn: async () => {
      if (!params) throw new Error('No params');
      const res = await fetch(API_BASE + '/tours/roundtrip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: params.lat,
          lng: params.lng,
          targetDistanceKm: params.targetDistanceKm,
          profile,
          costingOverrides: overrides,
          exclusionFlags,
        } satisfies RoundTripRequest),
      });
      if (!res.ok) throw new Error('Round trip failed: ' + res.status);
      return res.json() as Promise<RoundTripResponse>;
    },
    enabled: !!params,
    staleTime: 0,
    retry: 1,
  });
}
