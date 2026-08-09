import { useCallback } from 'react';
import { useWaypointStore } from '../store/useWaypointStore';
import type { RouteResponse } from '@cycleplanner/shared';

const API_BASE = '/api';

interface Props {
  route?: RouteResponse | null;
}

export default function GpxExportSection({ route }: Props) {
  const waypoints = useWaypointStore((s) => s.waypoints);

  const handleExport = useCallback(async () => {
    if (!route?.geometry) return;
    try {
      const res = await fetch(API_BASE + '/export/gpx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geometry: route.geometry,
          waypoints: waypoints.map((wp) => ({ lat: wp.lat, lng: wp.lng, label: wp.label })),
          mode: 'track',
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
      <button
        onClick={handleExport}
        disabled={!route}
        className="flex w-full items-center justify-center gap-2 rounded bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Route als GPX-Track exportieren"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        GPX exportieren
      </button>
    </div>
  );
}