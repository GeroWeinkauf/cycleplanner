import { useState } from 'react';
import type { RouteAnalysis, EdgeAttributes } from '@cycleplanner/shared';

type ColorMode = 'surface' | 'roadClass' | 'slope' | 'none';

interface Props {
  analysis: RouteAnalysis | undefined;
  isLoading: boolean;
  /** Called with edge data when user clicks a segment */
  onEdgeClick?: (edge: EdgeAttributes) => void;
}

// Color maps
const SURFACE_COLORS: Record<string, string> = {
  asphalt: '#4ade80',
  paved: '#22c55e',
  gravel: '#f59e0b',
  dirt: '#d97706',
  unknown: '#9ca3af',
};

const ROAD_CLASS_COLORS: Record<string, string> = {
  cycleway: '#06b6d4',
  path: '#14b8a6',
  footway: '#10b981',
  residential: '#fbbf24',
  service: '#f97316',
  track: '#d97706',
  tertiary: '#ef4444',
  secondary: '#dc2626',
  primary: '#b91c1c',
  trunk: '#991b1b',
  motorway: '#7f1d1d',
  other: '#9ca3af',
};

const SLOPE_COLORS = [
  { max: 2, color: '#4ade80', label: 'Flach (0-2%)' },
  { max: 5, color: '#facc15', label: 'Leicht (2-5%)' },
  { max: 10, color: '#f97316', label: 'Moderat (5-10%)' },
  { max: 15, color: '#ef4444', label: 'Steil (10-15%)' },
  { max: 999, color: '#991b1b', label: 'Extrem (>15%)' },
];

function getSlopeColor(slope: number): string {
  const abs = Math.abs(slope);
  for (const band of SLOPE_COLORS) {
    if (abs <= band.max) return band.color;
  }
  return '#9ca3af';
}

export default function RouteColoring({ analysis, isLoading, onEdgeClick }: Props) {
  const [mode, setMode] = useState<ColorMode>('none');

  if (isLoading) {
    return (
      <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-400">
        Analysiere Route...
      </div>
    );
  }

  if (!analysis || analysis.edges.length === 0) {
    return null;
  }

  const modes: { key: ColorMode; label: string }[] = [
    { key: 'none', label: 'Keine Einfärbung' },
    { key: 'surface', label: 'Oberfläche' },
    { key: 'roadClass', label: 'Straßentyp' },
    { key: 'slope', label: 'Steigung' },
  ];

  return (
    <div className="border-t border-gray-100 px-3 py-2">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Routeneinfärbung
      </div>

      {/* Mode selector */}
      <div className="flex flex-wrap gap-1">
        {modes.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={
              'rounded px-2 py-0.5 text-xs ' +
              (mode === m.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Legend for current mode */}
      {mode === 'surface' && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {Object.entries(SURFACE_COLORS).map(([surface, color]) => (
            <LegendItem key={surface} color={color} label={surface} />
          ))}
        </div>
      )}
      {mode === 'roadClass' && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {Object.entries(ROAD_CLASS_COLORS).map(([rc, color]) => (
            <LegendItem key={rc} color={color} label={rc} />
          ))}
        </div>
      )}
      {mode === 'slope' && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {SLOPE_COLORS.map((band) => (
            <LegendItem key={band.label} color={band.color} label={band.label} />
          ))}
        </div>
      )}

      {/* Edge list (clickable) */}
      {mode !== 'none' && (
        <div className="mt-2 max-h-40 overflow-y-auto">
          {analysis.edges.slice(0, 50).map((edge, i) => {
            const color =
              mode === 'surface'
                ? SURFACE_COLORS[edge.surface] || SURFACE_COLORS.unknown
                : mode === 'roadClass'
                  ? ROAD_CLASS_COLORS[edge.roadClass] || ROAD_CLASS_COLORS.other
                  : mode === 'slope'
                    ? getSlopeColor(edge.slope)
                    : '#9ca3af';

            return (
              <button
                key={i}
                onClick={() => onEdgeClick?.(edge)}
                className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-gray-50"
              >
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="min-w-0 flex-1 truncate text-gray-700">
                  {edge.length.toFixed(2)} km — {edge.surface} / {edge.roadClass}
                </span>
                {edge.bikeNetwork && (
                  <span className="shrink-0 text-[10px] text-blue-500">{edge.bikeNetwork}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-gray-600">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
