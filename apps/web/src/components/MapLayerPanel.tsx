import { useState } from 'react';
import { LAYERS } from '../layers/registry';
import { LAYER_GROUPS } from '../layers/types';
import { BASEMAPS } from '../layers/basemaps';
import { useWaypointStore } from '../store/useWaypointStore';
import type { SavedSegment } from '@cycleplanner/shared';

interface Props {
  activeLayers: Set<string>;
  onToggleLayer: (layerId: string) => void;
  basemapId: string;
  onBasemapChange: (basemapId: string) => void;
  /** POI marker toggles: category key -> enabled */
  poiEnabled: Record<string, boolean>;
  onTogglePoi: (category: string) => void;
  /** POI toggle display options (from App) */
  poiOptions: Array<{ key: string; label: string; icon: string; hint: string }>;
  segments: SavedSegment[];
  onAppendSegment: (segment: SavedSegment) => void;
  onDeleteSegment: (segment: SavedSegment) => void;
}

export default function MapLayerPanel({
  activeLayers, onToggleLayer, basemapId, onBasemapChange,
  poiEnabled, onTogglePoi, poiOptions,
  segments, onAppendSegment, onDeleteSegment,
}: Props) {
  const [open, setOpen] = useState(false);
  const importedTracks = useWaypointStore((s) => s.importedTracks);
  const removeImportedTrack = useWaypointStore((s) => s.removeImportedTrack);
  const clearWaypoints = useWaypointStore((s) => s.clearWaypoints);
  const addWaypoint = useWaypointStore((s) => s.addWaypoint);
  const trackNames = Object.keys(importedTracks);

  const handleAdoptTrack = (filename: string) => {
    const geometry = importedTracks[filename];
    if (!geometry) return;
    // Parse the geometry (JSON-encoded [[lng,lat],...] array)
    try {
      const coords: Array<[number, number]> = JSON.parse(geometry);
      if (coords.length >= 2) {
        clearWaypoints();
        // Add first point as start
        addWaypoint(coords[0][1], coords[0][0], 'break');
        // Add middle points as through
        if (coords.length > 2) {
          const step = Math.max(1, Math.floor((coords.length - 2) / 10));
          for (let i = 1; i < coords.length - 1; i += step) {
            addWaypoint(coords[i][1], coords[i][0], 'through');
          }
        }
        // Add last point as end
        const last = coords[coords.length - 1];
        addWaypoint(last[1], last[0], 'break');
      }
    } catch {
      // ignore parse errors
    }
  };

  if (!open) {
    return (
      <div className="absolute bottom-3 left-3 z-[1000]">
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-2 text-xs font-medium text-gray-700 shadow-md hover:bg-white border border-gray-200 backdrop-blur">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          Ebenen
        </button>
      </div>
    );
  }

  return (
    <div className="absolute bottom-3 left-3 z-[1000]">
      <div className="rounded-lg bg-white shadow-lg border border-gray-200 min-w-[240px] max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-100">
          <span className="text-[10px] font-semibold text-gray-500">Ebenen</span>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 p-0.5" aria-label="Ebenen schließen">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto p-1.5">
          {/* Basemap switcher (exclusive) */}
          <div className="mb-1.5">
            <div className="text-[10px] font-semibold text-gray-400 px-1 mb-0.5">Basiskarte</div>
            {BASEMAPS.map(bm => (
              <label key={bm.id} className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 hover:bg-gray-50 text-[11px]">
                <input
                  type="radio"
                  name="basemap"
                  checked={basemapId === bm.id}
                  onChange={() => onBasemapChange(bm.id)}
                  className="mt-0.5 h-3 w-3 shrink-0 accent-blue-600"
                />
                <span className="text-gray-700">{bm.label}</span>
              </label>
            ))}
          </div>

          {/* Overlay layers grouped thematically */}
          {LAYER_GROUPS.map(({ id: groupId, label: groupLabel }) => {
            const groupLayers = LAYERS.filter((l) => l.group === groupId);
            if (groupLayers.length === 0) return null;
            return (
              <div key={groupId} className="mt-1.5 border-t border-gray-100 pt-1.5">
                <div className="text-[10px] font-semibold text-gray-400 px-1 mb-0.5">{groupLabel}</div>
                {groupLayers.map(layer => {
                  const active = activeLayers.has(layer.id);
                  return (
                    <label key={layer.id} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-gray-50 text-[11px]">
                      <input type="checkbox" checked={active} onChange={() => onToggleLayer(layer.id)} className="mt-0.5 h-3 w-3 shrink-0 accent-blue-600" />
                      <span className="min-w-0">
                        <span className="block text-gray-700">{layer.label}</span>
                        {layer.legend && (
                          <span className="block text-[9px] leading-tight text-gray-400">{layer.legend}</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            );
          })}

          {/* POI markers */}
          <div className="mt-1.5 border-t border-gray-100 pt-1.5">
            <div className="text-[10px] font-semibold text-gray-400 px-1 mb-0.5">POIs</div>
            {poiOptions.map(opt => (
              <label key={opt.key} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-gray-50 text-[11px]">
                <input
                  type="checkbox"
                  checked={!!poiEnabled[opt.key]}
                  onChange={() => onTogglePoi(opt.key)}
                  className="mt-0.5 h-3 w-3 shrink-0 accent-blue-600"
                />
                <span className="min-w-0">
                  <span className="block text-gray-700">{opt.icon} {opt.label}</span>
                  <span className="block text-[9px] leading-tight text-gray-400">{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>

          {/* Segment library */}
          {segments.length > 0 && (
            <div className="mt-1.5 border-t border-gray-100 pt-1.5">
              <div className="text-[10px] font-semibold text-gray-400 px-1 mb-0.5">Lieblingssegmente</div>
              {segments.map((seg) => (
                <div key={seg.id} className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-gray-50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10px] text-gray-700" title={seg.name}>☆ {seg.name}</span>
                    <span className="block text-[9px] text-gray-400">{seg.distanceKm.toFixed(1)} km</span>
                  </span>
                  <button
                    onClick={() => onAppendSegment(seg)}
                    className="shrink-0 text-[9px] text-blue-600 hover:underline"
                    title="Segment an die Route anhängen"
                  >
                    ↳ Anhängen
                  </button>
                  <button
                    onClick={() => onDeleteSegment(seg)}
                    className="shrink-0 text-gray-400 hover:text-red-500 p-0.5"
                    title="Segment löschen"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Imported tracks section */}
          {trackNames.length > 0 && (
            <div className="mt-2 border-t border-gray-100 pt-1.5">
              <div className="text-[10px] font-semibold text-gray-400 px-1 mb-1">Importierte Tracks</div>
              {trackNames.map((name) => (
                <div key={name} className="flex flex-col gap-0.5 rounded px-1 py-0.5 hover:bg-gray-50">
                  <div className="flex items-center gap-1">
                    <span className="truncate flex-1 text-[10px] text-gray-600" title={name}>{name}</span>
                    <button
                      onClick={() => removeImportedTrack(name)}
                      className="shrink-0 text-gray-400 hover:text-red-500 p-0.5"
                      title="Track entfernen"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <button
                    onClick={() => handleAdoptTrack(name)}
                    className="text-[9px] text-blue-600 hover:text-blue-800 hover:underline text-left"
                    title="Waypoints aus diesem Track übernehmen"
                  >
                    ↳ Als Route übernehmen
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
