import { useEffect, useRef } from 'react';
import { Map as MapLibreMap, type Map, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { LAYERS } from '../layers/registry';
import { desaturatedStyle } from '../layers/basemap';

interface MapProps {
  activeLayers: Set<string>;
}

/** Minimal blank style used when basemap is toggled off */
const BLANK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#e8e4df' } },
  ],
};

export default function MapCanvas({ activeLayers }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const prevLayersRef = useRef<Set<string>>(new Set());

  // ── Initialize map ──────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialStyle = activeLayers.has('basemap') ? desaturatedStyle : BLANK_STYLE;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: initialStyle,
      center: [12.3731, 51.0397], // Saxony center
      zoom: 9,
      attributionControl: false, // We render our own
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Only run on mount — empty deps intentional
  }, []);

  // ── Sync layers on activeLayers change ──────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const prev = prevLayersRef.current;
    const current = activeLayers;

    // Handle basemap toggle
    const basemapWasActive = prev.has('basemap');
    const basemapIsActive = current.has('basemap');
    if (basemapWasActive !== basemapIsActive) {
      if (basemapIsActive) {
        map.setStyle(desaturatedStyle);
        // After setStyle, all overlay layers are gone — re-add them
        for (const layer of LAYERS) {
          if (layer.id !== 'basemap' && current.has(layer.id)) {
            map.once('style.load', () => {
              layer.setup(map);
            });
          }
        }
      } else {
        map.setStyle(BLANK_STYLE);
        // Overlay layers survive setStyle? No, they get removed.
        // Re-add overlay layers after blank style loads
        map.once('style.load', () => {
          for (const layer of LAYERS) {
            if (layer.id !== 'basemap' && current.has(layer.id)) {
              layer.setup(map);
            }
          }
        });
      }
      prevLayersRef.current = new Set(current);
      return;
    }

    // Handle overlay layer toggles
    for (const layer of LAYERS) {
      if (layer.id === 'basemap') continue;

      const wasActive = prev.has(layer.id);
      const isActive = current.has(layer.id);

      if (!wasActive && isActive) {
        // Need to wait for style to be loaded if basemap was just toggled
        if (map.isStyleLoaded()) {
          layer.setup(map);
        } else {
          map.once('style.load', () => layer.setup(map));
        }
      } else if (wasActive && !isActive) {
        layer.teardown(map);
      }
    }

    prevLayersRef.current = new Set(current);
  }, [activeLayers]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
