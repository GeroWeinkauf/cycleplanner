import type { LayerDefinition } from './types';

/** MTB routes & singletrails (WaymarkedTrails MTB overlay) */
export const mtbLayer: LayerDefinition = {
  id: 'mtb',
  label: 'MTB-Routen',
  legend: 'Mountainbike-Routen und Singletrails als Overlay',
  group: 'infrastruktur',
  attribution:
    '&copy; <a href="https://mtb.waymarkedtrails.org/">WaymarkedTrails MTB</a> · <a href="https://www.openstreetmap.org/copyright">OSM</a>',
  minZoom: 7,
  defaultVisible: false,
  raster: {
    url: 'https://tile.waymarkedtrails.org/mtb/{z}/{x}/{y}.png',
    minZoom: 7,
    maxZoom: 17,
    opacity: 0.55,
  },
};
