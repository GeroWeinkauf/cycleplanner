import { useState } from 'react';
import { useRideStore } from '../store/useRideStore';
import type { StartWindow } from '@cycleplanner/shared';

interface Props {
  /** Top departure windows from the optimizer (null = not computed) */
  windows?: StartWindow[] | null;
  windowsLoading?: boolean;
  onFindBestStart?: () => void;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWindowTime(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function levelDot(level: 0 | 1 | 2): string {
  return level === 0 ? '🟢' : level === 1 ? '🟡' : '🔴';
}

/**
 * Ride profile settings: average speed + optional start time.
 * The start time drives the weather overlay (RainViewer shows the
 * forecast for that moment; without a start time "now" is used).
 * The start-time optimizer suggests the best departure windows.
 */
export default function RideSettingsPanel({ windows, windowsLoading, onFindBestStart }: Props) {
  const avgSpeedKmh = useRideStore((s) => s.avgSpeedKmh);
  const startTime = useRideStore((s) => s.startTime);
  const setAvgSpeedKmh = useRideStore((s) => s.setAvgSpeedKmh);
  const setStartTime = useRideStore((s) => s.setStartTime);
  const [optimizerOpen, setOptimizerOpen] = useState(false);

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

      {/* Start time optimizer */}
      <div className="mt-1.5 border-t border-gray-100 pt-1.5">
        <button
          onClick={() => {
            setOptimizerOpen(!optimizerOpen);
            if (!optimizerOpen) onFindBestStart?.();
          }}
          className="w-full rounded bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-100"
          title="Wetter entlang der Strecke für die nächsten 48 h auswerten"
        >
          {optimizerOpen ? '▾ Beste Startzeit' : '▸ Beste Startzeit finden'}
        </button>

        {optimizerOpen && windowsLoading && (
          <div className="mt-1 px-1 text-[10px] text-gray-400">Analysiere Wetter der nächsten 48 h…</div>
        )}

        {optimizerOpen && !windowsLoading && windows && windows.length === 0 && (
          <div className="mt-1 px-1 text-[10px] text-gray-400">Keine Wetterdaten verfügbar.</div>
        )}

        {optimizerOpen && !windowsLoading && windows && windows.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {windows.map((w) => (
              <button
                key={w.startTimeIso}
                onClick={() => setStartTime(toLocalInput(w.startTimeIso))}
                className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[10px] text-gray-700 hover:bg-amber-50"
                title={`${w.weatherLabel} · Regenrisiko ${w.maxPrecipProbPct} % · ${w.avgTempC} °C · Gegenwind ${w.avgHeadwindKmh} km/h · Rückenwind ${w.avgTailwindKmh} km/h`}
              >
                <span>{levelDot(w.level)}</span>
                <span className="font-medium">{formatWindowTime(w.startTimeIso)}</span>
                <span className="text-gray-400">
                  Regen {w.maxPrecipProbPct} % · {w.avgTempC} °C
                </span>
                {w.avgTailwindKmh >= 1 && (
                  <span className="text-green-600">↗ Rücken {w.avgTailwindKmh}</span>
                )}
                {w.avgHeadwindKmh >= 2 && (
                  <span className="text-red-500">↖ Gegen {w.avgHeadwindKmh}</span>
                )}
              </button>
            ))}
            <div className="px-1 pt-0.5 text-[9px] text-gray-400">
              Klick übernimmt die Startzeit — das Regenradar zeigt dann die Lage zu diesem Zeitpunkt.
            </div>
          </div>
        )}
      </div>

      <p className="mt-1 text-[10px] leading-tight text-gray-400">
        Beim Setzen einer Startzeit wird das Regenradar automatisch eingeblendet und zeigt die
        Wetterlage für diesen Zeitpunkt. Ohne Startzeit wird die aktuelle Zeit angenommen.
      </p>
    </div>
  );
}
