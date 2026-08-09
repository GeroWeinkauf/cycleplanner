import { useState, useCallback } from 'react';
import { useRoundTripQuery } from '../hooks/useRoundTripQuery';
import { useWaypointStore } from '../store/useWaypointStore';
import type { RouteResponse, RoundTripVariant } from '@cycleplanner/shared';

const DISTANCE_PRESETS = [30, 50, 80, 120];

export default function RoundTripControls() {
  const [targetKm, setTargetKm] = useState<number>(50);
  const [customInput, setCustomInput] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const { waypoints, addWaypoint, clearWaypoints } = useWaypointStore();

  // Use first waypoint as round trip origin
  const origin = waypoints.length > 0 ? { lat: waypoints[0].lat, lng: waypoints[0].lng } : null;

  // Only query if panel is open and we have an origin
  const queryParams =
    isOpen && origin
      ? { lat: origin.lat, lng: origin.lng, targetDistanceKm: targetKm }
      : null;

  const { data, isLoading, isError, error } = useRoundTripQuery(queryParams);

  const handleSelectVariant = useCallback(
    (variant: RoundTripVariant) => {
      // Clear existing waypoints and replace with round trip result
      // For now, we just trigger a route display
      // In a full implementation, the variant geometry would become the active route
      // and waypoints would be derived from the round trip
      clearWaypoints();
      // Set the start point as a waypoint
      if (origin) {
        addWaypoint(origin.lat, origin.lng, 'break');
        // Add a second waypoint to make it a valid route
        addWaypoint(origin.lat + 0.01, origin.lng + 0.01, 'break');
      }
    },
    [clearWaypoints, addWaypoint, origin],
  );

  const handlePresetClick = useCallback((km: number) => {
    setTargetKm(km);
    setCustomInput('');
    setIsOpen(true);
  }, []);

  const handleCustomSubmit = useCallback(() => {
    const val = parseFloat(customInput);
    if (val >= 5 && val <= 500) {
      setTargetKm(val);
      setIsOpen(true);
    }
  }, [customInput]);

  return (
    <div className="border-t border-gray-100">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Rundtour
      </div>

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-1 px-3 pb-2">
        {DISTANCE_PRESETS.map((km) => (
          <button
            key={km}
            onClick={() => handlePresetClick(km)}
            className={
              'rounded px-2 py-0.5 text-xs ' +
              (targetKm === km && isOpen
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
            }
          >
            {km} km
          </button>
        ))}
      </div>

      {/* Custom distance input */}
      <div className="flex gap-1 px-3 pb-2">
        <input
          type="number"
          min={5}
          max={500}
          placeholder="km"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
          className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-xs focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={handleCustomSubmit}
          className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-700"
        >
          Los
        </button>
      </div>

      {/* Variant results */}
      {isOpen && (
        <div className="border-t border-gray-100 px-3 pb-2">
          {isLoading && (
            <div className="py-2 text-center text-xs text-gray-400">
              Berechne Rundtouren...
            </div>
          )}
          {isError && (
            <div className="py-2 text-center text-xs text-red-500">
              {(error as Error)?.message || 'Fehler bei Rundtour-Berechnung'}
            </div>
          )}
          {data && data.variants.length > 0 && (
            <div>
              <div className="py-1 text-xs text-gray-500">
                {data.variants.length} Varianten gefunden:
              </div>
              <div className="flex flex-col gap-1">
                {data.variants.map((v, i) => (
                  <button
                    key={v.id}
                    onClick={() => handleSelectVariant(v)}
                    className={
                      'flex items-center justify-between rounded px-2 py-1.5 text-left text-xs ' +
                      (i === 0
                        ? 'bg-blue-50 text-blue-800 hover:bg-blue-100'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100')
                    }
                  >
                    <span>
                      {v.summary.distanceKm.toFixed(1)} km
                      {v.deviationKm > 0 && (
                        <span className="ml-1 text-gray-400">
                          (+{v.deviationKm.toFixed(1)})
                        </span>
                      )}
                    </span>
                    <span className="text-gray-400">
                      {v.summary.durationMin.toFixed(0)} min
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {data && data.variants.length === 0 && (
            <div className="py-2 text-center text-xs text-gray-400">
              Keine passende Rundtour gefunden.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
