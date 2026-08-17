import type { LayerDefinition } from './types';

/** OpenRailwayMap — railway lines & stations for bike+ride planning */
export const railwayLayer: LayerDefinition = {
  id: 'railway',
  label: 'Bahn (OpenRailwayMap)',
  legend: 'Bahnstrecken und Bahnhöfe für Bike+Ride',
  group: 'poi',
  attribution:
    '&copy; <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a> · <a href="https://www.openstreetmap.org/copyright">OSM</a>',
  minZoom: 5,
  defaultVisible: false,
  raster: {
    url: 'https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    minZoom: 5,
    maxZoom: 19,
    opacity: 0.7,
  },
};
