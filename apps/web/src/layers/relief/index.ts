import type { LayerDefinition } from '../types';

/**
 * Relief overlay: OpenTopoMap tiles (hillshade + contour lines baked in)
 * shown semi-transparently over the basemap.
 */
export const reliefLayer: LayerDefinition = {
  id: 'relief',
  label: 'Relief (OpenTopoMap)',
  legend: 'Hillshade + Höhenlinien als halbtransparentes Overlay',
  group: 'hoehe',
  attribution:
    'Kartendaten © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende, SRTM | Stil © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
  minZoom: 3,
  defaultVisible: true,
  raster: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    maxZoom: 17,
    opacity: 0.45,
  },
};
