import { useRef, useState, useCallback } from 'react';
import { useWaypointStore, type Waypoint } from '../store/useWaypointStore';

export default function WaypointList() {
  const { waypoints, removeWaypoint, reorderWaypoints, reverseWaypoints, clearWaypoints, blockedSegment, setBlockedSegment } =
    useWaypointStore();
  const dragItemRef = useRef<number | null>(null);
  const dragOverRef = useRef<number | null>(null);

  const [roundTrip, setRoundTripState] = useState(false);
  const roundTripRef = useRef(false);
  const lastAutoWpRef = useRef<string | null>(null);

  const isRoundTripPossible = waypoints.length >= 2;

  const setRoundTrip = useCallback((enabled: boolean) => {
    const store = useWaypointStore.getState();
    if (enabled && store.waypoints.length >= 1) {
      const first = store.waypoints[0];
      store.addWaypoint(first.lat, first.lng, 'break');
      // Track the auto-added waypoint so we can remove it later
      const added = store.waypoints[store.waypoints.length - 1];
      lastAutoWpRef.current = added.id;
    } else if (!enabled && lastAutoWpRef.current) {
      store.removeWaypoint(lastAutoWpRef.current);
      lastAutoWpRef.current = null;
    }
    setRoundTripState(enabled);
    roundTripRef.current = enabled;
  }, []);
  const blockedIndicator = blockedSegment ? (
    <div className="mx-3 mb-2 flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
      <span>Segment gesperrt</span>
      <button
        onClick={() => setBlockedSegment(null)}
        className="ml-1 text-amber-500 hover:text-amber-700"
        title="Sperrung aufheben"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  ) : null;

  if (waypoints.length === 0) {
    return (
      <div>
        {blockedIndicator}
        <div className="p-3 text-xs text-gray-400">
          Klick auf die Karte, um Wegpunkte zu setzen.
        </div>
      </div>
    );
  }

  const handleDragStart = (index: number) => {
    dragItemRef.current = index;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    dragOverRef.current = index;
  };

  const handleDrop = (index: number) => {
    const from = dragItemRef.current;
    if (from !== null && from !== index) {
      reorderWaypoints(from, index);
    }
    dragItemRef.current = null;
    dragOverRef.current = null;
  };

  const handleDragEnd = () => {
    dragItemRef.current = null;
    dragOverRef.current = null;
  };

  return (
    <div className="select-none">
      {blockedIndicator}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Wegpunkte ({waypoints.length})
        </span>
        {/* Round trip toggle */}
        {isRoundTripPossible && (
          <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer" title="Start = Ziel">
            <input type="checkbox" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)}
              className="h-3 w-3 accent-blue-600" />
            Rundtour
          </label>
        )}
        {/* Action buttons */}
        <div className="flex gap-0.5">
          {/* Reverse */}
          <button
            onClick={reverseWaypoints}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Strecke umkehren"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </button>
          {/* Clear all */}
          <button
            onClick={clearWaypoints}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500"
            title="Alle Wegpunkte loeschen"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
      <ul className="divide-y divide-gray-100">
        {waypoints.map((wp, i) => (
          <WaypointRow
            key={wp.id}
            wp={wp}
            index={i}
            total={waypoints.length}
            onRemove={removeWaypoint}
            onDragStart={() => handleDragStart(i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={() => handleDrop(i)}
            onDragEnd={handleDragEnd}
          />
        ))}
      </ul>
    </div>
  );
}

function WaypointRow({
  wp,
  index,
  total,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  wp: Waypoint;
  index: number;
  total: number;
  onRemove: (id: string) => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const isFirst = index === 0;
  const isLast = total > 1 && index === total - 1;
  const typeLabel = isFirst ? 'Start' : isLast ? 'Ende' : wp.type === 'break' ? 'Halt' : 'Durchfahrt';

  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className="flex cursor-grab items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 active:cursor-grabbing"
    >
      {/* Drag handle + index */}
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
        {index + 1}
      </span>

      {/* Coord info */}
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">
          {wp.lat.toFixed(4)}, {wp.lng.toFixed(4)}
        </span>
        <span className="ml-1.5 text-xs text-gray-400">{typeLabel}</span>
      </span>

      {/* Delete button */}
      <button
        onClick={() => onRemove(wp.id)}
        className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
        aria-label={`Wegpunkt ${index + 1} löschen`}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </li>
  );
}
