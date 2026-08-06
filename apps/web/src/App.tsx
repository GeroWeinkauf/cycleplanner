import { useState, useCallback } from 'react';
import MapCanvas from './components/Map';
import LayerPanel from './components/LayerPanel';
import Attribution from './components/Attribution';
import { LAYERS } from './layers/registry';

export default function App() {
  const [activeLayers, setActiveLayers] = useState<Set<string>>(
    () => new Set(LAYERS.filter((l) => l.defaultVisible).map((l) => l.id)),
  );

  const handleToggle = useCallback((layerId: string) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) {
        next.delete(layerId);
      } else {
        next.add(layerId);
      }
      return next;
    });
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <MapCanvas activeLayers={activeLayers} />
      <LayerPanel activeLayers={activeLayers} onToggle={handleToggle} />
      <Attribution activeLayers={activeLayers} />
    </div>
  );
}
