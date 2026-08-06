import type { RouteResponse } from '@cycleplanner/shared';

interface Props {
  route?: RouteResponse | null;
  isFetching: boolean;
}

export default function RouteHeader({ route, isFetching }: Props) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10">
      {isFetching && (
        <div className="rounded-lg bg-white/90 px-4 py-2 text-sm text-blue-600 shadow-md backdrop-blur">
          Berechne Route&hellip;
        </div>
      )}
      {route && !isFetching && (
        <div className="rounded-lg bg-white/90 px-4 py-2 shadow-md backdrop-blur">
          <span className="text-sm font-semibold text-gray-900">
            {formatDist(route.summary.distanceKm)}
          </span>
          <span className="mx-2 text-gray-300">|</span>
          <span className="text-sm text-gray-700">
            {formatTime(route.summary.durationMin)}
          </span>
        </div>
      )}
    </div>
  );
}

function formatDist(km: number): string {
  if (km >= 1) return `${km.toFixed(1)} km`;
  return `${(km * 1000).toFixed(0)} m`;
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}
