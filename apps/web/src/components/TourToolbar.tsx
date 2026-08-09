import { useCallback, useRef } from 'react';
import { useWaypointStore } from '../store/useWaypointStore';
import type { RouteResponse } from '@cycleplanner/shared';

const API_BASE = '/api';

interface Props {
  route?: RouteResponse | null;
}

export default function TourToolbar({ route }: Props) {
  const waypoints = useWaypointStore((s) => s.waypoints);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── GPX Export ─────────────────────────────
  const handleExport = useCallback(
    async (mode: 'track' | 'route' | 'waypoints') => {
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

        // Trigger download
        const blob = new Blob([data.gpx], { type: 'application/gpx+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('GPX export failed:', err);
      }
    },
    [route, waypoints],
  );

  // ── GPX Import ─────────────────────────────
  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();

        const res = await fetch(API_BASE + '/import/gpx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gpx: text }),
        });

        if (!res.ok) throw new Error('Import failed');

        const data = (await res.json()) as {
          waypoints: Array<{ lat: number; lng: number; label?: string }>;
        };

        if (data.waypoints.length > 0) {
          // Clear existing and add imported waypoints
          const store = useWaypointStore.getState();
          store.clearWaypoints();
          for (const wp of data.waypoints) {
            store.addWaypoint(wp.lat, wp.lng, 'break');
          }
        }
      } catch (err) {
        console.error('GPX import failed:', err);
      }

      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [],
  );

  return (
    <div className="border-t border-gray-100 px-3 py-2">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Import / Export
      </div>

      {/* Export buttons */}
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => handleExport('track')}
          disabled={!route}
          className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200 disabled:opacity-40"
          title="GPX Track exportieren"
        >
          .gpx Track
        </button>
        <button
          onClick={() => handleExport('route')}
          disabled={!route}
          className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200 disabled:opacity-40"
          title="GPX Route exportieren"
        >
          .gpx Route
        </button>
        <button
          onClick={() => handleExport('waypoints')}
          disabled={!route}
          className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200 disabled:opacity-40"
          title="GPX Wegpunkte exportieren"
        >
          .gpx WP
        </button>
      </div>

      {/* Import button */}
      <div className="mt-1">
        <input
          ref={fileInputRef}
          type="file"
          accept=".gpx,.xml"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={handleImportClick}
          className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"
        >
          GPX importieren
        </button>
      </div>
    </div>
  );
}
