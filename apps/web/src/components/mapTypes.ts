import type { RouteResponse, Poi } from '@cycleplanner/shared';

export interface MapFitBoundsOptions {
  padding?: [number, number];
  maxZoom?: number;
  animate?: boolean;
}

export type MapFitBoundsFn = (
  points: Array<{ lat: number; lng: number }>,
  opts?: MapFitBoundsOptions,
) => void;

/**
 * Shared props for both map renderers (MapLibre GL and the Leaflet
 * compatibility fallback). Not every prop is used by both renderers —
 * WebGL-only features (3D terrain, rain radar, wind overlay) are ignored
 * by the Leaflet fallback.
 */
export interface MapViewProps {
  route?: RouteResponse | null;
  routeB?: RouteResponse | null;
  showRoute?: boolean;
  isFetching: boolean;
  highlightDistance?: number | null;
  activeLayers?: Set<string>;
  basemapId?: string;
  poiMarkers?: Poi[];
  /** Optional ride start time — used by the rain radar (MapLibre only) */
  weatherStartTimeMs?: number | null;
  /** Wind per route segment — wind overlay (MapLibre only) */
  weatherSegments?: Array<{ fromKm: number; toKm: number; headwindKmh: number }> | null;
  onMapFlyTo?: (fn: (lng: number, lat: number) => void) => void;
  onMapFitBounds?: (fn: MapFitBoundsFn) => void;
  onBboxChange?: (bbox: string) => void;
  onScaleChange?: (scaleMeters: number) => void;
  onPoiRightClick?: (poi: Poi) => void;
  onPoiClick?: (poi: Poi) => void;
}
