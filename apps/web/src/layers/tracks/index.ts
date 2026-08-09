import type { LayerDefinition } from '../types';
import type { Map } from 'maplibre-gl';

const SOURCE_ID = 'tracks-overlay';
const LAYER_ID = 'tracks-line';

/**
 * Tracks Overlay Layer (P4-3, optional)
 *
 * A pure display layer for user-imported GPX tracks.
 * Tracks are set externally via source.setData().
 * This layer just provides the source and styling.
 */
export const tracksLayer: LayerDefinition = {
  id: 'tracks',
  label: 'GPX Tracks',
  legend: 'Importierte GPX-Spuren als Overlay',
  attribution: 'Importierte GPX-Daten',
  minZoom: 5,
  defaultVisible: true,

  setup(map: Map): void {
    if (map.getSource(SOURCE_ID)) return;

    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    map.addLayer({
      id: LAYER_ID,
      type: 'line',
      source: SOURCE_ID,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#0891b2',
        'line-width': 2,
        'line-opacity': 0.6,
        'line-dasharray': [8, 4],
      },
    });
  },

  teardown(map: Map): void {
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  },
};

/** Source ID for external data updates */
export { SOURCE_ID as TRACKS_SOURCE_ID };
