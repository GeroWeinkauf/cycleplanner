import { useState, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MapCanvas from './components/Map';
import LayerPanel from './components/LayerPanel';
import WaypointList from './components/WaypointList';
import Attribution from './components/Attribution';
import RouteHeader from './components/RouteHeader';
import { useRouteQuery } from './hooks/useRouteQuery';
import { LAYERS } from './layers/registry';

const queryClient = new QueryClient();

function AppInner() {
  const [activeLayers, setActiveLayers] = useState<Set<string>>(
    () => new Set(LAYERS.filter((l) => l.defaultVisible).map((l) => l.id)),
  );

  const handleToggle = useCallback((layerId: string) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  }, []);

  const { data: route, isFetching } = useRouteQuery('Trekking');

  return (
    <div className="relative flex h-screen w-screen overflow-hidden">
      {/* ── Sidebar ─────────────────────────── */}
      <div className="z-20 flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white shadow-lg">
        <div className="border-b border-gray-200 px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">CyclePlanner</h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          <WaypointList />
        </div>
        <div className="border-t border-gray-200">
          <LayerPanel activeLayers={activeLayers} onToggle={handleToggle} />
        </div>
      </div>

      {/* ── Map area ─────────────────────────── */}
      <div className="relative flex-1">
        <MapCanvas activeLayers={activeLayers} route={route} isFetching={isFetching} />
        <RouteHeader route={route} isFetching={isFetching} />
        <Attribution activeLayers={activeLayers} />
      </div>
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
