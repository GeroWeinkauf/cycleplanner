import { useCallback } from 'react';
import { useWaypointStore } from '../store/useWaypointStore';
import type { RouteResponse } from '@cycleplanner/shared';

const API_BASE = '/api';

interface Props {
  route?: RouteResponse | null;
}

export default function GpxExportSection({ route }: Props) {
  const waypoints = useWaypointStore((s) => s.waypoints);

  const handleExport = useCallback(async (mode: 'track' | 'route') => {
    if (!route?.geometry) return;
    try {
      const res = await fetch(API_BASE + '/export/gpx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geometry: route.geometry,
          waypoints: waypoints.map((wp) => ({ lat: wp.lat, lng: wp.lng, label: wp.label })),
          mode,
        }),
      });
      if (!res.ok) throw new Error('Export failed');
      const data = (await res.json()) as { gpx: string; filename: string };
      const blob = new Blob([data.gpx], { type: 'application/gpx+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('GPX export failed:', err);
    }
  }, [route, waypoints]);

  return (
    <div className="px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Export</div>
      <div className="flex gap-1.5">
        <button onClick={() => handleExport('track')} disabled={!route}
          className="flex-1 rounded bg-white border border-gray-200 px-2 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          .gpx Track
        </button>
        <button onClick={() => handleExport('route')} disabled={!route}
          className="flex-1 rounded bg-white border border-gray-200 px-2 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          .gpx Route
        </button>
      </div>
    </div>
  );
}
