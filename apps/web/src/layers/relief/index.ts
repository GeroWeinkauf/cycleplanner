import type { LayerDefinition } from '../types';
import type { Map } from 'maplibre-gl';

const SOURCE_ID = 'relief-dem';
const LAYER_ID = 'relief-hillshade';

export const reliefLayer: LayerDefinition = {
  id: 'relief',
  label: 'Relief',
  legend: 'Hillshade aus SRTM-Höhendaten (Terrarium-Encoding)',
  attribution:
    '© <a href="https://www.openstreetmap.org/copyright">OSM</a> · Höhendaten: <a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a>',
  minZoom: 3,
  defaultVisible: true,

  setup(map: Map): void {
    if (map.getSource(SOURCE_ID)) return;

    map.addSource(SOURCE_ID, {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      tileSize: 256,
      encoding: 'terrarium',
      minzoom: 3,
      maxzoom: 15,
    });

    map.addLayer(
      {
        id: LAYER_ID,
        type: 'hillshade',
        source: SOURCE_ID,
        layout: { visibility: 'visible' },
        paint: {
          'hillshade-exaggeration': 0.35,
          'hillshade-shadow-color': '#334455',
          'hillshade-highlight-color': '#fffff0',
          'hillshade-accent-color': '#222222',
          'hillshade-illumination-anchor': 'map',
          'hillshade-illumination-direction': 315,
        },
      },
      // Insert below route/polyline layers (first symbol/line layers), above background
      'waterway_tunnel',
    );
  },

  teardown(map: Map): void {
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  },
};
