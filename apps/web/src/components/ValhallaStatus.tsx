import { useState, useEffect, useCallback } from 'react';

interface ValhallaState {
  running: boolean;
  message: string;
}

const API_BASE = '/api';

export default function ValhallaStatus() {
  const [status, setStatus] = useState<ValhallaState | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(API_BASE + '/valhalla/status');
      const text = await res.text();
      if (!text) {
        setStatus({ running: false, message: 'Keine Antwort' });
        return;
      }
      const data = JSON.parse(text) as ValhallaState;
      setStatus(data);
      if (data.running) {
        setError(null);
      }
    } catch {
      setStatus({ running: false, message: 'Nicht erreichbar' });
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  // Poll more frequently while starting
  useEffect(() => {
    if (!starting) return;
    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, [starting, checkStatus]);

  // Auto-detect when container is running again
  useEffect(() => {
    if (starting && status?.running) {
      setStarting(false);
      setError(null);
    }
  }, [starting, status]);

  const handleStart = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(API_BASE + '/valhalla/start', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        console.log('[ValhallaStatus] Start command sent:', data);
        // Polling will auto-detect when running
      } else {
        console.error('[ValhallaStatus] Start failed:', data);
        setStarting(false);
        setError(data.message || 'Fehler beim Starten');
      }
    } catch (err) {
      console.error('[ValhallaStatus] Start request failed:', err);
      setStarting(false);
      setError('API nicht erreichbar – läuft der Backend-Server?');
    }
  };

  // Initial loading state
  if (!status) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-gray-400">
        <div className="h-2 w-2 rounded-full bg-gray-300 animate-pulse" />
        Prüfe Navigationsserver...
      </div>
    );
  }

  // Running state
  if (status.running) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px]">
        <div className="h-2 w-2 rounded-full bg-green-500" />
        <span className="text-green-700">Navigationsserver bereit</span>
      </div>
    );
  }

  // Starting state – blinking green indicator, button disabled
  if (starting) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px]">
        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-green-700">Navigationsserver startet…</span>
        <button
          disabled
          className="ml-1 px-2 py-0.5 rounded text-[10px] bg-gray-200 text-gray-400 border border-gray-300 cursor-not-allowed"
        >
          Start
        </button>
      </div>
    );
  }

  // Not running state – show start button, optionally with error
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-red-600">
        <div className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0" />
        <span>Navigationsserver nicht erreichbar</span>
        <button
          onClick={handleStart}
          className="ml-1 px-2 py-0.5 rounded text-[10px] bg-red-100 hover:bg-red-200 text-red-700 border border-red-300 transition-colors cursor-pointer whitespace-nowrap"
          title="Navigationsserver starten"
        >
          Start
        </button>
      </div>
      {error && (
        <div className="px-3 text-[10px] text-orange-600 leading-tight">
          {error}
        </div>
      )}
    </div>
  );
}