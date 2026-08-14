import { useState, useCallback, useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MapView from './components/Map';
import MapLayerPanel from './components/MapLayerPanel';
import { LAYERS } from './layers/registry';
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
import { useRouteQuery } from './hooks/useRouteQuery';
import { useElevationQuery } from './hooks/useElevationQuery';
import { useRouteAnalysis } from './hooks/useRouteAnalysis';
import type { ElevationPoint, Poi } from '@cycleplanner/shared';

const queryClient = new QueryClient();

function AppInner() {
  const [activeLayers, setActiveLayers] = useState<Set<string>>(
    () => new Set(LAYERS.filter((l) => l.defaultVisible).map((l) => l.id)),
  );

  const [highlightDistance, setHighlightDistance] = useState<number | null>(null);
  const [showRoute, setShowRoute] = useState(true);
  const [selectedPoi, setSelectedPoi] = useState<Poi | null>(null);
  const [supermarketPois, setSupermarketPois] = useState<Poi[]>([]);
  const [prefetchedPois, setPrefetchedPois] = useState<{ bounds: [number, number, number, number]; pois: Poi[] } | null>(null);
  const mapFlyToRef = useRef<((lng: number, lat: number) => void) | null>(null);
  const mapFitBoundsRef = useRef<((points: Array<{ lat: number; lng: number }>) => void) | null>(null);
  const [bbox, setBbox] = useState<string | null>(null);
  const [scaleMeters, setScaleMeters] = useState<number | null>(null);

  const handleToggle = useCallback((layerId: string) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
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

  // Prefetch supermarkets for a wider area once we get close (scale ≤ 2 km),
  // so that zooming down to ≤ 500 m shows the icons instantly from cache.
  useEffect(() => {
    if (!bbox || scaleMeters == null || scaleMeters > 2000) return;
    const [south, west, north, east] = bbox.split(',').map(Number);
    // Reuse the cache while the visible bbox is still inside the prefetched bounds
    if (
      prefetchedPois &&
      prefetchedPois.bounds[0] <= south && prefetchedPois.bounds[1] <= west &&
      prefetchedPois.bounds[2] >= north && prefetchedPois.bounds[3] >= east
    ) {
      return;
    }
    const buffer = 0.015; // ~1.6 km extra in each direction
    const wideBounds: [number, number, number, number] = [south - buffer, west - buffer, north + buffer, east + buffer];
    const controller = new AbortController();
    fetch('/api/pois', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bbox: wideBounds.join(','), categories: ['supermarket'], limit: 500 }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data: { pois: Poi[] }) => setPrefetchedPois({ bounds: wideBounds, pois: data.pois ?? [] }))
      .catch(() => {});
    return () => controller.abort();
  }, [bbox, scaleMeters, prefetchedPois]);

  // Show supermarkets only when the scale bar (Maßstab) shows ≤ 500 m — instantly from the prefetched cache
  useEffect(() => {
    if (!bbox || scaleMeters == null) return;
    if (scaleMeters > 500) {
      setSupermarketPois([]);
      return;
    }
    const [south, west, north, east] = bbox.split(',').map(Number);
    const visible = (prefetchedPois?.pois ?? []).filter(
      (p) => p.lat >= south && p.lat <= north && p.lng >= west && p.lng <= east,
    );
    setSupermarketPois(visible);
  }, [bbox, scaleMeters, prefetchedPois]);

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
            supermarketPois={supermarketPois}
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
          />
          <Attribution activeLayers={activeLayers} />

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
        onReset={() => setHighlightDistance(null)}
        onZoomToSegment={(fromKm, toKm) => {
          setHighlightDistance(null);
          if (elevationData) {
            const pts = elevationData.points.filter(p => p.distanceKm >= fromKm && p.distanceKm <= toKm);
            if (pts.length > 0) {
              mapFitBoundsRef.current?.(pts.map(p => ({ lat: p.lat, lng: p.lng })));
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