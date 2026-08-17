import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ElevationPoint,
  ElevationProfile as ElevationProfileData,
  RouteAnalysis,
} from '@cycleplanner/shared';

interface Props {
  data: ElevationProfileData | undefined;
  surfaceData?: RouteAnalysis | undefined;
  isLoading: boolean;
  /** Called with the interpolated point under the cursor (for map marker sync) */
  onHover?: (point: ElevationPoint | null) => void;
  /** Called on a plain left-click (without drag) */
  onClick?: (point: ElevationPoint) => void;
  /** Called when the user resets the zoom back to the full route */
  onReset?: () => void;
  /** Called with the selected [fromKm, toKm] after a drag-zoom gesture */
  onZoomToSegment?: (fromKm: number, toKm: number) => void;
  /** Weather risk per segment (0 = ok, 1 = Achtung, 2 = kritisch) */
  weatherRisk?: Array<{ fromKm: number; toKm: number; level: 0 | 1 | 2 }> | null;
  /** Save the currently zoomed section as a favorite segment */
  onSaveSegment?: (fromKm: number, toKm: number, name: string) => void;
  /** Kept for API compatibility – the cursor line is now tracked locally (pixel-exact). */
  highlightDistance?: number | null;
}

type ViewMode = 'elevation' | 'surface';

const PADDING = { top: 10, right: 10, bottom: 24, left: 42 };
const CHART_HEIGHT = 200;
/** Minimum drag distance (px) before a drag counts as zoom-selection instead of a click */
const MIN_DRAG_PX = 12;

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

export interface HoverInfo {
  distanceKm: number;
  elevation: number;
  lat: number;
  lng: number;
  /** Local slope in percent (positive = uphill) */
  slopePercent: number;
}

/**
 * Interpolate elevation / position / local slope at an arbitrary distance
 * along the sorted sample points. Pure function → unit-testable.
 */
export function interpolateAt(points: ElevationPoint[], distanceKm: number): HoverInfo {
  if (points.length === 0) {
    return { distanceKm, elevation: 0, lat: 0, lng: 0, slopePercent: 0 };
  }
  if (points.length === 1) {
    const p = points[0];
    return { distanceKm, elevation: p.elevation, lat: p.lat, lng: p.lng, slopePercent: 0 };
  }

  // Binary search: last index whose distanceKm is <= the target
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid].distanceKm <= distanceKm) lo = mid;
    else hi = mid - 1;
  }

  const a = points[lo];

  // Before the first sample: use the first segment's slope
  if (distanceKm < a.distanceKm && lo === 0) {
    const b = points[1];
    const segDist = b.distanceKm - a.distanceKm;
    const slopePercent = segDist > 0 ? ((b.elevation - a.elevation) / (segDist * 1000)) * 100 : 0;
    return { distanceKm, elevation: a.elevation, lat: a.lat, lng: a.lng, slopePercent };
  }

  // At or after the last sample: use the last segment's slope
  if (lo === points.length - 1) {
    const b = points[lo - 1];
    const segDist = a.distanceKm - b.distanceKm;
    const slopePercent = segDist > 0 ? ((a.elevation - b.elevation) / (segDist * 1000)) * 100 : 0;
    return { distanceKm, elevation: a.elevation, lat: a.lat, lng: a.lng, slopePercent };
  }

  const b = points[lo + 1];
  const segDist = b.distanceKm - a.distanceKm;
  const frac = segDist > 0 ? (distanceKm - a.distanceKm) / segDist : 0;
  const slopePercent = segDist > 0 ? ((b.elevation - a.elevation) / (segDist * 1000)) * 100 : 0;
  return {
    distanceKm,
    elevation: a.elevation + (b.elevation - a.elevation) * frac,
    lat: a.lat + (b.lat - a.lat) * frac,
    lng: a.lng + (b.lng - a.lng) * frac,
    slopePercent,
  };
}

function formatDistance(km: number): string {
  if (km < 0.95) return Math.round(km * 1000) + ' m';
  return km.toFixed(1).replace('.', ',') + ' km';
}

function formatSlope(percent: number): string {
  const sign = percent >= 0 ? '+' : '−';
  return sign + Math.abs(percent).toFixed(1).replace('.', ',') + ' %';
}

export default function ElevationProfile({
  data, surfaceData, isLoading, onHover, onClick, onReset, onZoomToSegment,
  weatherRisk, onSaveSegment,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('elevation');
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  // Zoom stack of [fromKm, toKm] windows. Only the topmost window is applied;
  // every new window is a subset of the previous one, so cumulative filtering
  // by the top window is equivalent to applying the whole stack.
  const [zoomStack, setZoomStack] = useState<Array<[number, number]>>([]);
  const zoomed = zoomStack.length > 0;

  const pushZoom = useCallback((from: number, to: number) => {
    setZoomStack((s) => [...s, [from, to]]);
    onZoomToSegment?.(from, to);
  }, [onZoomToSegment]);

  const popAllZoom = useCallback(() => {
    setZoomStack([]);
    onReset?.();
  }, [onReset]);

  // ── Measure the real container width so the chart spans the full
  //    screen width and mouse coordinates map 1:1 (no viewBox letterboxing) ──
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(el.getBoundingClientRect().width);
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const innerW = Math.max(width - PADDING.left - PADDING.right, 0);
  const innerH = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  // Current zoom window (top of the stack), used for filtering and segment saving
  const currentZoom = zoomStack.length > 0 ? zoomStack[zoomStack.length - 1] : null;

  // ── Visible points (after zoom filtering) ──
  const visible = useMemo(() => {
    if (!data || data.points.length === 0) {
      return { points: [] as ElevationPoint[], distMin: 0, distMax: 0, distRange: 1, zoomLabel: '' };
    }
    let pts = data.points;
    let zoomLabel = '';
    if (currentZoom) {
      const [fromDist, toDist] = currentZoom;
      const filtered = pts.filter(
        (p) => p.distanceKm >= fromDist - 0.0001 && p.distanceKm <= toDist + 0.0001,
      );
      if (filtered.length >= 2) {
        pts = filtered;
        zoomLabel = formatDistance(fromDist) + '–' + formatDistance(toDist);
      }
    }
    const distMin = pts[0].distanceKm;
    const distMax = pts[pts.length - 1].distanceKm;
    const distRange = distMax - distMin || 1;
    return { points: pts, distMin, distMax, distRange, zoomLabel };
  }, [data, zoomStack, currentZoom]);

  // ── Mouse helpers ─────────────────────────
  const svgXFromClient = useCallback((clientX: number): number | null => {
    if (!svgRef.current) return null;
    return clientX - svgRef.current.getBoundingClientRect().left;
  }, []);

  const clampX = useCallback((x: number) => {
    return clamp(x, PADDING.left, width - PADDING.right);
  }, [width]);

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return; // left button only
    const x = svgXFromClient(e.clientX);
    if (x === null) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* jsdom fallback */ }
    setDragStart(x);
    setDragEnd(x);
  }, [svgXFromClient]);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const rawX = svgXFromClient(e.clientX);
    if (rawX === null) return;
    const x = clampX(rawX);
    setHoverX(x);
    if (dragStart !== null) setDragEnd(x);

    // Sync the map marker to the interpolated route position
    if (onHover) {
      if (visible.points.length >= 2 && innerW > 0) {
        const fraction = clamp((x - PADDING.left) / innerW, 0, 1);
        const info = interpolateAt(visible.points, visible.distMin + fraction * visible.distRange);
        onHover({
          distanceKm: info.distanceKm,
          elevation: info.elevation,
          lat: info.lat,
          lng: info.lng,
        });
      } else {
        onHover(null);
      }
    }
  }, [svgXFromClient, clampX, dragStart, onHover, visible, innerW]);

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (dragStart === null || dragEnd === null) return;
    const start = dragStart;
    const end = dragEnd;
    setDragStart(null);
    setDragEnd(null);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }

    const delta = Math.abs(end - start);
    if (delta >= MIN_DRAG_PX && innerW > 0 && visible.points.length >= 2) {
      // Drag → zoom into the selected range across the full width
      const f1 = clamp((Math.min(start, end) - PADDING.left) / innerW, 0, 1);
      const f2 = clamp((Math.max(start, end) - PADDING.left) / innerW, 0, 1);
      const fromDist = visible.distMin + f1 * visible.distRange;
      const toDist = visible.distMin + f2 * visible.distRange;
      if (toDist - fromDist > 0.0005) pushZoom(fromDist, toDist);
    } else if (onClick && innerW > 0 && visible.points.length >= 2) {
      // Plain click → report the interpolated point
      const fraction = clamp((start - PADDING.left) / innerW, 0, 1);
      const info = interpolateAt(visible.points, visible.distMin + fraction * visible.distRange);
      onClick({
        distanceKm: info.distanceKm,
        elevation: info.elevation,
        lat: info.lat,
        lng: info.lng,
      });
    }
  }, [dragStart, dragEnd, innerW, visible, pushZoom, onClick]);

  const handlePointerCancel = useCallback(() => {
    setDragStart(null);
    setDragEnd(null);
  }, []);

  const handlePointerLeave = useCallback(() => {
    if (dragStart === null) {
      setHoverX(null);
      onHover?.(null);
    }
  }, [dragStart, onHover]);

  // ── Empty / loading states ─────────────────
  if (isLoading) {
    return (
      <div className="flex h-12 w-full items-center justify-center border-t border-gray-200 bg-gray-50 text-xs text-gray-400">
        Berechne Höhenprofil...
      </div>
    );
  }
  if (!data || data.points.length < 2) {
    return (
      <div className="flex h-10 w-full items-center justify-center border-t border-gray-200 bg-gray-50 text-[11px] text-gray-400">
        Kein Höhenprofil
      </div>
    );
  }

  // ── Scales (based on the visible points) ──
  const { metrics } = data;
  const points = visible.points;
  const distMin = visible.distMin;
  const distMax = visible.distMax;
  const distRange = visible.distRange;
  const elevValues = points.map((p) => p.elevation);
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

  const xTicks = Math.min(6, Math.max(2, Math.floor(distRange * 2)));
  const xLabels: Array<{ x: number; label: string }> = [];
  const xStep = distRange / xTicks;
  for (let i = 0; i <= xTicks; i++) {
    const dist = distMin + xStep * i;
    xLabels.push({ x: toX(dist), label: formatDistance(dist) });
  }

  // Hover info at the exact cursor position (for readout + dot)
  const hoverInfo = hoverX !== null && innerW > 0
    ? interpolateAt(points, distMin + clamp((hoverX - PADDING.left) / innerW, 0, 1) * distRange)
    : null;
  const hoverClampedX = hoverX !== null ? clampX(hoverX) : null;

  const selLeft = dragStart !== null && dragEnd !== null ? Math.min(dragStart, dragEnd) : null;
  const selRight = dragStart !== null && dragEnd !== null ? Math.max(dragStart, dragEnd) : null;
  const dragging = dragStart !== null;

  return (
    <div ref={wrapRef} className="flex w-full flex-col border-t border-gray-200 bg-white select-none">
      {/* Metrics bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1.5 text-[11px] text-gray-600">
        <span><span className="font-semibold text-gray-800">{metrics.totalAscent} m</span> ↑</span>
        <span><span className="font-semibold text-gray-800">{metrics.totalDescent} m</span> ↓</span>
        <span><span className="font-semibold text-gray-800">{metrics.minElevation}–{metrics.maxElevation} m</span></span>
        <span><span className="font-semibold text-gray-800">{metrics.maxSlope}%</span> max</span>
        {!zoomed && hoverInfo && !dragging && (
          <span className="font-medium text-red-600">
            {Math.round(hoverInfo.elevation)} m · {formatSlope(hoverInfo.slopePercent)} · {formatDistance(hoverInfo.distanceKm)}
          </span>
        )}
        {!zoomed && !hoverInfo && (
          <span className="text-[10px] text-gray-400">↔ Ziehen zum Zoomen</span>
        )}
        {zoomed && (
          <button
            onClick={popAllZoom}
            className="ml-auto rounded bg-blue-600 px-2 py-0.5 text-[10px] text-white hover:bg-blue-700"
            title="Zoom zurücksetzen und ganze Route anzeigen"
          >
            ← Zurück
          </button>
        )}
      </div>

      {zoomed && visible.zoomLabel && (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-1 text-[10px] font-medium text-blue-600">
          <span>Zoom: {visible.zoomLabel} · ↔ weiter zoomen möglich</span>
          {onSaveSegment && !saveOpen && (
            <button
              onClick={() => { setSaveOpen(true); setSaveName(''); }}
              className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-600 hover:bg-indigo-100"
              title="Diesen Abschnitt als Lieblingssegment speichern"
            >
              ☆ Segment speichern
            </button>
          )}
          {saveOpen && (
            <span className="flex items-center gap-1">
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Name des Segments"
                autoFocus
                className="w-32 rounded border border-gray-300 px-1 py-0.5 text-[10px] text-gray-800 focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={() => {
                  if (saveName.trim() && currentZoom) {
                    onSaveSegment?.(currentZoom[0], currentZoom[1], saveName.trim());
                  }
                  setSaveOpen(false);
                }}
                className="rounded bg-indigo-600 px-1.5 py-0.5 text-white hover:bg-indigo-700"
              >
                ✓
              </button>
              <button
                onClick={() => setSaveOpen(false)}
                className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 hover:bg-gray-200"
              >
                ✕
              </button>
            </span>
          )}
        </div>
      )}

      {/* Weather risk legend */}
      {weatherRisk && weatherRisk.length > 0 && (
        <div className="flex items-center gap-2 px-3 pb-1 text-[9px] text-gray-500">
          <span>Regenrisiko je Etappe:</span>
          <span className="flex items-center gap-0.5"><span className="inline-block h-2 w-2 rounded-sm bg-green-500" /> ok</span>
          <span className="flex items-center gap-0.5"><span className="inline-block h-2 w-2 rounded-sm bg-yellow-500" /> Regen möglich</span>
          <span className="flex items-center gap-0.5"><span className="inline-block h-2 w-2 rounded-sm bg-red-500" /> Regen/Gewitter</span>
        </div>
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

      {/* SVG chart – viewBox matches the measured pixel width exactly, so the
          cursor line sits precisely under the mouse and the chart uses the
          full screen width. */}
      <svg
        ref={svgRef}
        width="100%"
        height={CHART_HEIGHT}
        viewBox={'0 0 ' + Math.max(width, 1) + ' ' + CHART_HEIGHT}
        className="block w-full"
        style={{ touchAction: 'none', cursor: dragging ? 'col-resize' : 'crosshair' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerLeave}
        role="img"
        aria-label={viewMode === 'elevation' ? 'Höhenprofil' : 'Oberfläche'}
      >
        {width > 80 && (
          <g>
            {/* Weather risk strip (rain per segment, follows the zoom window) */}
            {weatherRisk && weatherRisk.length > 0 && (
              <g>
                {weatherRisk.map((w, i) => {
                  const x1 = Math.max(toX(w.fromKm), PADDING.left);
                  const x2 = Math.min(toX(w.toKm), PADDING.left + innerW);
                  if (x2 <= x1) return null;
                  const color = w.level === 2 ? '#ef4444' : w.level === 1 ? '#eab308' : '#22c55e';
                  return (
                    <rect key={'wr-' + i} x={x1} y={0} width={x2 - x1} height={7}
                      fill={color} opacity={0.85} />
                  );
                })}
              </g>
            )}

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

            {/* Cursor: exact line under the mouse + dot on the profile */}
            {hoverClampedX !== null && hoverInfo && (
              <g pointerEvents="none">
                <line x1={hoverClampedX} y1={PADDING.top} x2={hoverClampedX} y2={PADDING.top + innerH}
                  stroke="#ef4444" strokeWidth="1.25" strokeDasharray="4,3" />
                <circle cx={hoverClampedX} cy={toY(hoverInfo.elevation)} r={3.5}
                  fill="#ef4444" stroke="#fff" strokeWidth={1.25} />
                {/* Floating readout (height + slope) at the top of the chart,
                    flipping to the left side near the right edge */}
                <text
                  x={hoverClampedX > width - 90 ? hoverClampedX - 6 : hoverClampedX + 6}
                  y={PADDING.top + 11}
                  textAnchor={hoverClampedX > width - 90 ? 'end' : 'start'}
                  fill="#dc2626"
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  fontFamily="system-ui"
                  fontSize="10"
                  fontWeight="600"
                >
                  {Math.round(hoverInfo.elevation)} m · {formatSlope(hoverInfo.slopePercent)}
                </text>
              </g>
            )}
          </g>
        )}
      </svg>
    </div>
  );
}
