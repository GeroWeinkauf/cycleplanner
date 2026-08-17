import type { LayerDefinition } from '../types';

/**
 * Marked bicycle routes (D-Netz, EuroVelo, regional & local) from OSM
 * route relations, rendered by WaymarkedTrails.
 */
export const cycleroutesLayer: LayerDefinition = {
  id: 'cycleroutes',
  label: 'Radroutennetz',
  legend: 'Markierte Radrouten (regional, national, EuroVelo)',
  group: 'infrastruktur',
  attribution:
    '&copy; <a href="https://waymarkedtrails.org/">WaymarkedTrails</a> · <a href="https://www.openstreetmap.org/copyright">OSM</a>',
  minZoom: 7,
  defaultVisible: false,
  raster: {
    url: 'https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png',
    minZoom: 7,
    maxZoom: 17,
    opacity: 0.55,
  },
};
