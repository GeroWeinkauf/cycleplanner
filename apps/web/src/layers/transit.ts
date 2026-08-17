import type { LayerDefinition } from './types';

/** ÖPNVKarte — public transport network (bus/rail/stations) */
export const transitLayer: LayerDefinition = {
  id: 'transit',
  label: 'ÖPNV-Netz',
  legend: 'Bus-/Bahnlinien und Stationen (ÖPNVKarte)',
  group: 'poi',
  attribution:
    '&copy; <a href="https://www.öpnvkarte.de/">ÖPNVKarte</a> · <a href="https://www.openstreetmap.org/copyright">OSM</a>',
  minZoom: 5,
  defaultVisible: false,
  raster: {
    url: 'https://tileserver.memomaps.de/tilegen/{z}/{x}/{y}.png',
    minZoom: 5,
    maxZoom: 18,
    opacity: 0.6,
  },
};
