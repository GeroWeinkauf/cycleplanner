import type { LayerDefinition } from './types';

/**
 * CyclOSM as semi-transparent overlay: colored road surfaces
 * (asphalt / paving / gravel / natural) plus bike infrastructure.
 */
export const surfaceLayer: LayerDefinition = {
  id: 'surface',
  label: 'Belag & Radwege (CyclOSM)',
  legend: 'Wegoberfläche und Radinfrastruktur farblich als Overlay',
  group: 'oberflaeche',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://www.cyclosm.org/">CyclOSM</a> (CC-BY-SA)',
  minZoom: 5,
  defaultVisible: false,
  raster: {
    url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    minZoom: 5,
    maxZoom: 20,
    opacity: 0.65,
  },
};
