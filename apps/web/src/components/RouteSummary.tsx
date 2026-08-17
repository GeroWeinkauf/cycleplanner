import type { RouteResponse, ElevationProfile, RouteAnalysis } from '@cycleplanner/shared';
import { useRideStore } from '../store/useRideStore';
import { computeSafety } from '../lib/safety';

interface Props {
  route?: RouteResponse | null;
  elevation?: ElevationProfile;
  analysis?: RouteAnalysis;
  /** Wind along the route (from the weather report or wind-optimized route) */
  wind?: { avgHeadwindKmh: number; avgTailwindKmh: number } | null;
  /** True when the displayed route is wind-optimized */
  windOptimized?: boolean;
}

export default function RouteSummary({ route, elevation, analysis, wind, windOptimized }: Props) {
  const avgSpeedKmh = useRideStore((s) => s.avgSpeedKmh);

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

  // Estimated riding time at the configured average speed
  const estMin = (dist / avgSpeedKmh) * 60;
  const estHours = Math.floor(estMin / 60);
  const estRest = Math.round(estMin % 60);
  const estTime = estHours > 0 ? `${estHours} h ${estRest} min` : `${estRest} min`;

  // Safety score
  const safety = analysis ? computeSafety(analysis) : null;
  const safetyColor = safety
    ? safety.level === 'good' ? 'text-green-600' : safety.level === 'moderate' ? 'text-amber-600' : 'text-red-600'
    : '';

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

      {/* Estimated time at configured average speed */}
      <div className="mb-2 rounded bg-indigo-50 px-2 py-1.5 text-[11px] text-indigo-700">
        Fahrzeit bei Ø {avgSpeedKmh} km/h: <span className="font-semibold">{estTime}</span>
      </div>

      {/* Wind */}
      {wind && (wind.avgHeadwindKmh > 0 || wind.avgTailwindKmh > 0) && (
        <div className="mb-2 flex items-center gap-2 rounded bg-sky-50 px-2 py-1.5 text-[11px] text-sky-800">
          {windOptimized && <span title="Wind-optimierte Route">🌬</span>}
          {wind.avgTailwindKmh >= 1 && (
            <span className="text-green-600">↗ Rückenwind Ø {wind.avgTailwindKmh} km/h</span>
          )}
          {wind.avgHeadwindKmh >= 1 && (
            <span className="text-red-500">↖ Gegenwind Ø {wind.avgHeadwindKmh} km/h</span>
          )}
        </div>
      )}

      {/* Safety score */}
      {safety && (
        <div className="mb-2 rounded bg-gray-50 px-2 py-1.5 border border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-gray-600">Sicherheit</span>
            <span className={'text-sm font-bold ' + safetyColor}>
              {safety.score}<span className="text-[10px] text-gray-400">/100</span>
            </span>
          </div>
          <div className="mt-1 flex h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div className="h-full bg-green-500" style={{ width: safety.carFreePct + '%' }} title={safety.carFreePct + ' % autofrei'} />
            <div className="h-full bg-red-400" style={{ width: safety.busyRoadPct + '%' }} title={safety.busyRoadPct + ' % stark befahren'} />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 text-[9px] text-gray-500">
            <span><span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 mr-0.5" />autofrei {safety.carFreePct}%</span>
            <span><span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400 mr-0.5" />stark befahren {safety.busyRoadPct}%</span>
            {safety.bikeNetworkPct > 0 && (
              <span>Radrouten {safety.bikeNetworkPct}%</span>
            )}
          </div>
          {safety.tips.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-[9px] leading-tight text-gray-500">
              {safety.tips.slice(0, 2).map((tip, i) => <li key={i}>• {tip}</li>)}
            </ul>
          )}
        </div>
      )}

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
