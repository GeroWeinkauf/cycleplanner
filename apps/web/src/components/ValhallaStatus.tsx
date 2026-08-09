import { useState, useEffect, useCallback } from 'react';

interface ValhallaState {
  running: boolean;
  message: string;
}

const API_BASE = '/api';

export default function ValhallaStatus() {
  const [status, setStatus] = useState<ValhallaState | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(API_BASE + '/valhalla/status');
      const text = await res.text();
      if (!text) { setStatus({ running: false, message: 'Keine Antwort' }); return; }
      const data = JSON.parse(text) as ValhallaState;
      setStatus(data);
    } catch {
      setStatus({ running: false, message: 'Nicht erreichbar' });
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  if (!status) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-gray-400">
        <div className="h-2 w-2 rounded-full bg-gray-300 animate-pulse" />
        Prüfe Valhalla...
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
    <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-red-600">
      <div className="h-2 w-2 rounded-full bg-red-500" />
      <span>Valhalla nicht erreichbar</span>
    </div>
  );
}
