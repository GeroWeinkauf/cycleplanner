import { useState, useCallback, useEffect } from 'react';
import { POI_CATEGORIES } from '@cycleplanner/shared';
import type { PoiCategory, Poi, PoiQueryResponse } from '@cycleplanner/shared';

const API_BASE = '/api';

interface Props {
  /** Bounding box for area queries */
  bbox: string | null;
  /** Route geometry for corridor queries */
  corridorGeometry?: string;
  /** Called when POIs are updated */
  onPoisLoaded?: (pois: Poi[]) => void;
  /** Called when user clicks a POI */
  onPoiClick?: (poi: Poi) => void;
}

/**
 * POI Controls panel.
 * Allows toggling categories and switching between area and corridor mode.
 * Fetches POIs from the backend when parameters change.
 */
export default function PoiControls({ bbox, corridorGeometry, onPoisLoaded, onPoiClick }: Props) {
  const [enabledCategories, setEnabledCategories] = useState<Set<PoiCategory>>(
    new Set((POI_CATEGORIES || []).map((c) => c.key)),
  );
  const [corridorMode, setCorridorMode] = useState(false);
  const [limit] = useState(150);
  const [pois, setPois] = useState<Poi[]>([]);
  const [loading, setLoading] = useState(false);

  const toggleCategory = useCallback((cat: PoiCategory) => {
    setEnabledCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setEnabledCategories((prev) => {
      if (prev.size === (POI_CATEGORIES || []).length) return new Set();
      return new Set((POI_CATEGORIES || []).map((c) => c.key));
    });
  }, []);

  // Fetch POIs when parameters change
  useEffect(() => {
    if (enabledCategories.size === 0) {
      setPois([]);
      onPoisLoaded?.([]);
      return;
    }

    const body: Record<string, unknown> = {
      categories: Array.from(enabledCategories),
      limit,
    };

    if (corridorMode && corridorGeometry) {
      body.corridor = corridorGeometry;
    } else if (bbox) {
      body.bbox = bbox;
    } else {
      return; // No area to query
    }

    setLoading(true);
    const controller = new AbortController();

    fetch(API_BASE + '/pois', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data: PoiQueryResponse) => {
        setPois(data.pois);
        onPoisLoaded?.(data.pois);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, [bbox, corridorGeometry, corridorMode, enabledCategories, limit, onPoisLoaded]);

  return (
    <div className="border-t border-gray-100">
      <div className="px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            POIs
          </span>
          <div className="flex items-center gap-1">
            {corridorGeometry && (
              <button
                onClick={() => setCorridorMode(!corridorMode)}
                className={
                  'rounded px-1.5 py-0.5 text-[10px] ' +
                  (corridorMode
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-gray-100 text-gray-500')
                }
              >
                {corridorMode ? 'Korridor' : 'Karte'}
              </button>
            )}
            <button
              onClick={toggleAll}
              className="rounded px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100"
            >
              {enabledCategories.size === (POI_CATEGORIES || []).length ? 'Alle aus' : 'Alle an'}
            </button>
          </div>
        </div>

        {loading && (
          <div className="py-1 text-[10px] text-gray-400">Lade POIs...</div>
        )}

        {/* Category toggles */}
        <div className="mt-1 flex flex-wrap gap-0.5">
          {(POI_CATEGORIES || []).map((cat) => {
            const active = enabledCategories.has(cat.key);
            const count = (pois || []).filter((p) => p.category === cat.key).length;
            return (
              <button
                key={cat.key}
                onClick={() => toggleCategory(cat.key)}
                className={
                  'flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] transition-colors ' +
                  (active
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-50 text-gray-400 line-through')
                }
                title={cat.label}
              >
                <span>{cat.icon}</span>
                {count > 0 && <span className="font-medium">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* POI list (clickable) */}
        {pois.length > 0 && (
          <div className="mt-2 max-h-40 overflow-y-auto border-t border-gray-100 pt-1">
            {pois.slice(0, 30).map((poi) => (
              <button
                key={poi.id}
                onClick={() => onPoiClick?.(poi)}
                className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[10px] hover:bg-gray-50"
              >
                <span className="shrink-0">
                  {(POI_CATEGORIES || []).find((c) => c.key === poi.category)?.icon || '📍'}
                </span>
                <span className="min-w-0 flex-1 truncate text-gray-700">
                  {poi.name || poi.category}
                </span>
                {poi.distanceKm !== undefined && (
                  <span className="shrink-0 text-gray-400">
                    {poi.distanceKm.toFixed(1)} km
                  </span>
                )}
              </button>
            ))}
            {pois.length > 30 && (
              <div className="px-1 py-0.5 text-[10px] text-gray-400">
                +{pois.length - 30} weitere
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
