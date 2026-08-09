import { useState, useCallback, useEffect } from 'react';
import { LAYERS } from '../layers/registry';
import { POI_CATEGORIES } from '@cycleplanner/shared';
import type { PoiCategory, Poi, PoiQueryResponse } from '@cycleplanner/shared';

const API_BASE = '/api';

interface Props {
  activeLayers: Set<string>;
  onToggleLayer: (layerId: string) => void;
  bbox: string | null;
  corridorGeometry?: string;
  onPoisLoaded?: (pois: Poi[]) => void;
}

export default function MapLayerPanel({ activeLayers, onToggleLayer, bbox, corridorGeometry, onPoisLoaded }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'layers' | 'pois'>('layers');
  const [enabledPoiCats, setEnabledPoiCats] = useState<Set<PoiCategory>>(
    () => new Set((POI_CATEGORIES || []).map(c => c.key)),
  );

  const togglePoiCat = useCallback((cat: PoiCategory) => {
    setEnabledPoiCats(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }, []);

  // Fetch POIs
  useEffect(() => {
    if (!open || tab !== 'pois' || enabledPoiCats.size === 0) { onPoisLoaded?.([]); return; }
    const body: Record<string, unknown> = { categories: Array.from(enabledPoiCats), limit: 100 };
    if (corridorGeometry) body.corridor = corridorGeometry;
    else if (bbox) body.bbox = bbox;
    else { onPoisLoaded?.([]); return; }
    const ctrl = new AbortController();
    fetch(API_BASE + '/pois', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal })
      .then(r => r.json())
      .then((d: PoiQueryResponse) => onPoisLoaded?.(d.pois))
      .catch(() => {});
    return () => ctrl.abort();
  }, [open, tab, enabledPoiCats, bbox, corridorGeometry, onPoisLoaded]);

  return (
    <div className="absolute bottom-3 left-3 z-[1000]">
      {!open && (
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-2 text-xs font-medium text-gray-700 shadow-md hover:bg-white border border-gray-200 backdrop-blur">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          Karte
        </button>
      )}

      {open && (
        <div className="rounded-lg bg-white shadow-lg border border-gray-200 min-w-[180px] max-h-[320px] flex flex-col">
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-100">
            <div className="flex gap-0.5">
              <button onClick={() => setTab('layers')}
                className={'rounded px-2 py-0.5 text-[10px] ' + (tab === 'layers' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')}>Ebenen</button>
              <button onClick={() => setTab('pois')}
                className={'rounded px-2 py-0.5 text-[10px] ' + (tab === 'pois' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')}>POIs</button>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 p-0.5">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto p-1.5">
            {tab === 'layers' && LAYERS.map(layer => {
              const active = activeLayers.has(layer.id);
              return (
                <label key={layer.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-gray-50 text-[11px]">
                  <input type="checkbox" checked={active} onChange={() => onToggleLayer(layer.id)} className="h-3 w-3 accent-blue-600" />
                  <span className="text-gray-700">{layer.label}</span>
                </label>
              );
            })}
            {tab === 'pois' && (POI_CATEGORIES || []).map(cat => {
              const active = enabledPoiCats.has(cat.key);
              return (
                <label key={cat.key} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-gray-50 text-[11px]">
                  <input type="checkbox" checked={active} onChange={() => togglePoiCat(cat.key)} className="h-3 w-3 accent-indigo-600" />
                  <span>{cat.icon}</span>
                  <span className="text-gray-700">{cat.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
