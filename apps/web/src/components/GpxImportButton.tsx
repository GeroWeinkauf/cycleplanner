import { useCallback, useRef } from 'react';
import { useWaypointStore } from '../store/useWaypointStore';

const API_BASE = '/api';

export default function GpxImportButton() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      const data = (await res.json()) as { waypoints: Array<{ lat: number; lng: number; label?: string }> };
      if (data.waypoints.length > 0) {
        const store = useWaypointStore.getState();
        store.clearWaypoints();
        for (const wp of data.waypoints) {
          store.addWaypoint(wp.lat, wp.lng, 'break');
        }
      }
    } catch (err) {
      console.error('GPX import failed:', err);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".gpx,.xml" onChange={handleFileChange} className="hidden" />
      <button onClick={handleClick}
        className="flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-[10px] font-medium text-gray-600 shadow-md hover:bg-white border border-gray-200 backdrop-blur"
        title="GPX importieren">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        GPX
      </button>
    </>
  );
}
