import type { LayerDefinition } from './types';

/** OpenSeaMap — ferries, harbours & seamarks for coastal/river tours */
export const seamapLayer: LayerDefinition = {
  id: 'seamap',
  label: 'Seekarte (OpenSeaMap)',
  legend: 'Fähren, Häfen und Seezeichen',
  group: 'poi',
  attribution:
    '&copy; <a href="https://www.openseamap.org/">OpenSeaMap</a> · <a href="https://www.openstreetmap.org/copyright">OSM</a>',
  minZoom: 4,
  defaultVisible: false,
  raster: {
    url: 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
    minZoom: 4,
    maxZoom: 18,
    opacity: 0.7,
  },
};
