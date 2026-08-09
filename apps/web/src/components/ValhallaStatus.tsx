import { useState, useEffect, useCallback, useRef } from 'react';
import { useWaypointStore } from '../store/useWaypointStore';

interface ValhallaState {
  running: boolean;
  message: string;
}

const API_BASE = '/api';

export default function ValhallaStatus() {
  const [status, setStatus] = useState<ValhallaState | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waypointCount = useWaypointStore((s) => s.waypoints.length);
  const autoStartedRef = useRef(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(API_BASE + '/valhalla/status');
      const data = (await res.json()) as ValhallaState;
      setStatus(data);
      setError(null);
      return data;
    } catch {
      setStatus({ running: false, message: 'Status nicht abrufbar' });
      return { running: false, message: 'Status nicht abrufbar' };
    }
  }, []);

  const handleStart = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(API_BASE + '/valhalla/start', { method: 'POST' });
      const data = (await res.json()) as { ok: boolean; message: string };
      if (data.ok) {
        setTimeout(() => checkStatus(), 3000);
        setTimeout(() => checkStatus(), 8000);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Start nicht moeglich: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setStarting(false);
    }
  }, [checkStatus]);

  // Auto-start Valhalla when the first waypoint is placed
  useEffect(() => {
    if (waypointCount >= 1 && status && !status.running && !starting && !autoStartedRef.current) {
      autoStartedRef.current = true;
      handleStart();
    }
    // Reset auto-start flag when all waypoints are cleared
    if (waypointCount === 0) {
      autoStartedRef.current = false;
    }
  }, [waypointCount, status, starting, handleStart]);

  // Poll status every 10s
  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  if (!status) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-gray-400">
        <div className="h-2 w-2 rounded-full bg-gray-300 animate-pulse" />
        Pruefe Valhalla...
      </div>
    );
  }

  if (status.running) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px]">
        <div className="h-2 w-2 rounded-full bg-green-500" />
        <span className="text-green-700">Valhalla bereit</span>
      </div>
    );
  }

  return (
    <div className="px-3 py-1.5">
      <div className="flex items-center gap-1.5 text-[10px] text-red-600 mb-1">
        <div className="h-2 w-2 rounded-full bg-red-500" />
        <span>Valhalla nicht erreichbar</span>
      </div>
      <button
        onClick={handleStart}
        disabled={starting}
        className="rounded bg-blue-600 px-2 py-0.5 text-[10px] text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {starting ? 'Starte...' : 'Valhalla starten'}
      </button>
      {error && (
        <p className="mt-1 text-[9px] text-red-500">{error}</p>
      )}
    </div>
  );
}
