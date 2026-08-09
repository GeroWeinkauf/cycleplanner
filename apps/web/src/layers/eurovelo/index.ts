import type { LayerDefinition } from '../types';
import type { Map } from 'maplibre-gl';

const SOURCE_ID = 'eurovelo-routes';
const LAYER_LINE = 'eurovelo-line';
const LAYER_LABEL = 'eurovelo-label';

/**
 * EuroVelo Layer
 *
 * Fetches EuroVelo (European long-distance cycling routes) from
 * the backend Overpass proxy and renders them with distinct styling.
 * Routes are shown as bold colored lines with ref numbers as labels.
 */
export const euroveloLayer: LayerDefinition = {
  id: 'eurovelo',
  label: 'EuroVelo',
  legend: 'Europaeische Fernradwege (EuroVelo)',
  attribution:
    'EuroVelo-Daten © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://overpass-api.de/">Overpass API</a>',
  minZoom: 6,
  defaultVisible: false,

  setup(map: Map): void {
    if (map.getSource(SOURCE_ID)) return;

    // Fetch EuroVelo data via backend proxy
    const bounds = map.getBounds();
    const bbox = [
      bounds.getSouth().toFixed(4),
      bounds.getWest().toFixed(4),
      bounds.getNorth().toFixed(4),
      bounds.getEast().toFixed(4),
    ].join(',');

    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    // Bold line with eurovelo styling
    map.addLayer({
      id: LAYER_LINE,
      type: 'line',
      source: SOURCE_ID,
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#7c3aed',
        'line-width': 3,
        'line-opacity': 0.8,
      },
    });

    // Route number labels along the line
    map.addLayer({
      id: LAYER_LABEL,
      type: 'symbol',
      source: SOURCE_ID,
      layout: {
        'text-field': ['get', 'ref'],
        'text-font': ['Open Sans Bold'],
        'text-size': 11,
        'symbol-placement': 'line',
        'text-letter-spacing': 0.05,
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#7c3aed',
        'text-halo-width': 1.5,
      },
    });

    // Fetch data
    fetch('/api/layers/eurovelo?bbox=' + bbox)
      .then((res) => res.json())
      .then((data) => {
        const src = map.getSource(SOURCE_ID) as import('maplibre-gl').GeoJSONSource | undefined;
        if (src) src.setData(data);
      })
      .catch(() => {
        // Silently fail — layer shows nothing
      });

    // Update data when map moves
    const onMoveEnd = () => {
      const b = map.getBounds();
      const newBbox = [
        b.getSouth().toFixed(4),
        b.getWest().toFixed(4),
        b.getNorth().toFixed(4),
        b.getEast().toFixed(4),
      ].join(',');
      fetch('/api/layers/eurovelo?bbox=' + newBbox)
        .then((res) => res.json())
        .then((d) => {
          const src = map.getSource(SOURCE_ID) as import('maplibre-gl').GeoJSONSource | undefined;
          if (src) src.setData(d);
        })
        .catch(() => {});
    };

    map.on('moveend', onMoveEnd);
    // Store cleanup reference
    (map as unknown as Record<string, unknown>)['_euroveloMoveEnd'] = onMoveEnd;
  },

  teardown(map: Map): void {
    const onMoveEnd = (map as unknown as Record<string, unknown>)['_euroveloMoveEnd'] as (() => void) | undefined;
    if (onMoveEnd) map.off('moveend', onMoveEnd);
    if (map.getLayer(LAYER_LABEL)) map.removeLayer(LAYER_LABEL);
    if (map.getLayer(LAYER_LINE)) map.removeLayer(LAYER_LINE);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  },
};
