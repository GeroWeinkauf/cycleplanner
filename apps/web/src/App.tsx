import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MapView from './components/Map';
import LeafletMap from './components/LeafletMap';
import type { MapViewProps } from './components/mapTypes';
import { detectWebGLForMapLibre } from './lib/webgl';
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
import { useProfileStore } from './store/useProfileStore';
import { useWaypointStore } from './store/useWaypointStore';
import { useRouteQuery } from './hooks/useRouteQuery';
import { useElevationQuery } from './hooks/useElevationQuery';
import { useRouteAnalysis } from './hooks/useRouteAnalysis';
import { useWeatherRouteQuery, useWeatherWindowsQuery } from './hooks/useWeather';
import { useSegments } from './hooks/useSegments';
import { POI_CATEGORIES } from '@cycleplanner/shared';
import type {
  ElevationPoint,
  Poi,
  PoiCategory,
  RouteResponse,
  SavedSegment,
  WindOptimizedRoute,
} from '@cycleplanner/shared';

type MapFitBoundsFn = (
  points: Array<{ lat: number; lng: number }>,
  opts?: { padding?: [number, number]; maxZoom?: number; animate?: boolean },
) => void;

const queryClient = new QueryClient();

/** Marker POI categories shown as toggles in the layer panel */
interface MarkerCategoryConfig {
  key: PoiCategory;
  showScaleMeters: number;
  prefetchScaleMeters: number;
  bufferDeg: number;
  limit: number;
  defaultOn: boolean;
  hint: string;
}

const MARKER_CATEGORIES: MarkerCategoryConfig[] = [
  { key: 'supermarket', showScaleMeters: 500, prefetchScaleMeters: 2000, bufferDeg: 0.015, limit: 500, defaultOn: true, hint: 'Einkaufsmöglichkeiten unterwegs' },
  { key: 'lake', showScaleMeters: 5000, prefetchScaleMeters: 15000, bufferDeg: 0.08, limit: 200, defaultOn: true, hint: 'Größere Seen mit Google-Infos & Fotos' },
  { key: 'water', showScaleMeters: 1000, prefetchScaleMeters: 4000, bufferDeg: 0.03, limit: 200, defaultOn: false, hint: 'Trinkwasser-Stellen' },
  { key: 'toilets', showScaleMeters: 1000, prefetchScaleMeters: 4000, bufferDeg: 0.03, limit: 200, defaultOn: false, hint: 'Öffentliche Toiletten' },
  { key: 'bench', showScaleMeters: 800, prefetchScaleMeters: 3500, bufferDeg: 0.03, limit: 300, defaultOn: false, hint: 'Bänke & Rastplätze' },
  { key: 'picnic', showScaleMeters: 1200, prefetchScaleMeters: 5000, bufferDeg: 0.03, limit: 200, defaultOn: false, hint: 'Picknickplätze' },
  { key: 'bikeShop', showScaleMeters: 2000, prefetchScaleMeters: 8000, bufferDeg: 0.05, limit: 100, defaultOn: false, hint: 'Fahrradläden' },
  { key: 'bikeRepair', showScaleMeters: 1500, prefetchScaleMeters: 6000, bufferDeg: 0.05, limit: 100, defaultOn: false, hint: 'Reparaturstationen & Luftpumpen' },
  { key: 'campsite', showScaleMeters: 5000, prefetchScaleMeters: 15000, bufferDeg: 0.08, limit: 150, defaultOn: false, hint: 'Campingplätze' },
  { key: 'trainStation', showScaleMeters: 5000, prefetchScaleMeters: 15000, bufferDeg: 0.08, limit: 150, defaultOn: false, hint: 'Bahnhöfe (Bike+Ride)' },
  { key: 'viewpoint', showScaleMeters: 3000, prefetchScaleMeters: 10000, bufferDeg: 0.06, limit: 150, defaultOn: false, hint: 'Aussichtspunkte' },
];

function AppInner() {
  const [activeLayers, setActiveLayers] = useState<Set<string>>(
    () => new Set(LAYERS.filter((l) => l.defaultVisible).map((l) => l.id)),
  );
  const [basemapId, setBasemapId] = useState<string>(DEFAULT_BASEMAP_ID);

  const [highlightDistance, setHighlightDistance] = useState<number | null>(null);
  const [showRoute, setShowRoute] = useState(true);
  const [selectedPoi, setSelectedPoi] = useState<Poi | null>(null);
  const [poiEnabled, setPoiEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(MARKER_CATEGORIES.map((c) => [c.key, c.defaultOn])),
  );
  const [poiMarkers, setPoiMarkers] = useState<Poi[]>([]);
  const [prefetchedByCategory, setPrefetchedByCategory] = useState<
    Record<string, { bounds: [number, number, number, number]; pois: Poi[] }>
  >({});
  const mapFlyToRef = useRef<((lng: number, lat: number) => void) | null>(null);
  const mapFitBoundsRef = useRef<MapFitBoundsFn | null>(null);
  const [bbox, setBbox] = useState<string | null>(null);
  const [scaleMeters, setScaleMeters] = useState<number | null>(null);

  // Ride settings: start time + average speed drive the weather features
  const startTime = useRideStore((s) => s.startTime);
  const avgSpeedKmh = useRideStore((s) => s.avgSpeedKmh);
  const startTimeMs = useMemo(() => (startTime ? new Date(startTime).getTime() : null), [startTime]);
  const prevStartTimeRef = useRef<string | null>(startTime);

  // Wind-optimized route (replaces the base route while active)
  const [windRoute, setWindRoute] = useState<RouteResponse | null>(null);
  const [windInfo, setWindInfo] = useState<{ avgHeadwindKmh: number; avgTailwindKmh: number } | null>(null);
  const [windOptimizing, setWindOptimizing] = useState(false);
  const [windError, setWindError] = useState<string | null>(null);
  const [windowsEnabled, setWindowsEnabled] = useState(false);

  // MapLibre GL needs WebGL; environments without it fall back to the
  // Leaflet compatibility renderer (Canvas 2D, no WebGL required).
  const [useLeaflet, setUseLeaflet] = useState<boolean>(() => !detectWebGLForMapLibre());

  const handleToggle = useCallback((layerId: string) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  }, []);

  const handleTogglePoi = useCallback((category: string) => {
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

  // ── Routes ────────────────────────────────
  const { data: route, isFetching } = useRouteQuery();
  const waypointCount = useWaypointStore((s) => s.waypoints.length);

  // Clear the wind-optimized route when the base route changes
  const lastBaseGeometryRef = useRef<string | null>(null);
  useEffect(() => {
    const g = route?.geometry ?? null;
    if (lastBaseGeometryRef.current !== null && lastBaseGeometryRef.current !== g) {
      setWindRoute(null);
      setWindInfo(null);
    }
    lastBaseGeometryRef.current = g;
  }, [route?.geometry]);

  const activeRoute = windRoute ?? route;

  const { data: elevationData, isLoading: elevationLoading } = useElevationQuery(activeRoute?.geometry);
  const { data: analysis } = useRouteAnalysis(activeRoute?.geometry);

  // ── Weather along the active route ────────
  const weatherQuery = useWeatherRouteQuery(activeRoute?.geometry, startTime, avgSpeedKmh);
  const windowsQuery = useWeatherWindowsQuery(activeRoute?.geometry, avgSpeedKmh, windowsEnabled);

  const weatherRisk = useMemo(
    () =>
      weatherQuery.data?.segments.map((s) => ({ fromKm: s.fromKm, toKm: s.toKm, level: s.level })) ??
      null,
    [weatherQuery.data],
  );

  const weatherSegments = useMemo(
    () =>
      weatherQuery.data?.segments.map((s) => ({
        fromKm: s.fromKm,
        toKm: s.toKm,
        headwindKmh: s.headwindKmh,
      })) ?? null,
    [weatherQuery.data],
  );

  const windSummary = windInfo ?? {
    avgHeadwindKmh: weatherQuery.data?.summary.avgHeadwindKmh ?? 0,
    avgTailwindKmh: weatherQuery.data?.summary.avgTailwindKmh ?? 0,
  };

  // ── Wind-optimized route ──────────────────
  const handleWindOptimize = useCallback(async () => {
    const wps = useWaypointStore.getState().waypoints;
    if (wps.length < 2) return;
    const profile = useProfileStore.getState().profile;
    const overrides = useProfileStore.getState().overrides;
    const exclusionFlags = useProfileStore.getState().exclusionFlags;
    setWindOptimizing(true);
    setWindError(null);
    try {
      const res = await fetch('/api/route/wind-optimized', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waypoints: wps.map((wp) => ({ lat: wp.lat, lng: wp.lng, label: wp.label })),
          profile,
          costingOverrides: overrides,
          exclusionFlags,
          startTimeIso: startTime ?? undefined,
          avgSpeedKmh,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Wind-Optimierung fehlgeschlagen' }));
        throw new Error((err as { error?: string }).error || 'Wind-Optimierung fehlgeschlagen');
      }
      const data = (await res.json()) as WindOptimizedRoute;
      setWindRoute({ geometry: data.geometry, summary: data.summary });
      setWindInfo(
        data.wind
          ? { avgHeadwindKmh: data.wind.avgHeadwindKmh, avgTailwindKmh: data.wind.avgTailwindKmh }
          : null,
      );
    } catch (e) {
      setWindError(e instanceof Error ? e.message : 'Wind-Optimierung fehlgeschlagen');
    } finally {
      setWindOptimizing(false);
    }
  }, [startTime, avgSpeedKmh]);

  // ── Segments ──────────────────────────────
  const { segments, saveSegment, deleteSegment } = useSegments();

  const handleSaveSegment = useCallback(
    (fromKm: number, toKm: number, name: string) => {
      if (!elevationData) return;
      const pts = elevationData.points.filter(
        (p) => p.distanceKm >= fromKm - 0.0001 && p.distanceKm <= toKm + 0.0001,
      );
      if (pts.length >= 2) {
        void saveSegment(name, pts.map((p) => [p.lng, p.lat] as [number, number]));
      }
    },
    [elevationData, saveSegment],
  );

  const handleAppendSegment = useCallback((seg: SavedSegment) => {
    if (seg.geometry.length < 2) return;
    const store = useWaypointStore.getState();
    const [startLng, startLat] = seg.geometry[0];
    const [endLng, endLat] = seg.geometry[seg.geometry.length - 1];
    if (store.waypoints.length === 0) {
      store.addWaypoint(startLat, startLng, 'break');
    } else {
      store.addWaypoint(startLat, startLng, 'through');
    }
    store.addWaypoint(endLat, endLng, 'break');
  }, []);

  // ── POI marker pipeline (per category) ────
  useEffect(() => {
    if (!bbox || scaleMeters == null) return;
    const [south, west, north, east] = bbox.split(',').map(Number);

    const controllers: AbortController[] = [];
    for (const cfg of MARKER_CATEGORIES) {
      if (!poiEnabled[cfg.key]) continue;
      if (scaleMeters > cfg.prefetchScaleMeters) continue;
      const cached = prefetchedByCategory[cfg.key];
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
        body: JSON.stringify({ bbox: wideBounds.join(','), categories: [cfg.key], limit: cfg.limit }),
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((data: { pois: Poi[] }) => {
          setPrefetchedByCategory((prev) => ({
            ...prev,
            [cfg.key]: { bounds: wideBounds, pois: data.pois ?? [] },
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
    for (const cfg of MARKER_CATEGORIES) {
      if (!poiEnabled[cfg.key]) continue;
      if (scaleMeters > cfg.showScaleMeters) continue;
      const cached = prefetchedByCategory[cfg.key];
      if (!cached) continue;
      visible.push(...cached.pois.filter(
        (p) => p.lat >= south && p.lat <= north && p.lng >= west && p.lng <= east,
      ));
    }
    setPoiMarkers(visible);
  }, [bbox, scaleMeters, poiEnabled, prefetchedByCategory]);

  const handleElevationHover = useCallback((point: ElevationPoint | null) => {
    setHighlightDistance(point?.distanceKm ?? null);
  }, []);

  const poiOptions = MARKER_CATEGORIES.map((c) => {
    const meta = POI_CATEGORIES.find((m) => m.key === c.key);
    return { key: c.key, label: meta?.label ?? c.key, icon: meta?.icon ?? '📍', hint: c.hint };
  });

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
            <RideSettingsPanel
              windows={windowsQuery.data?.windows ?? null}
              windowsLoading={windowsQuery.isFetching}
              onFindBestStart={() => setWindowsEnabled(true)}
            />
            <div className="px-3 py-1.5 flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-gray-600">
                <input type="checkbox" checked={showRoute} onChange={(e) => setShowRoute(e.target.checked)} className="h-3 w-3 accent-blue-600" />
                Geplante Route anzeigen
              </label>
            </div>
            <WaypointList />
            <RouteSummary
              route={activeRoute}
              elevation={elevationData}
              analysis={analysis}
              wind={windSummary}
              windOptimized={!!windRoute}
            />
            {/* Wind-optimized route */}
            <div className="px-3 py-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                Wind-Optimierung
              </div>
              <button
                onClick={handleWindOptimize}
                disabled={windOptimizing || waypointCount < 2}
                className="w-full rounded bg-sky-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-40"
              >
                🌬 {windOptimizing ? 'Analysiere Wind…' : 'Wind-optimierte Route berechnen'}
              </button>
              {windInfo && (
                <div className="mt-1 text-[10px] text-gray-600">
                  Wind-Route: Gegenwind {windInfo.avgHeadwindKmh} km/h · Rückenwind {windInfo.avgTailwindKmh} km/h
                </div>
              )}
              {windRoute && (
                <button
                  onClick={() => { setWindRoute(null); setWindInfo(null); }}
                  className="mt-1 text-[10px] text-blue-600 hover:underline"
                >
                  Standard-Route wiederherstellen
                </button>
              )}
              {windError && <div className="mt-1 text-[10px] text-red-500">{windError}</div>}
            </div>
            <GpxExportSection route={activeRoute} />
          </div>
        </div>

        {/* ── Map area ─────────────────────────── */}
        <div className="relative flex-1">
          {useLeaflet ? (
            <LeafletMap
              route={activeRoute}
              showRoute={showRoute}
              isFetching={isFetching}
              highlightDistance={highlightDistance}
              activeLayers={activeLayers}
              basemapId={basemapId}
              poiMarkers={poiMarkers}
              onMapFlyTo={(fn) => { mapFlyToRef.current = fn; }}
              onMapFitBounds={(fn) => { mapFitBoundsRef.current = fn; }}
              onBboxChange={handleBboxChange}
              onScaleChange={handleScaleChange}
              onPoiClick={handlePoiClick}
              onPoiRightClick={handlePoiClick}
            />
          ) : (
            <MapView
              route={activeRoute}
              showRoute={showRoute}
              isFetching={isFetching}
              highlightDistance={highlightDistance}
              activeLayers={activeLayers}
              basemapId={basemapId}
              poiMarkers={poiMarkers}
              weatherStartTimeMs={startTimeMs}
              weatherSegments={weatherSegments}
              onWebGLFallback={() => setUseLeaflet(true)}
              onMapFlyTo={(fn) => { mapFlyToRef.current = fn; }}
              onMapFitBounds={(fn) => { mapFitBoundsRef.current = fn; }}
              onBboxChange={handleBboxChange}
              onScaleChange={handleScaleChange}
              onPoiClick={handlePoiClick}
              onPoiRightClick={handlePoiClick}
            />
          )}
          {useLeaflet && (
            <div className="absolute bottom-16 left-3 z-[1000] rounded bg-amber-100/90 px-2 py-1 text-[10px] font-medium text-amber-800 shadow-md backdrop-blur">
              Kompatibilitätsmodus (ohne WebGL/3D) — Basiskarten, Ebenen &amp; Routen funktionieren
            </div>
          )}
          <div className="absolute top-2 right-2 z-[1000] flex gap-2">
            <GpxImportButton />
          </div>
          <RouteHeader route={activeRoute} isFetching={isFetching} />
          <MapLayerPanel
            activeLayers={activeLayers}
            onToggleLayer={handleToggle}
            basemapId={basemapId}
            onBasemapChange={setBasemapId}
            poiEnabled={poiEnabled}
            onTogglePoi={handleTogglePoi}
            poiOptions={poiOptions}
            segments={segments}
            onAppendSegment={handleAppendSegment}
            onDeleteSegment={(seg) => void deleteSegment(seg.id)}
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
        key={activeRoute?.geometry?.substring(0, 40) || 'no-route'}
        data={elevationData}
        surfaceData={analysis}
        isLoading={elevationLoading}
        onHover={handleElevationHover}
        weatherRisk={weatherRisk}
        onSaveSegment={handleSaveSegment}
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
