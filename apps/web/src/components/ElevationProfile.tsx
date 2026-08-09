import { useRef, useState, useCallback } from 'react';
import type { ElevationProfile as ElevationProfileData, ElevationPoint, RouteAnalysis } from '@cycleplanner/shared';

interface Props {
  data: ElevationProfileData | undefined;
  surfaceData?: RouteAnalysis | undefined;
  isLoading: boolean;
  onHover?: (point: ElevationPoint | null) => void;
  onClick?: (point: ElevationPoint) => void;
  onReset?: () => void;
  onZoomToSegment?: (fromKm: number, toKm: number) => void;
  highlightDistance?: number | null;
}

type ViewMode = 'elevation' | 'surface';

const PADDING = { top: 8, right: 8, bottom: 22, left: 40 };
const MIN_HEIGHT = 200;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Slope to color: green (flat) → yellow → orange → red (steep) */
function slopeColor(slopePercent: number): string {
  const s = Math.min(Math.abs(slopePercent), 20);
  if (s < 2) return '#22c55e';    // green
  if (s < 5) return '#84cc16';    // lime
  if (s < 8) return '#eab308';    // yellow
  if (s < 12) return '#f97316';    // orange
  return '#ef4444';               // red
}

export default function ElevationProfile({
  data, surfaceData, isLoading, onHover, onClick, onReset, onZoomToSegment, highlightDistance,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('elevation');
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [zoomed, setZoomed] = useState(false);

  const getSvgPos = useCallback((clientX: number) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const x = clientX - rect.left - PADDING.left;
    const innerW = rect.width - PADDING.left - PADDING.right;
    if (innerW <= 0) return null;
    return { x: clamp(x, 0, innerW), innerW };
  }, []);

  const getPointAt = useCallback((x: number, innerW: number) => {
    if (!data || !data.points.length) return null;
    const fraction = clamp(x / innerW, 0, 1);
    const idx = Math.round(fraction * (data.points.length - 1));
    return data.points[idx];
  }, [data]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const pos = getSvgPos(e.clientX);
    if (!pos) return;
    setDragStart(pos.x);
    setDragEnd(pos.x);
    setZoomed(false);
  }, [getSvgPos]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const pos = getSvgPos(e.clientX);
    if (!pos || !data) return;
    setHoverX(pos.x);
    const pt = getPointAt(pos.x, pos.innerW);
    onHover?.(pt);
    if (dragStart !== null) {
      setDragEnd(pos.x);
    }
  }, [getSvgPos, data, onHover, dragStart, getPointAt]);

  const handleMouseUp = useCallback(() => {
    if (dragStart !== null && dragEnd !== null && Math.abs(dragEnd - dragStart) > 10) {
      // Drag completed — zoom to segment
      setZoomed(true);
      if (onZoomToSegment && data) {
        const innerW = 800;
        const distMin = data.points[0].distanceKm;
        const distRange = data.points[data.points.length - 1].distanceKm - distMin || 1;
        const fromFrac = clamp(Math.min(dragStart, dragEnd) / innerW, 0, 1);
        const toFrac = clamp(Math.max(dragStart, dragEnd) / innerW, 0, 1);
        onZoomToSegment(
          distMin + fromFrac * distRange,
          distMin + toFrac * distRange,
        );
      }
    }
    setDragStart(null);
    setDragEnd(null);
  }, [dragStart, dragEnd, onZoomToSegment, data]);

  const handleMouseLeave = useCallback(() => {
    setHoverX(null);
    onHover?.(null);
    setDragStart(null);
    setDragEnd(null);
  }, [onHover]);

  const handleResetZoom = useCallback(() => {
    setZoomed(false);
    setDragStart(null);
    setDragEnd(null);
    onReset?.();
  }, [onReset]);

  // ── Empty / loading states ─────────────────
  if (isLoading) {
    return <div className="flex h-12 items-center justify-center bg-gray-50 text-xs text-gray-400">Berechne Hoehenprofil...</div>;
  }
  if (!data || !data.points.length) {
    return <div className="flex h-10 items-center justify-center bg-gray-50 text-[11px] text-gray-400">Kein Hoehenprofil</div>;
  }

  // ── Compute scales ─────────────────────────
  let { points, metrics } = data;

  // Filter to zoomed segment
  if (zoomed && dragStart !== null && dragEnd !== null) {
    const innerW = 800;
    const distMin = points[0].distanceKm;
    const distRange = points[points.length - 1].distanceKm - distMin || 1;
    const fromDist = distMin + clamp(Math.min(dragStart, dragEnd) / innerW, 0, 1) * distRange;
    const toDist = distMin + clamp(Math.max(dragStart, dragEnd) / innerW, 0, 1) * distRange;
    points = points.filter(p => p.distanceKm >= fromDist - 0.001 && p.distanceKm <= toDist + 0.001);
    if (points.length < 2) points = data.points;
  }

  const innerW = 800;
  const innerH = MIN_HEIGHT - PADDING.top - PADDING.bottom;
  const distMin = points[0].distanceKm;
  const distMax = points[points.length - 1].distanceKm;
  const distRange = distMax - distMin || 1;
  const elevValues = points.map(p => p.elevation);
  const elevMin = Math.min(...elevValues);
  const elevMax = Math.max(...elevValues);
  const elevPad = Math.max((elevMax - elevMin || 1) * 0.1, 5);
  const elevViewMin = elevMin - elevPad;
  const elevViewMax = elevMax + elevPad;
  const elevViewRange = elevViewMax - elevViewMin;

  // Scale helpers
  const toX = (km: number) => PADDING.left + ((km - distMin) / distRange) * innerW;
  const toY = (elev: number) => PADDING.top + ((elevViewMax - elev) / elevViewRange) * innerH;

  // Slope-colored segments
  const segments: Array<{ x1: number; y1: number; x2: number; y2: number; color: string }> = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const dist = curr.distanceKm - prev.distanceKm;
    const slope = dist > 0 ? ((curr.elevation - prev.elevation) / (dist * 1000)) * 100 : 0;
    segments.push({
      x1: toX(prev.distanceKm), y1: toY(prev.elevation),
      x2: toX(curr.distanceKm), y2: toY(curr.elevation),
      color: slopeColor(slope),
    });
  }

  // Area fill
  const areaD = points.map((p, i) => {
    const cmd = i === 0 ? 'M' : 'L';
    return cmd + ' ' + toX(p.distanceKm).toFixed(1) + ' ' + toY(p.elevation).toFixed(1);
  }).join(' ') + ' L ' + toX(distMax).toFixed(1) + ' ' + (PADDING.top + innerH).toFixed(1) +
    ' L ' + toX(distMin).toFixed(1) + ' ' + (PADDING.top + innerH).toFixed(1) + ' Z';

  // Y-axis ticks
  const yTicks = 4;
  const yLabels: Array<{ y: number; label: string }> = [];
  for (let i = 0; i <= yTicks; i++) {
    const elev = elevViewMin + elevViewRange * (i / yTicks);
    yLabels.push({ y: toY(elev), label: Math.round(elev) + '' });
  }

  // X-axis ticks
  const xTicks = Math.min(5, Math.max(2, Math.floor(distRange * 2)));
  const xLabels: Array<{ x: number; label: string }> = [];
  const xStep = distRange / xTicks;
  for (let i = 0; i <= xTicks; i++) {
    const dist = distMin + xStep * i;
    xLabels.push({
      x: toX(dist),
      label: distRange < 0.5 ? (dist * 1000).toFixed(0) + ' m' : dist.toFixed(1) + ' km',
    });
  }

  // Hover/ext highlight
  const showHover = hoverX !== null && dragStart === null;
  const extHighlightX = highlightDistance != null
    ? PADDING.left + clamp((highlightDistance - distMin) / distRange, 0, 1) * innerW
    : null;

  // Drag selection highlight
  const selLeft = dragStart !== null && dragEnd !== null ? Math.min(dragStart, dragEnd) + PADDING.left : null;
  const selRight = dragStart !== null && dragEnd !== null ? Math.max(dragStart, dragEnd) + PADDING.left : null;

  return (
    <div className="flex flex-col border-t border-gray-200 bg-white select-none">
      {/* Metrics bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1.5 text-[11px] text-gray-600">
        <span><span className="font-semibold text-gray-800">{metrics.totalAscent} m</span> ↑</span>
        <span><span className="font-semibold text-gray-800">{metrics.totalDescent} m</span> ↓</span>
        <span><span className="font-semibold text-gray-800">{metrics.minElevation}–{metrics.maxElevation} m</span></span>
        <span><span className="font-semibold text-gray-800">{metrics.maxSlope}%</span> max</span>
        {zoomed && (
          <button onClick={handleResetZoom} className="ml-auto rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600 hover:bg-gray-200">
            ✕ Zurueck
          </button>
        )}
        {!zoomed && highlightDistance != null && onReset && (
          <button onClick={handleResetZoom} className="ml-auto text-[10px] text-gray-400 hover:text-gray-600">✕</button>
        )}
      </div>

      {/* View toggle */}
      {surfaceData && (
        <div className="flex gap-1 px-3 pb-1">
          <button onClick={() => setViewMode('elevation')}
            className={'rounded px-2 py-0.5 text-[10px] ' + (viewMode === 'elevation' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')}>Hoehe</button>
          <button onClick={() => setViewMode('surface')}
            className={'rounded px-2 py-0.5 text-[10px] ' + (viewMode === 'surface' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')}>Oberflaeche</button>
        </div>
      )}

      {/* Surface bar */}
      {viewMode === 'surface' && surfaceData && (
        <div className="px-3 pb-2">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-200">
            {[
              ['#4ade80', surfaceData.surfaceDistribution.asphalt],
              ['#f59e0b', surfaceData.surfaceDistribution.gravel],
              ['#d97706', surfaceData.surfaceDistribution.dirt],
              ['#22c55e', surfaceData.surfaceDistribution.paved],
            ].filter(([, v]) => (v as number) > 0).map(([c, v]) => (
              <div key={c} style={{ width: v + '%', backgroundColor: c }} className="h-full first:rounded-l-full last:rounded-r-full" />
            )))}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-gray-500">
            <span><span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 mr-0.5" />Asphalt {surfaceData.surfaceDistribution.asphalt}%</span>
            <span><span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 mr-0.5" />Schotter {surfaceData.surfaceDistribution.gravel}%</span>
            <span><span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-600 mr-0.5" />Natur {surfaceData.surfaceDistribution.dirt}%</span>
          </div>
        </div>
      )}

      {/* SVG */}
      <svg ref={svgRef}
        viewBox={'0 0 ' + (PADDING.left + innerW + PADDING.right) + ' ' + (PADDING.top + innerH + PADDING.bottom)}
        preserveAspectRatio="none"
        className="h-48 w-full"
        style={{ cursor: dragStart !== null ? 'col-resize' : 'crosshair' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        role="img" aria-label="Hoehenprofil"
      >
        {/* Area fill */}
        <path d={areaD} fill="rgba(37, 99, 235, 0.08)" stroke="none" />

        {/* Slope-colored segments */}
        {segments.map((seg, i) => (
          <line key={i} x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
            stroke={seg.color} strokeWidth="1.5" strokeLinecap="round" />
        ))}

        {/* Grid lines */}
        {yLabels.map((t, i) => (
          <line key={'yg-' + i} x1={PADDING.left} y1={t.y} x2={PADDING.left + innerW} y2={t.y} stroke="#f3f4f6" strokeWidth="0.5" />
        ))}

        {/* Y-axis labels */}
        {yLabels.map((t, i) => (
          <text key={'yl-' + i} x={PADDING.left - 5} y={t.y + 3} textAnchor="end"
            fill="#9ca3af" fontFamily="system-ui" fontSize="9" fontWeight="400">{t.label}</text>
        ))}

        {/* X-axis labels */}
        {xLabels.map((t, i) => (
          <text key={'xl-' + i} x={t.x} y={PADDING.top + innerH + 14} textAnchor="middle"
            fill="#9ca3af" fontFamily="system-ui" fontSize="9" fontWeight="400">{t.label}</text>
        ))}

        {/* Drag selection */}
        {selLeft !== null && selRight !== null && (
          <rect x={selLeft} y={PADDING.top} width={selRight - selLeft} height={innerH}
            fill="rgba(99, 102, 241, 0.12)" stroke="rgba(99, 102, 241, 0.4)" strokeWidth="1" strokeDasharray="4,2" />
        )}

        {/* Hover cursor */}
        {showHover && (
          <line x1={hoverX! + PADDING.left} y1={PADDING.top} x2={hoverX! + PADDING.left} y2={PADDING.top + innerH}
            stroke="#f59e0b" strokeWidth="1" strokeDasharray="3,2" />
        )}

        {/* Map highlight */}
        {extHighlightX !== null && dragStart === null && (
          <line x1={extHighlightX} y1={PADDING.top} x2={extHighlightX} y2={PADDING.top + innerH}
            stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4,3" />
        )}
      </svg>
    </div>
  );
}
