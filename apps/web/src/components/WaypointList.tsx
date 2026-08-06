import { useRef } from 'react';
import { useWaypointStore, type Waypoint } from '../store/useWaypointStore';

export default function WaypointList() {
  const { waypoints, removeWaypoint, reorderWaypoints } = useWaypointStore();
  const dragItemRef = useRef<number | null>(null);
  const dragOverRef = useRef<number | null>(null);

  if (waypoints.length === 0) {
    return (
      <div className="p-3 text-xs text-gray-400">
        Klick auf die Karte, um Wegpunkte zu setzen.
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
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Wegpunkte ({waypoints.length})
      </div>
      <ul className="divide-y divide-gray-100">
        {waypoints.map((wp, i) => (
          <WaypointRow
            key={wp.id}
            wp={wp}
            index={i}
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
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  wp: Waypoint;
  index: number;
  onRemove: (id: string) => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const typeLabel = wp.type === 'break' ? 'Halt' : 'Durchfahrt';

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
