import { useState, useCallback } from 'react';
import { useWaypointStore } from '../store/useWaypointStore';
import { useProfileStore } from '../store/useProfileStore';

const API_BASE = '/api';

interface AiResponse {
  waypoints: Array<{ lat: number; lng: number; label: string }>;
  summary: string;
  iterations: number;
  tokensUsed: number;
}

/**
 * AI Tour Planner (P6-1)
 *
 * Allows the user to describe a tour in natural language.
 * The backend AI agent plans waypoints which are loaded into the
 * waypoint store for further editing.
 */
export default function AiTourPlanner() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const { clearWaypoints, addWaypoint } = useWaypointStore();
  const profile = useProfileStore((s) => s.profile);

  const handleSubmit = useCallback(async () => {
    if (!query.trim() || query.trim().length < 5) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setProgress('Starte KI-Planung...');

    try {
      // Add profile context to the query
      const fullQuery = query.trim() +
        ' (Profile: ' + profile + ', Sprache: Deutsch)';

      const res = await fetch(API_BASE + '/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: fullQuery }),
      });

      if (!res.ok) {
        throw new Error('AI planing failed: ' + res.status);
      }

      const data = (await res.json()) as AiResponse & { error?: string };
      if (data.error) throw new Error(data.error);

      setResult(data);
      setProgress('Planung abgeschlossen!');
    } catch (err) {
      setError((err as Error).message);
      setProgress(null);
    } finally {
      setLoading(false);
    }
  }, [query, profile]);

  const handleApplyWaypoints = useCallback(() => {
    if (!result || result.waypoints.length === 0) return;

    clearWaypoints();
    for (const wp of result.waypoints) {
      addWaypoint(wp.lat, wp.lng, 'break');
    }
  }, [result, clearWaypoints, addWaypoint]);

  return (
    <div className="border-t border-gray-100 px-3 py-2">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
        KI-Tourenplanung
      </div>

      {/* Query input */}
      <div className="flex gap-1">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="z.B. 60km Gravel-Tour mit Kaffeepause..."
          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:border-purple-500 focus:outline-none"
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          disabled={loading}
        />
        <button
          onClick={handleSubmit}
          disabled={loading || query.trim().length < 5}
          className="shrink-0 rounded bg-purple-600 px-2 py-1 text-xs text-white hover:bg-purple-700 disabled:opacity-40"
        >
          {loading ? '...' : 'KI'}
        </button>
      </div>

      {/* Progress */}
      {progress && (
        <div className="mt-1 text-[10px] text-purple-600">{progress}</div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-1 text-[10px] text-red-500">
          {error}
          {error.includes('API key') && (
            <span className="ml-1 text-gray-400">
              (LLM_API_KEY in .env konfigurieren)
            </span>
          )}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mt-2 rounded border border-purple-200 bg-purple-50 p-2">
          <div className="text-xs font-medium text-purple-900">
            {result.waypoints.length} Wegpunkte geplant
          </div>
          <div className="mt-1 text-[10px] text-gray-600">
            {result.summary}
          </div>

          {/* Waypoint list */}
          <div className="mt-2 max-h-24 overflow-y-auto">
            {result.waypoints.map((wp, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 py-0.5 text-[10px] text-gray-700"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-purple-200 text-[8px] font-bold text-purple-700">
                  {i + 1}
                </span>
                <span className="truncate">{wp.label || `${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}`}</span>
              </div>
            ))}
          </div>

          {/* Apply button */}
          <button
            onClick={handleApplyWaypoints}
            className="mt-2 w-full rounded bg-purple-600 px-2 py-1 text-xs text-white hover:bg-purple-700"
          >
            Wegpunkte übernehmen
          </button>

          {/* Token usage */}
          <div className="mt-1 text-right text-[9px] text-gray-400">
            {result.iterations} Iterationen · {result.tokensUsed} Tokens
          </div>
        </div>
      )}
    </div>
  );
}
