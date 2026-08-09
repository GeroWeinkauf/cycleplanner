import { useQuery } from '@tanstack/react-query';
import { useWaypointStore } from '../store/useWaypointStore';
import { useProfileStore } from '../store/useProfileStore';
import type {
  CandidatesResponse,
  CandidatesRequest,
  CandidateRoute,
} from '@cycleplanner/shared';

const API_BASE = '/api';

interface Props {
  /** Whether to enable candidate fetching */
  enabled: boolean;
  /** Called when user selects a candidate */
  onSelectCandidate?: (candidate: CandidateRoute) => void;
}

/**
 * Fetches and displays route candidates with scores.
 */
export default function CandidateList({ enabled, onSelectCandidate }: Props) {
  const waypoints = useWaypointStore((s) => s.waypoints);
  const profile = useProfileStore((s) => s.profile);
  const overrides = useProfileStore((s) => s.overrides);
  const exclusionFlags = useProfileStore((s) => s.exclusionFlags);

  const { data, isLoading, isError, error } = useQuery<CandidatesResponse>({
    queryKey: ['candidates', waypoints.map((w) => w.id).join(','), profile, overrides, exclusionFlags],
    queryFn: async () => {
      const res = await fetch(API_BASE + '/route/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waypoints: waypoints.map((wp) => ({ lat: wp.lat, lng: wp.lng })),
          profile,
          costingOverrides: overrides,
          exclusionFlags,
        } satisfies CandidatesRequest),
      });
      if (!res.ok) throw new Error('Candidates failed: ' + res.status);
      return res.json() as Promise<CandidatesResponse>;
    },
    enabled: enabled && waypoints.length >= 2,
    staleTime: 0,
    retry: 1,
  });

  if (!enabled) return null;

  return (
    <div className="border-t border-gray-100 px-3 py-2">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Kandidaten
      </div>

      {isLoading && (
        <div className="py-2 text-xs text-gray-400">Berechne Alternativrouten...</div>
      )}

      {isError && (
        <div className="py-2 text-xs text-red-500">
          {(error as Error)?.message || 'Fehler bei Kandidatenberechnung'}
        </div>
      )}

      {data && data.candidates.length === 0 && (
        <div className="py-2 text-xs text-gray-400">Keine Alternativrouten gefunden.</div>
      )}

      {data && data.candidates.length > 0 && (
        <div className="flex flex-col gap-1">
          {data.candidates.map((c, i) => (
            <button
              key={c.id}
              onClick={() => onSelectCandidate?.(c)}
              className={
                'flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs ' +
                (i === 0
                  ? 'bg-blue-50 hover:bg-blue-100'
                  : 'bg-gray-50 hover:bg-gray-100')
              }
            >
              {/* Score badge */}
              <span className={
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ' +
                (c.score.total >= 80 ? 'bg-green-100 text-green-700' :
                 c.score.total >= 60 ? 'bg-yellow-100 text-yellow-700' :
                 'bg-orange-100 text-orange-700')
              }>
                {c.score.total}
              </span>

              <div className="min-w-0 flex-1">
                <div className="font-medium text-gray-800">
                  {c.summary.distanceKm.toFixed(1)} km · {c.summary.durationMin.toFixed(0)} min
                </div>
                <div className="flex gap-2 text-[10px] text-gray-400">
                  <span>
                    {c.analysis.surfaceDistribution.asphalt}% Asphalt
                  </span>
                  <span>
                    {c.analysis.bikeNetworkPercentage}% Radnetz
                  </span>
                  {c.source === 'sweep' && (
                    <span className="text-purple-500">
                      {c.params.sweepLabel as string || 'Variante'}
                    </span>
                  )}
                </div>
              </div>

              {/* Source indicator */}
              <span className="shrink-0 text-[10px] text-gray-400">
                {i === 0 ? 'Beste' : '#' + (i + 1)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
