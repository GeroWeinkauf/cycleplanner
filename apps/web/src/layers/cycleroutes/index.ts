import type { LayerDefinition } from '../types';
import type { Map } from 'maplibre-gl';

const SOURCE_ID = 'cycleroutes-tiles';
const LAYER_ID = 'cycleroutes-raster';

export const cycleroutesLayer: LayerDefinition = {
  id: 'cycleroutes',
  label: 'Radroutennetz',
  legend: 'Lokale, regionale und nationale Fahrradrouten (WaymarkedTrails)',
  attribution:
    '© <a href="https://waymarkedtrails.org/">WaymarkedTrails</a> · <a href="https://www.openstreetmap.org/copyright">OSM</a>',
  minZoom: 7,
  defaultVisible: false,

  setup(map: Map): void {
    if (map.getSource(SOURCE_ID)) return;

    map.addSource(SOURCE_ID, {
      type: 'raster',
      tiles: ['https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png'],
      tileSize: 256,
      minzoom: 7,
      maxzoom: 17,
    });

    map.addLayer(
      {
        id: LAYER_ID,
        type: 'raster',
        source: SOURCE_ID,
        layout: { visibility: 'visible' },
        paint: {
          'raster-opacity': 0.55,
          'raster-fade-duration': 300,
        },
      },
      // Insert above hillshade, below labels
      'relief-hillshade',
    );
  },

  teardown(map: Map): void {
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  },
};
