import { useQuery } from '@tanstack/react-query';
import { useProfileStore } from '../store/useProfileStore';
import type { QualityScore } from '@cycleplanner/shared';

const API_BASE = '/api';

interface Props {
  geometry: string | undefined;
  /** Called when a sub-score row is clicked, with the key */
  onSubScoreClick?: (key: string) => void;
}

/**
 * Fetches and displays the quality score with sub-score breakdown.
 */
export default function ScorePanel({ geometry, onSubScoreClick }: Props) {
  const profile = useProfileStore((s) => s.profile);

  const { data: score, isLoading } = useQuery<QualityScore>({
    queryKey: ['routeScore', geometry, profile],
    queryFn: async () => {
      if (!geometry) throw new Error('No geometry');
      const res = await fetch(API_BASE + '/route/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geometry, profile }),
      });
      if (!res.ok) throw new Error('Score failed');
      return res.json() as Promise<QualityScore>;
    },
    enabled: !!geometry && geometry.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-400">
        Berechne Qualitaetswert...
      </div>
    );
  }

  if (!score) return null;

  // Colorize the total score
  const scoreColor =
    score.total >= 80 ? 'text-green-600' :
    score.total >= 60 ? 'text-yellow-600' :
    score.total >= 40 ? 'text-orange-600' : 'text-red-600';

  const scoreBg =
    score.total >= 80 ? 'bg-green-100' :
    score.total >= 60 ? 'bg-yellow-100' :
    score.total >= 40 ? 'bg-orange-100' : 'bg-red-100';

  return (
    <div className="border-t border-gray-100 px-3 py-2">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Qualitaetswert
      </div>

      {/* Overall score */}
      <div className="mb-2 flex items-center gap-3">
        <div className={'flex h-10 w-10 items-center justify-center rounded-full ' + scoreBg}>
          <span className={'text-lg font-bold ' + scoreColor}>{score.total}</span>
        </div>
        <div className="flex-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className={'h-full rounded-full transition-all ' + (score.total >= 80 ? 'bg-green-500' : score.total >= 60 ? 'bg-yellow-500' : score.total >= 40 ? 'bg-orange-500' : 'bg-red-500')}
              style={{ width: score.total + '%' }}
            />
          </div>
          <div className="mt-0.5 text-[10px] text-gray-400">
            {score.total >= 80 ? 'Ausgezeichnet' :
             score.total >= 60 ? 'Gut' :
             score.total >= 40 ? 'Befriedigend' : 'Ausbaufaehig'}
          </div>
        </div>
      </div>

      {/* Sub-score breakdown */}
      <div className="flex flex-col gap-0.5">
        {score.subScores.map((sub) => {
          const barColor =
            sub.value >= 80 ? 'bg-green-500' :
            sub.value >= 60 ? 'bg-yellow-500' :
            sub.value >= 40 ? 'bg-orange-500' : 'bg-red-500';

          return (
            <button
              key={sub.key}
              onClick={() => onSubScoreClick?.(sub.key)}
              className="flex items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-gray-50"
            >
              <span className="w-4 text-center text-xs">{sub.icon}</span>
              <span className="min-w-0 flex-1 text-xs text-gray-700">{sub.label}</span>
              <div className="flex w-20 items-center gap-1">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={'h-full rounded-full ' + barColor}
                    style={{ width: sub.value + '%' }}
                  />
                </div>
                <span className="w-8 text-right text-[10px] tabular-nums text-gray-500">
                  {sub.value}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
