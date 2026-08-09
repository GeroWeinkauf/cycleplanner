import { useRef, useState, useCallback } from 'react';
import type { ElevationProfile as ElevationProfileData, ElevationPoint, RouteAnalysis } from '@cycleplanner/shared';

interface Props {
  data: ElevationProfileData | undefined;
  surfaceData?: RouteAnalysis | undefined;
  isLoading: boolean;
  onHover?: (point: ElevationPoint | null) => void;
  onClick?: (point: ElevationPoint) => void;
  onReset?: () => void;
  highlightDistance?: number | null;
}

type ViewMode = 'elevation' | 'surface';

// Layout constants
const PADDING = { top: 10, right: 10, bottom: 25, left: 50 };
const MIN_HEIGHT = 200;

/** Clamp a value between min and max */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export default function ElevationProfile({
  data, surfaceData, isLoading, onHover, onClick, onReset, highlightDistance,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('elevation');

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!data || !data.points.length || !svgRef.current) return;

      const rect = svgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - PADDING.left;
      const innerW = rect.width - PADDING.left - PADDING.right;
      if (innerW <= 0) return;

      const fraction = clamp(x / innerW, 0, 1);
      const idx = Math.round(fraction * (data.points.length - 1));
      const point = data.points[idx];

      setHoverX(x);
      onHover?.(point);
    },
    [data, onHover],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverX(null);
    onHover?.(null);
  }, [onHover]);

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!data || !data.points.length || !svgRef.current) return;

      const rect = svgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - PADDING.left;
      const innerW = rect.width - PADDING.left - PADDING.right;
      if (innerW <= 0) return;

      const fraction = clamp(x / innerW, 0, 1);
      const idx = Math.round(fraction * (data.points.length - 1));
      onClick?.(data.points[idx]);
    },
    [data, onClick],
  );

  // ── Empty / loading states ─────────────────
  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center bg-gray-50 text-sm text-gray-400">
        Berechne Hoehenprofil...
      </div>
    );
  }

  if (!data || !data.points.length) {
    return (
      <div className="flex h-12 items-center justify-center bg-gray-50 text-xs text-gray-400">
        Kein Hoehenprofil verfuegbar
      </div>
    );
  }

  // ── Compute scales ─────────────────────────
  const { points, metrics } = data;
  const innerW = 800; // SVG viewBox width
  const innerH = MIN_HEIGHT - PADDING.top - PADDING.bottom;

  const distMin = points[0].distanceKm;
  const distMax = points[points.length - 1].distanceKm;
  const distRange = distMax - distMin || 1;

  const elevValues = points.map((p) => p.elevation);
  const elevMin = Math.min(...elevValues);
  const elevMax = Math.max(...elevValues);
  const elevRange = elevMax - elevMin || 1;
  // Add 10% padding to elevation range
  const elevPad = elevRange * 0.1;
  const elevViewMin = elevMin - elevPad;
  const elevViewMax = elevMax + elevPad;
  const elevViewRange = elevViewMax - elevViewMin;

  // ── Build path ─────────────────────────────
  const pathD = points
    .map((p, i) => {
      const x = PADDING.left + ((p.distanceKm - distMin) / distRange) * innerW;
      const y = PADDING.top + ((elevViewMax - p.elevation) / elevViewRange) * innerH;
      return (i === 0 ? 'M' : 'L') + ' ' + x.toFixed(1) + ' ' + y.toFixed(1);
    })
    .join(' ');

  // ── Y-axis labels ──────────────────────────
  const yTicks = 4;
  const yLabels: Array<{ y: number; label: string }> = [];
  for (let i = 0; i <= yTicks; i++) {
    const elev = elevViewMin + (elevViewMax - elevViewMin) * (i / yTicks);
    const y = PADDING.top + ((elevViewMax - elev) / elevViewRange) * innerH;
    yLabels.push({ y, label: Math.round(elev) + ' m' });
  }

  // ── X-axis labels ──────────────────────────
  const xTicks = 5;
  const xLabels: Array<{ x: number; label: string }> = [];
  for (let i = 0; i <= xTicks; i++) {
    const dist = distMin + distRange * (i / xTicks);
    const x = PADDING.left + ((dist - distMin) / distRange) * innerW;
    xLabels.push({
      x,
      label: dist >= 1 ? dist.toFixed(1) + ' km' : (dist * 1000).toFixed(0) + ' m',
    });
  }

  // ── Area fill path ─────────────────────────
  const firstX = PADDING.left + ((points[0].distanceKm - distMin) / distRange) * innerW;
  const lastX = PADDING.left + ((points[points.length - 1].distanceKm - distMin) / distRange) * innerW;
  const baseY = PADDING.top + innerH;
  const areaD = pathD + ' L ' + lastX.toFixed(1) + ' ' + baseY.toFixed(1) +
    ' L ' + firstX.toFixed(1) + ' ' + baseY.toFixed(1) + ' Z';

  // ── Highlight cursor line ──────────────────
  const showHover = hoverX !== null;
  const showExtHighlight = highlightDistance !== null && highlightDistance !== undefined && points.length > 0;
  let extHighlightX: number | null = null;
  if (showExtHighlight) {
    const frac = clamp((highlightDistance! - distMin) / distRange, 0, 1);
    extHighlightX = PADDING.left + frac * innerW;
  }

  return (
    <div className="flex flex-col border-t border-gray-200 bg-white">
      {/* Metrics summary bar */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-xs text-gray-600">
        <span>
          <span className="font-semibold text-gray-800">{metrics.totalAscent} m</span> Anstieg
        </span>
        <span>
          <span className="font-semibold text-gray-800">{metrics.totalDescent} m</span> Abstieg
        </span>
        <span>
          <span className="font-semibold text-gray-800">{metrics.minElevation}&ndash;{metrics.maxElevation} m</span> Hoehe
        </span>
        <span>
          <span className="font-semibold text-gray-800">{metrics.maxSlope}%</span> max. Steigung
          {highlightDistance != null && onReset && (
            <button onClick={onReset} className="ml-1 text-[10px] text-gray-400 hover:text-gray-600" title="Markierung aufheben">✕</button>
          )}
        </span>
      </div>

      {/* View mode toggle: elevation / surface */}
      {surfaceData && (
        <div className="flex gap-1 px-3 pb-1">
          <button onClick={() => setViewMode('elevation')}
            className={'rounded px-2 py-0.5 text-[10px] ' + (viewMode === 'elevation' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')}>
            Hoehe
          </button>
          <button onClick={() => setViewMode('surface')}
            className={'rounded px-2 py-0.5 text-[10px] ' + (viewMode === 'surface' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')}>
            Oberflaeche
          </button>
        </div>
      )}

      {/* Surface distribution bar */}
      {viewMode === 'surface' && surfaceData && (
        <div className="px-3 pb-2">
          <div className="flex h-4 w-full overflow-hidden rounded-full bg-gray-200">
            {Object.entries({
              asphalt: ['#4ade80', surfaceData.surfaceDistribution.asphalt],
              gravel: ['#f59e0b', surfaceData.surfaceDistribution.gravel],
              dirt: ['#d97706', surfaceData.surfaceDistribution.dirt],
              paved: ['#22c55e', surfaceData.surfaceDistribution.paved],
              unknown: ['#9ca3af', surfaceData.surfaceDistribution.unknown],
            }).map(([key, [color, pct]]) => (
              (pct as number) > 0 && (
                <div key={key} style={{ width: pct + '%', backgroundColor: color }}
                  className="h-full first:rounded-l-full last:rounded-r-full" title={key + ': ' + pct + '%'} />
              )
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-gray-500">
            <span><span className="inline-block h-2 w-2 rounded-full bg-green-400 align-middle mr-0.5" /> Asphalt {surfaceData.surfaceDistribution.asphalt}%</span>
            <span><span className="inline-block h-2 w-2 rounded-full bg-amber-500 align-middle mr-0.5" /> Schotter {surfaceData.surfaceDistribution.gravel}%</span>
            <span><span className="inline-block h-2 w-2 rounded-full bg-orange-600 align-middle mr-0.5" /> Natur {surfaceData.surfaceDistribution.dirt}%</span>
          </div>
        </div>
      )}

      {/* SVG diagram (only in elevation mode) */}
      <svg
        ref={svgRef}
        viewBox={'0 0 ' + (PADDING.left + innerW + PADDING.right) + ' ' + (PADDING.top + innerH + PADDING.bottom)}
        preserveAspectRatio="none"
        className="h-48 w-full cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        role="img"
        aria-label="Hoehenprofil"
      >
        {/* Area fill */}
        <path d={areaD} fill={viewMode === "elevation" ? "rgba(37, 99, 235, 0.12)" : "rgba(22, 163, 74, 0.08)"} stroke="none" />

        {/* Elevation line */}
        <path d={pathD} fill="none" stroke={viewMode === "elevation" ? "#2563eb" : "#16a34a"} strokeWidth="1.5" strokeLinejoin="round" />

        {/* Grid lines */}
        {yLabels.map((tick, i) => (
          <line
            key={'ygrid-' + i}
            x1={PADDING.left}
            y1={tick.y}
            x2={PADDING.left + innerW}
            y2={tick.y}
            stroke="#e5e7eb"
            strokeWidth="0.5"
          />
        ))}

        {/* Y-axis labels */}
        {yLabels.map((tick, i) => (
          <text
            key={'ylabel-' + i}
            x={PADDING.left - 4}
            y={tick.y + 3}
            textAnchor="end"
            className="fill-gray-400"
            fontFamily="system-ui, sans-serif"
            fontSize="8"
            fontWeight="300"
          >
            {tick.label}
          </text>
        ))}

        {/* X-axis labels */}
        {xLabels.map((tick, i) => (
          <text
            key={'xlabel-' + i}
            x={tick.x}
            y={PADDING.top + innerH + 15}
            textAnchor="middle"
            className="fill-gray-400"
            fontSize="9"
          >
            {tick.label}
          </text>
        ))}

        {/* Hover cursor */}
        {showHover && (
          <line
            x1={hoverX! + PADDING.left}
            y1={PADDING.top}
            x2={hoverX! + PADDING.left}
            y2={PADDING.top + innerH}
            stroke="#f59e0b"
            strokeWidth="1"
            strokeDasharray="3,2"
          />
        )}

        {/* External highlight (from map hover) */}
        {showExtHighlight && extHighlightX !== null && (
          <line
            x1={extHighlightX}
            y1={PADDING.top}
            x2={extHighlightX}
            y2={PADDING.top + innerH}
            stroke="#ef4444"
            strokeWidth="1.5"
            strokeDasharray="4,3"
          />
        )}
      </svg>
      
    </div>
  );
}
