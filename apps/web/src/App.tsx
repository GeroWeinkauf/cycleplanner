import { useState, useCallback, useRef } from 'react';
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
import PoiControls from './components/PoiControls';
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
  const mapFlyToRef = useRef<((lng: number, lat: number) => void) | null>(null);
  const mapFitBoundsRef = useRef<((points: Array<{ lat: number; lng: number }>) => void) | null>(null);
  const [bbox, setBbox] = useState<string | null>(null);

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

  const handlePoiClick = useCallback((poi: Poi) => {
    setSelectedPoi(poi);
  }, []);

  const handlePoiClose = useCallback(() => {
    setSelectedPoi(null);
  }, []);

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
            <PoiControls
              bbox={bbox}
              corridorGeometry={route?.geometry}
              onPoiClick={handlePoiClick}
            />
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
            onMapFlyTo={(fn) => { mapFlyToRef.current = fn; }}
            onMapFitBounds={(fn) => { mapFitBoundsRef.current = fn; }}
            onBboxChange={handleBboxChange}
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

          {/* ── POI Detail Popup (bottom center) ── */}
          <PoiDetail
            poi={selectedPoi}
            onClose={handlePoiClose}
            onFlyTo={mapFlyToRef.current || undefined}
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