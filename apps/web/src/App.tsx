import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MapView from './components/Map';
import MapLayerPanel from './components/MapLayerPanel';
import { LAYERS } from './layers/registry';
import { DEFAULT_BASEMAP_ID } from './layers/basemaps';
import ProfilePanel from './components/ProfilePanel';
import WaypointList from './components/WaypointList';
import Attribution from './components/Attribution';
import RouteHeader from './components/RouteHeader';
import ElevationProfile from './components/ElevationProfile';
import RouteSummary from './components/RouteSummary';
import GpxExportSection from './components/GpxExportSection';
import GpxImportButton from './components/GpxImportButton';
import ValhallaStatus from './components/ValhallaStatus';
import PoiDetail from './components/PoiDetail';
import RideSettingsPanel from './components/RideSettingsPanel';
import { useRideStore } from './store/useRideStore';
import { useRouteQuery } from './hooks/useRouteQuery';
import { useElevationQuery } from './hooks/useElevationQuery';
import { useRouteAnalysis } from './hooks/useRouteAnalysis';
import type { ElevationPoint, Poi, PoiCategory } from '@cycleplanner/shared';

type MapFitBoundsFn = (
  points: Array<{ lat: number; lng: number }>,
  opts?: { padding?: [number, number]; maxZoom?: number; animate?: boolean },
) => void;

const queryClient = new QueryClient();

/** Marker POI categories that can be toggled in the layer panel */
type MarkerCategory = Extract<PoiCategory, 'supermarket' | 'lake'>;

interface MarkerCategoryConfig {
  /** Show markers when the scale bar is ≤ this many meters */
  showScaleMeters: number;
  /** Prefetch a wider area when the scale bar is ≤ this many meters */
  prefetchScaleMeters: number;
  /** Extra buffer in degrees around the prefetch bbox */
  bufferDeg: number;
  /** Overpass query limit */
  limit: number;
}

const MARKER_CATEGORIES: Record<MarkerCategory, MarkerCategoryConfig> = {
  supermarket: { showScaleMeters: 500, prefetchScaleMeters: 2000, bufferDeg: 0.015, limit: 500 },
  lake: { showScaleMeters: 5000, prefetchScaleMeters: 15000, bufferDeg: 0.08, limit: 200 },
};

function AppInner() {
  const [activeLayers, setActiveLayers] = useState<Set<string>>(
    () => new Set(LAYERS.filter((l) => l.defaultVisible).map((l) => l.id)),
  );
  const [basemapId, setBasemapId] = useState<string>(DEFAULT_BASEMAP_ID);

  const [highlightDistance, setHighlightDistance] = useState<number | null>(null);
  const [showRoute, setShowRoute] = useState(true);
  const [selectedPoi, setSelectedPoi] = useState<Poi | null>(null);
  const [poiEnabled, setPoiEnabled] = useState<Record<MarkerCategory, boolean>>({
    supermarket: true,
    lake: true,
  });
  const [poiMarkers, setPoiMarkers] = useState<Poi[]>([]);
  const [prefetchedByCategory, setPrefetchedByCategory] = useState<
    Partial<Record<MarkerCategory, { bounds: [number, number, number, number]; pois: Poi[] }>>
  >({});
  const mapFlyToRef = useRef<((lng: number, lat: number) => void) | null>(null);
  const mapFitBoundsRef = useRef<MapFitBoundsFn | null>(null);
  const [bbox, setBbox] = useState<string | null>(null);
  const [scaleMeters, setScaleMeters] = useState<number | null>(null);

  // Ride settings: start time drives the weather overlay
  const startTime = useRideStore((s) => s.startTime);
  const startTimeMs = useMemo(() => (startTime ? new Date(startTime).getTime() : null), [startTime]);
  const prevStartTimeRef = useRef<string | null>(startTime);

  const handleToggle = useCallback((layerId: string) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  }, []);

  const handleTogglePoi = useCallback((category: MarkerCategory) => {
    setPoiEnabled((prev) => ({ ...prev, [category]: !prev[category] }));
  }, []);

  const handleBboxChange = useCallback((newBbox: string) => {
    setBbox(newBbox);
  }, []);

  const handleScaleChange = useCallback((meters: number) => {
    setScaleMeters(meters);
  }, []);

  const handlePoiClick = useCallback((poi: Poi) => {
    setSelectedPoi(poi);
  }, []);

  const handleGoogleMaps = useCallback((poi: Poi) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lng}&travelmode=bicycling`, '_blank');
  }, []);

  const handlePoiClose = useCallback(() => {
    setSelectedPoi(null);
  }, []);

  // When a start time is set, automatically show the weather overlay
  useEffect(() => {
    if (startTime && !prevStartTimeRef.current) {
      setActiveLayers((prev) => (prev.has('rainviewer') ? prev : new Set(prev).add('rainviewer')));
    }
    prevStartTimeRef.current = startTime;
  }, [startTime]);

  // Prefetch marker POIs (supermarkets & lakes) with per-category thresholds
  useEffect(() => {
    if (!bbox || scaleMeters == null) return;
    const [south, west, north, east] = bbox.split(',').map(Number);

    const controllers: AbortController[] = [];
    for (const [category, cfg] of Object.entries(MARKER_CATEGORIES) as Array<[MarkerCategory, MarkerCategoryConfig]>) {
      if (!poiEnabled[category]) continue;
      if (scaleMeters > cfg.prefetchScaleMeters) continue;
      const cached = prefetchedByCategory[category];
      if (
        cached &&
        cached.bounds[0] <= south && cached.bounds[1] <= west &&
        cached.bounds[2] >= north && cached.bounds[3] >= east
      ) {
        continue;
      }
      const wideBounds: [number, number, number, number] = [
        south - cfg.bufferDeg, west - cfg.bufferDeg, north + cfg.bufferDeg, east + cfg.bufferDeg,
      ];
      const controller = new AbortController();
      controllers.push(controller);
      fetch('/api/pois', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bbox: wideBounds.join(','), categories: [category], limit: cfg.limit }),
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((data: { pois: Poi[] }) => {
          setPrefetchedByCategory((prev) => ({
            ...prev,
            [category]: { bounds: wideBounds, pois: data.pois ?? [] },
          }));
        })
        .catch(() => {});
    }
    return () => controllers.forEach((c) => c.abort());
  }, [bbox, scaleMeters, poiEnabled, prefetchedByCategory]);

  // Show markers per category from the prefetched cache when zoomed in enough
  useEffect(() => {
    if (!bbox || scaleMeters == null) return;
    const [south, west, north, east] = bbox.split(',').map(Number);
    const visible: Poi[] = [];
    for (const [category, cfg] of Object.entries(MARKER_CATEGORIES) as Array<[MarkerCategory, MarkerCategoryConfig]>) {
      if (!poiEnabled[category]) continue;
      if (scaleMeters > cfg.showScaleMeters) continue;
      const cached = prefetchedByCategory[category];
      if (!cached) continue;
      visible.push(...cached.pois.filter(
        (p) => p.lat >= south && p.lat <= north && p.lng >= west && p.lng <= east,
      ));
    }
    setPoiMarkers(visible);
  }, [bbox, scaleMeters, poiEnabled, prefetchedByCategory]);

  const { data: route, isFetching } = useRouteQuery();
  const { data: elevationData, isLoading: elevationLoading } = useElevationQuery(route?.geometry);
  const { data: analysis } = useRouteAnalysis(route?.geometry);

  const handleElevationHover = useCallback((point: ElevationPoint | null) => {
    setHighlightDistance(point?.distanceKm ?? null);
  }, []);

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden">
      <div className="relative flex flex-1 overflow-hidden">
        {/* ── Sidebar ─────────────────────────── */}
        <div className="z-20 flex w-72 shrink-0 flex-col border-r border-gray-200 bg-gray-50/80 backdrop-blur">
          <div className="border-b border-gray-200 bg-white px-4 py-3">
            <h1 className="text-base font-bold tracking-tight text-gray-900">
              <span className="text-blue-600">Cycle</span>Planner
            </h1>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-200">
            <ProfilePanel />
            <ValhallaStatus />
            <RideSettingsPanel />
            <div className="px-3 py-1.5 flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-gray-600">
                <input type="checkbox" checked={showRoute} onChange={(e) => setShowRoute(e.target.checked)} className="h-3 w-3 accent-blue-600" />
                Geplante Route anzeigen
              </label>
            </div>
            <WaypointList />
            <RouteSummary route={route} elevation={elevationData} analysis={analysis} />
            <GpxExportSection route={route} />
          </div>
        </div>

        {/* ── Map area ─────────────────────────── */}
        <div className="relative flex-1">
          <MapView
            route={route}
            showRoute={showRoute}
            isFetching={isFetching}
            highlightDistance={highlightDistance}
            activeLayers={activeLayers}
            basemapId={basemapId}
            poiMarkers={poiMarkers}
            weatherStartTimeMs={startTimeMs}
            onMapFlyTo={(fn) => { mapFlyToRef.current = fn; }}
            onMapFitBounds={(fn) => { mapFitBoundsRef.current = fn; }}
            onBboxChange={handleBboxChange}
            onScaleChange={handleScaleChange}
            onPoiClick={handlePoiClick}
            onPoiRightClick={handlePoiClick}
          />
          <div className="absolute top-2 right-2 z-[1000] flex gap-2">
            <GpxImportButton />
          </div>
          <RouteHeader route={route} isFetching={isFetching} />
          <MapLayerPanel
            activeLayers={activeLayers}
            onToggleLayer={handleToggle}
            basemapId={basemapId}
            onBasemapChange={setBasemapId}
            poiEnabled={poiEnabled}
            onTogglePoi={handleTogglePoi}
          />
          <Attribution activeLayers={activeLayers} basemapId={basemapId} />

          {/* ── POI Detail Popup ── */}
          <PoiDetail
            poi={selectedPoi}
            onClose={handlePoiClose}
            onFlyTo={mapFlyToRef.current || undefined}
            onGoogleMaps={handleGoogleMaps}
          />
        </div>
      </div>

      <ElevationProfile
        key={route?.geometry?.substring(0, 40) || 'no-route'}
        data={elevationData}
        surfaceData={analysis}
        isLoading={elevationLoading}
        onHover={handleElevationHover}
        onReset={() => {
          setHighlightDistance(null);
          // Back to the normal scope: fit the map to the whole route again
          if (elevationData && elevationData.points.length >= 2) {
            mapFitBoundsRef.current?.(
              elevationData.points.map((p) => ({ lat: p.lat, lng: p.lng })),
              { maxZoom: 15, padding: [30, 30], animate: true },
            );
          }
        }}
        onZoomToSegment={(fromKm, toKm) => {
          setHighlightDistance(null);
          if (elevationData) {
            // A small tolerance so very short selections between samples still find points
            const tol = 0.05;
            const pts = elevationData.points.filter(
              (p) => p.distanceKm >= fromKm - tol && p.distanceKm <= toKm + tol,
            );
            if (pts.length >= 2) {
              // Zoom the map to exactly the selected section, centered
              mapFitBoundsRef.current?.(
                pts.map((p) => ({ lat: p.lat, lng: p.lng })),
                { maxZoom: 17, padding: [60, 40], animate: true },
              );
            }
          }
        }}
        highlightDistance={highlightDistance}
      />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  );
}
