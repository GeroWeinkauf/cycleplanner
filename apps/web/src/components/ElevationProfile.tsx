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
  if (s < 2) return '#22c55e';
  if (s < 5) return '#84cc16';
  if (s < 8) return '#eab308';
  if (s < 12) return '#f97316';
  return '#ef4444';
}

export default function ElevationProfile({
  data, surfaceData, isLoading, onHover, onReset, onZoomToSegment, highlightDistance,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const svgWidthRef = useRef<number>(0);
  const [viewMode, setViewMode] = useState<ViewMode>('elevation');
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);

  // Stack of zoom levels. Each entry is [fromKm, toKm].
  // Uses a ref + state: ref for stale-closure-free reads in callbacks,
  // state to trigger re-renders.
  const zoomStackRef = useRef<Array<[number, number]>>([]);
  const [zoomLevel, setZoomLevel] = useState(0); // triggers re-render on change
  const zoomed = zoomStackRef.current.length > 0;
  const currentZoom = zoomStackRef.current.length > 0 ? zoomStackRef.current[zoomStackRef.current.length - 1] : null;

  const pushZoom = useCallback((from: number, to: number) => {
    zoomStackRef.current = [...zoomStackRef.current, [from, to]];
    setZoomLevel(n => n + 1);
    onZoomToSegment?.(from, to);
  }, [onZoomToSegment]);

  const popAllZoom = useCallback(() => {
    zoomStackRef.current = [];
    setZoomLevel(0);
    onReset?.();
  }, [onReset]);

  const getSvgPos = useCallback((clientX: number) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const x = clientX - rect.left - PADDING.left;
    const innerW = rect.width - PADDING.left - PADDING.right;
    if (innerW <= 0) return null;
    svgWidthRef.current = innerW;
    return { x: clamp(x, 0, innerW), innerW };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const pos = getSvgPos(e.clientX);
    if (!pos) return;
    setDragStart(pos.x);
    setDragEnd(pos.x);
  }, [getSvgPos]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const pos = getSvgPos(e.clientX);
    if (!pos || !data) return;
    const fraction = clamp(pos.x / pos.innerW, 0, 1);
    const idx = Math.round(fraction * (data.points.length - 1));
    onHover?.(data.points[idx]);
    if (dragStart !== null) {
      setDragEnd(pos.x);
    }
  }, [getSvgPos, data, onHover, dragStart]);

  const handleMouseUp = useCallback(() => {
    if (dragStart !== null && dragEnd !== null && Math.abs(dragEnd - dragStart) > 10 && data) {
      const innerW = svgWidthRef.current || 800;
      // Use currently visible points (respects existing zoom level)
      const prevZoom = zoomStackRef.current.length > 0 ? zoomStackRef.current[zoomStackRef.current.length - 1] : null;
      const pts = prevZoom
        ? data.points.filter(p => p.distanceKm >= prevZoom[0] - 0.0001 && p.distanceKm <= prevZoom[1] + 0.0001)
        : data.points;
      if (pts.length < 2) return;
      const distMin = pts[0].distanceKm;
      const distRange = pts[pts.length - 1].distanceKm - distMin || 1;
      const fromFrac = clamp(Math.min(dragStart, dragEnd) / innerW, 0, 1);
      const toFrac = clamp(Math.max(dragStart, dragEnd) / innerW, 0, 1);
      const fromDist = distMin + fromFrac * distRange;
      const toDist = distMin + toFrac * distRange;
      pushZoom(fromDist, toDist);
    }
    setDragStart(null);
    setDragEnd(null);
  }, [dragStart, dragEnd, onZoomToSegment, data, pushZoom]);

  const handleMouseLeave = useCallback(() => {
    onHover?.(null);
    setDragStart(null);
    setDragEnd(null);
  }, [onHover]);

  const handleResetZoom = useCallback(() => {
    setDragStart(null);
    setDragEnd(null);
    popAllZoom();
  }, [popAllZoom]);

  // ── Empty / loading states ─────────────────
  if (isLoading) {
    return <div className="flex h-12 items-center justify-center bg-gray-50 text-xs text-gray-400">Berechne Höhenprofil...</div>;
  }
  if (!data || !data.points.length) {
    return <div className="flex h-10 items-center justify-center bg-gray-50 text-[11px] text-gray-400">Kein Höhenprofil</div>;
  }

  // ── Compute scales ─────────────────────────
  const { metrics } = data;
  let points = data.points;
  let zoomLabel = '';

  // Filter to zoomed segment (apply all zoom levels cumulatively)
  if (currentZoom) {
    const [fromDist, toDist] = currentZoom;
    points = points.filter(p => p.distanceKm >= fromDist - 0.0001 && p.distanceKm <= toDist + 0.0001);
    if (points.length < 2) points = data.points;
    else zoomLabel = `${fromDist.toFixed(1)}–${toDist.toFixed(1)} km`;
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

  const areaD = points.map((p, i) => {
    const cmd = i === 0 ? 'M' : 'L';
    return cmd + ' ' + toX(p.distanceKm).toFixed(1) + ' ' + toY(p.elevation).toFixed(1);
  }).join(' ') + ' L ' + toX(distMax).toFixed(1) + ' ' + (PADDING.top + innerH).toFixed(1) +
    ' L ' + toX(distMin).toFixed(1) + ' ' + (PADDING.top + innerH).toFixed(1) + ' Z';

  const yTicks = 4;
  const yLabels: Array<{ y: number; label: string }> = [];
  for (let i = 0; i <= yTicks; i++) {
    const elev = elevViewMin + elevViewRange * (i / yTicks);
    yLabels.push({ y: toY(elev), label: Math.round(elev) + '' });
  }

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

  // Single highlight cursor: map hover (red) when not dragging
  const extHighlightX = highlightDistance != null && dragStart === null
    ? PADDING.left + clamp((highlightDistance - distMin) / distRange, 0, 1) * innerW
    : null;

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
          <button onClick={handleResetZoom} className="ml-auto rounded bg-blue-600 px-2 py-0.5 text-[10px] text-white hover:bg-blue-700">
            ← Zurück
          </button>
        )}
        {!zoomed && onReset && (
          <span className="ml-auto text-[10px] text-gray-400 select-none">↔ ziehen zum Zoomen</span>
        )}
      </div>

      {zoomed && zoomLabel && (
        <div className="px-3 pb-1 text-[10px] text-blue-600 font-medium">{zoomLabel}</div>
      )}

      {/* View toggle */}
      {surfaceData && (
        <div className="flex gap-1 px-3 pb-1">
          <button onClick={() => setViewMode('elevation')}
            className={'rounded px-2 py-0.5 text-[10px] ' + (viewMode === 'elevation' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')}>Höhenprofil</button>
          <button onClick={() => setViewMode('surface')}
            className={'rounded px-2 py-0.5 text-[10px] ' + (viewMode === 'surface' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')}>Oberfläche</button>
        </div>
      )}

      {/* Surface bar */}
      {viewMode === 'surface' && surfaceData && (
        <div className="px-3 pb-2">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-200">
            {(() => {
              const items: Array<[string, number]> = [
                ['#4ade80', surfaceData.surfaceDistribution.asphalt],
                ['#f59e0b', surfaceData.surfaceDistribution.gravel],
                ['#d97706', surfaceData.surfaceDistribution.dirt],
                ['#22c55e', surfaceData.surfaceDistribution.paved],
              ];
              return items.filter(([, v]) => v > 0).map(([c, v]) =>
                <div key={c} style={{ width: v + '%', backgroundColor: c }} className="h-full first:rounded-l-full last:rounded-r-full" />
              );
            })()}
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
        role="img" aria-label={viewMode === 'elevation' ? 'Höhenprofil' : 'Oberfläche'}
      >
        <path d={areaD} fill="rgba(37, 99, 235, 0.08)" stroke="none" />

        {segments.map((seg, i) => (
          <line key={i} x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
            stroke={seg.color} strokeWidth="1.5" strokeLinecap="round" />
        ))}

        {yLabels.map((t, i) => (
          <line key={'yg-' + i} x1={PADDING.left} y1={t.y} x2={PADDING.left + innerW} y2={t.y} stroke="#f3f4f6" strokeWidth="0.5" />
        ))}

        {yLabels.map((t, i) => (
          <text key={'yl-' + i} x={PADDING.left - 5} y={t.y + 3} textAnchor="end"
            fill="#9ca3af" fontFamily="system-ui" fontSize="9" fontWeight="400">{t.label}</text>
        ))}

        {xLabels.map((t, i) => (
          <text key={'xl-' + i} x={t.x} y={PADDING.top + innerH + 14} textAnchor="middle"
            fill="#9ca3af" fontFamily="system-ui" fontSize="9" fontWeight="400">{t.label}</text>
        ))}

        {/* Drag selection */}
        {selLeft !== null && selRight !== null && (
          <rect x={selLeft} y={PADDING.top} width={selRight - selLeft} height={innerH}
            fill="rgba(99, 102, 241, 0.12)" stroke="rgba(99, 102, 241, 0.4)" strokeWidth="1" strokeDasharray="4,2" />
        )}

        {/* Map highlight cursor (single line, only when not dragging) */}
        {extHighlightX !== null && dragStart === null && (
          <line x1={extHighlightX} y1={PADDING.top} x2={extHighlightX} y2={PADDING.top + innerH}
            stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4,3" />
        )}
      </svg>
    </div>
  );
}