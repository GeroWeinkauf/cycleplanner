import type { RouteResponse, ElevationProfile, RouteAnalysis } from '@cycleplanner/shared';

interface Props {
  route?: RouteResponse | null;
  elevation?: ElevationProfile;
  analysis?: RouteAnalysis;
}

export default function RouteSummary({ route, elevation, analysis }: Props) {
  if (!route) {
    return (
      <div className="px-3 py-2 text-xs text-gray-400">
        Setze mindestens 2 Wegpunkte für eine Route.
      </div>
    );
  }

  const dist = route.summary.distanceKm;
  const dur = route.summary.durationMin;
  const h = dist >= 10 ? dist.toFixed(1) : dist.toFixed(2);
  const min = Math.floor(dur);
  const displayTime = min >= 60
    ? Math.floor(min / 60) + ' h ' + (min % 60) + ' min'
    : min + ' min';

  return (
    <div className="border-t border-gray-200 px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
        Routeninfo
      </div>

      {/* Distance + Time */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="rounded bg-blue-50 px-2 py-1.5">
          <div className="text-[10px] text-gray-500">Distanz</div>
          <div className="text-sm font-bold text-blue-700">{h} km</div>
        </div>
        <div className="rounded bg-blue-50 px-2 py-1.5">
          <div className="text-[10px] text-gray-500">Dauer</div>
          <div className="text-sm font-bold text-blue-700">{displayTime}</div>
        </div>
      </div>

      {/* Elevation */}
      {elevation?.metrics && (
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="rounded bg-amber-50 px-2 py-1.5">
            <div className="text-[10px] text-gray-500">Anstieg</div>
            <div className="text-sm font-bold text-amber-700">+{elevation.metrics.totalAscent} m</div>
          </div>
          <div className="rounded bg-amber-50 px-2 py-1.5">
            <div className="text-[10px] text-gray-500">Abstieg</div>
            <div className="text-sm font-bold text-amber-700">-{elevation.metrics.totalDescent} m</div>
          </div>
        </div>
      )}

      {/* Surface */}
      {analysis && (
        <>
          <div className="text-[10px] font-medium text-gray-600 mb-1">Oberfläche</div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-200 mb-1">
            {[
              { k: 'asphalt', c: '#4ade80', l: 'Asphalt', v: analysis.surfaceDistribution.asphalt },
              { k: 'gravel', c: '#f59e0b', l: 'Schotter', v: analysis.surfaceDistribution.gravel },
              { k: 'dirt', c: '#d97706', l: 'Natur', v: analysis.surfaceDistribution.dirt },
              { k: 'paved', c: '#22c55e', l: 'Pflaster', v: analysis.surfaceDistribution.paved },
            ].map(s => s.v > 0 && (
              <div key={s.k} style={{ width: s.v + '%', backgroundColor: s.c }}
                className="h-full first:rounded-l-full last:rounded-r-full" title={s.l + ': ' + s.v + '%'} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-2 text-[10px] text-gray-500 mb-2">
            <span><span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 mr-0.5" />A {analysis.surfaceDistribution.asphalt}%</span>
            <span><span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 mr-0.5" />S {analysis.surfaceDistribution.gravel}%</span>
            <span><span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-600 mr-0.5" />N {analysis.surfaceDistribution.dirt}%</span>
          </div>

          <div className="text-[10px] font-medium text-gray-600 mb-1">Wegtypen</div>
          <div className="flex flex-wrap gap-x-2 text-[10px] text-gray-500">
            {[
              { k: 'cycleway', v: analysis.roadClassDistribution.cycleway },
              { k: 'path', v: analysis.roadClassDistribution.path },
              { k: 'residential', v: analysis.roadClassDistribution.residential },
              { k: 'secondary', v: analysis.roadClassDistribution.secondary },
              { k: 'primary', v: analysis.roadClassDistribution.primary },
              { k: 'track', v: analysis.roadClassDistribution.track },
            ].map(r => r.v > 0 && (
              <span key={r.k}>{r.k} {r.v}%</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
