import type { LayerDefinition } from '../types';
import type { Map, StyleSpecification } from 'maplibre-gl';

// ── Simple inline basemap style ─────────────
// Uses OpenStreetMap raster tiles (no external style server needed).
// Desaturated colors so route overlays stand out.
const BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  name: 'CyclePlanner Basemap',
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
  },
  // Desaturated overlay to mute the basemap
  glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm',
      paint: {
        'raster-opacity': 0.55,
        'raster-saturation': -2,
        'raster-contrast': 0.6,
        'raster-brightness-min': 0.15,
        'raster-brightness-max': 0.85,
      },
    },
  ],
};

// ── Layer Definition ────────────────────────
export const basemapLayer: LayerDefinition = {
  id: 'basemap',
  label: 'Basiskarte',
  legend: 'OpenStreetMap · Farben entsaettigt',
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  minZoom: 0,
  defaultVisible: true,

  setup(map: Map): void {
    map.setStyle(BASEMAP_STYLE);
  },

  teardown(_map: Map): void {
    // Toggling off shows blank background
  },
};

export { BASEMAP_STYLE as desaturatedStyle };
