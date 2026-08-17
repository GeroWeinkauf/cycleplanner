import { useRideStore } from '../store/useRideStore';

/**
 * Ride profile settings: average speed + optional start time.
 * The start time drives the weather overlay (RainViewer shows the
 * forecast for that moment; without a start time "now" is used).
 */
export default function RideSettingsPanel() {
  const avgSpeedKmh = useRideStore((s) => s.avgSpeedKmh);
  const startTime = useRideStore((s) => s.startTime);
  const setAvgSpeedKmh = useRideStore((s) => s.setAvgSpeedKmh);
  const setStartTime = useRideStore((s) => s.setStartTime);

  const formatStart = (v: string | null) => {
    if (!v) return '–';
    const d = new Date(v);
    if (isNaN(d.getTime())) return v;
    return d.toLocaleString('de-DE', {
      weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="px-3 py-2">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Fahrprofil &amp; Wetter
        </span>
      </div>

      {/* Average speed */}
      <label className="mb-2 flex items-center gap-2 text-[11px] text-gray-600">
        <span className="flex-1">Ø Geschwindigkeit</span>
        <input
          type="number"
          min={5}
          max={40}
          step={1}
          value={avgSpeedKmh}
          onChange={(e) => setAvgSpeedKmh(Number(e.target.value))}
          className="w-16 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-right text-sm text-gray-800 focus:border-blue-500 focus:outline-none"
        />
        <span>km/h</span>
      </label>

      {/* Start time */}
      <div className="mb-1 flex items-center gap-2 text-[11px] text-gray-600">
        <span className="flex-1">Startzeit</span>
        <input
          type="datetime-local"
          value={startTime ?? ''}
          onChange={(e) => setStartTime(e.target.value || null)}
          className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
        />
      </div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] text-gray-400">
          {startTime ? `Gewählt: ${formatStart(startTime)}` : 'Ohne Angabe gilt: jetzt'}
        </span>
        {startTime && (
          <button
            onClick={() => setStartTime(null)}
            className="text-[10px] text-blue-600 hover:underline"
          >
            löschen
          </button>
        )}
      </div>
      <p className="mt-1 text-[10px] leading-tight text-gray-400">
        Beim Setzen einer Startzeit wird das Regenradar automatisch eingeblendet und zeigt die
        Wetterlage für diesen Zeitpunkt. Ohne Startzeit wird die aktuelle Zeit angenommen.
      </p>
    </div>
  );
}
