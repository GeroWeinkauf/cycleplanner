import type { LayerDefinition } from '../types';
import type { Map, GeoJSONSource } from 'maplibre-gl';

const SOURCE_ID = 'poi-markers';
const LAYER_CIRCLE = 'poi-circles';
const LAYER_LABEL = 'poi-labels';

/**
 * POI Layer (P4-1)
 *
 * Displays points of interest as colored circles on the map.
 * POIs are fetched from the backend and set on a GeoJSON source.
 * This layer manages the source + style layers; the data is pushed
 * externally through the source.setData() API.
 */
export const poisLayer: LayerDefinition = {
  id: 'pois',
  label: 'POIs',
  legend: 'Points of Interest aus OpenStreetMap (14 Kategorien)',
  attribution:
    'POI-Daten © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  minZoom: 8,
  defaultVisible: false,

  setup(map: Map): void {
    if (map.getSource(SOURCE_ID)) return;

    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50,
    });

    // Clustered circles
    map.addLayer({
      id: LAYER_CIRCLE,
      type: 'circle',
      source: SOURCE_ID,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#6366f1',
        'circle-radius': ['step', ['get', 'point_count'], 15, 10, 20, 30, 28],
        'circle-opacity': 0.8,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });

    // Cluster count labels
    map.addLayer({
      id: LAYER_LABEL,
      type: 'symbol',
      source: SOURCE_ID,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-font': ['Open Sans Bold'],
        'text-size': 12,
      },
      paint: {
        'text-color': '#ffffff',
      },
    });

    // Unclustered points as colored circles by category
    // We use a simple circle with data-driven color (simplified)
    map.addLayer({
      id: 'poi-unclustered',
      type: 'circle',
      source: SOURCE_ID,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': [
          'match',
          ['get', 'category'],
          'water', '#3b82f6',
          'toilets', '#6366f1',
          'restaurant', '#f97316',
          'cafe', '#a855f7',
          'bakery', '#d97706',
          'supermarket', '#22c55e',
          'bikeShop', '#06b6d4',
          'bikeRepair', '#0891b2',
          'shelter', '#78716c',
          'campsite', '#84cc16',
          'hotel', '#e11d48',
          'trainStation', '#ef4444',
          'viewpoint', '#14b8a6',
          'picnic', '#65a30d',
          '#9ca3af', // fallback
        ],
        'circle-radius': 6,
        'circle-opacity': 0.85,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
      },
    });
  },

  teardown(map: Map): void {
    const layers = [LAYER_CIRCLE, LAYER_LABEL, 'poi-unclustered'];
    for (const lid of layers) {
      if (map.getLayer(lid)) map.removeLayer(lid);
    }
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  },
};

/** Source ID used by the POI layer (exported for external data updates) */
export { SOURCE_ID as POI_SOURCE_ID };
