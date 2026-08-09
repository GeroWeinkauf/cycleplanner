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
  const [currentBbox, setCurrentBbox] = useState<string | null>(null);
  const [poiData, setPoiData] = useState<Poi[] | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<Poi | null>(null);
  const mapFlyToRef = useRef<((lng: number, lat: number) => void) | null>(null);

  const handleToggle = useCallback((layerId: string) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  }, []);

  const { data: route, isFetching } = useRouteQuery();
  const { data: elevationData, isLoading: elevationLoading } = useElevationQuery(route?.geometry);
  const { data: analysis } = useRouteAnalysis(route?.geometry);

  const handleElevationHover = useCallback((point: ElevationPoint | null) => {
    setHighlightDistance(point?.distanceKm ?? null);
  }, []);

  const handleElevationClick = useCallback((point: ElevationPoint) => {
    mapFlyToRef.current?.(point.lng, point.lat);
  }, []);

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden">
      <div className="relative flex flex-1 overflow-hidden">
        {/* ── Sidebar ─────────────────────────── */}
        <div className="z-20 flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-200 px-4 py-3">
            <h1 className="text-lg font-bold text-gray-900">CyclePlanner</h1>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ProfilePanel />
            <ValhallaStatus />
            <WaypointList />
            <RouteSummary route={route} elevation={elevationData} analysis={analysis} />
          </div>

        </div>

        {/* ── Map area ─────────────────────────── */}
        <div className="relative flex-1">
          <MapView
            route={route}
            isFetching={isFetching}
            highlightDistance={highlightDistance}
            onMapFlyTo={(fn) => { mapFlyToRef.current = fn; }}
            onBboxChange={setCurrentBbox}
            pois={poiData}
          />
          <div className="absolute top-2 right-2 z-10 flex gap-2">
            <GpxImportButton />
          </div>
          <RouteHeader route={route} isFetching={isFetching} />
          <MapLayerPanel
            activeLayers={activeLayers}
            onToggleLayer={handleToggle}
            bbox={currentBbox}
            corridorGeometry={route?.geometry}
            onPoisLoaded={setPoiData}
          />
          <Attribution activeLayers={activeLayers} />
        </div>
      </div>

      <ElevationProfile
        key={route?.geometry?.substring(0, 40) || 'no-route'}
        data={elevationData}
        surfaceData={analysis}
        isLoading={elevationLoading}
        onHover={handleElevationHover}
        onClick={handleElevationClick}
        highlightDistance={highlightDistance}
      />

      <PoiDetail
        poi={selectedPoi}
        onClose={() => setSelectedPoi(null)}
        onFlyTo={(lng, lat) => mapFlyToRef.current?.(lng, lat)}
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
