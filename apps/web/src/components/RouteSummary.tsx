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
          <div className="text-sm font-bold text-blue-700" title="Valhalla Fahrzeit-Schaetzung basierend auf Profil-Geschwindigkeit">{displayTime}</div>
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
          <div className="text-[10px] font-medium text-gray-600 mb-1">Oberflaeche</div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-200 mb-1">
            {[
              { k: 'asphalt', c: '#4ade80', l: 'Asphalt', v: analysis.surfaceDistribution.asphalt },
              { k: 'gravel', c: '#f59e0b', l: 'Schotter', v: analysis.surfaceDistribution.gravel },
              { k: 'dirt', c: '#d97706', l: 'Naturweg', v: analysis.surfaceDistribution.dirt },
              { k: 'paved', c: '#22c55e', l: 'Pflaster', v: analysis.surfaceDistribution.paved },
            ].map(s => s.v > 0 && (
              <div key={s.k} style={{ width: s.v + '%', backgroundColor: s.c }}
                className="h-full first:rounded-l-full last:rounded-r-full" title={s.l + ': ' + s.v.toFixed(1) + '%'} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-2 text-[10px] text-gray-500 mb-2">
            <span><span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 mr-0.5" />Asphalt {analysis.surfaceDistribution.asphalt}%</span>
            <span><span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 mr-0.5" />Schotter {analysis.surfaceDistribution.gravel}%</span>
            <span><span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-600 mr-0.5" />Naturweg {analysis.surfaceDistribution.dirt}%</span>
            {analysis.surfaceDistribution.unknown > 0 && (
              <span><span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-400 mr-0.5" />Unbek. {analysis.surfaceDistribution.unknown}%</span>
            )}
          </div>

          <div className="text-[10px] font-medium text-gray-600 mb-1">Wegtypen</div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-200 mb-1">
            {(() => {
              const rd = analysis.roadClassDistribution;
              const items: Array<[string, string, number]> = [
                ['#eab308', 'Bundesstr.', rd.primary],
                ['#6b7280', 'Landstr.', rd.secondary],
                ['#9ca3af', 'Kreisstr.', rd.tertiary],
                ['#d1d5db', 'Wohnstr.', rd.residential],
                ['#a8a29e', 'Feldweg', rd.track],
                ['#22c55e', 'Radweg', rd.cycleway],
                ['#78716c', 'Pfad', rd.path],
                ['#d97706', 'Unkategorisiert', rd.other + rd.service + rd.footway],
                ['#ef4444', 'Schnellstr.', rd.trunk + rd.motorway],
              ];
              return items.filter(([, , v]) => v > 0).map(([c, l, v]) =>
                <div key={l} style={{ width: v + '%', backgroundColor: c }} className="h-full first:rounded-l-full last:rounded-r-full" title={l + ': ' + v + '%'} />
              );
            })()}
          </div>
          <div className="flex flex-wrap gap-x-2 text-[10px] text-gray-500">
            {(() => {
              const rd = analysis.roadClassDistribution;
              const items: Array<[string, string, number]> = [
                ['#eab308', 'Bundesstr.', rd.primary],
                ['#6b7280', 'Landstr.', rd.secondary],
                ['#9ca3af', 'Kreisstr.', rd.tertiary],
                ['#d1d5db', 'Wohnstr.', rd.residential],
                ['#a8a29e', 'Feldweg', rd.track],
                ['#22c55e', 'Radweg', rd.cycleway],
                ['#78716c', 'Pfad', rd.path],
                ['#d97706', 'Unkategorisiert', rd.other + rd.service + rd.footway],
              ];
              return items.filter(([, , v]) => v > 0).map(([c, l, v]) =>
                <span key={l} className="whitespace-nowrap"><span className="inline-block h-1.5 w-1.5 rounded-full mr-0.5" style={{ backgroundColor: c }} />{l} {v}%</span>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}
