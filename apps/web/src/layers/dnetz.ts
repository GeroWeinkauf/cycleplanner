import type { LayerDefinition } from './types';

/**
 * D-Netz — official German national cycling network (D-routes),
 * bundled as GeoJSON in public/data (see apps/web/public/data/README.md).
 */
export const dnetzLayer: LayerDefinition = {
  id: 'dnetz',
  label: 'D-Netz (Radnetz Deutschland)',
  legend: 'Offizielle D-Routen als Linien-Overlay',
  group: 'infrastruktur',
  attribution: '<a href="https://www.radnetz-deutschland.de/">Radnetz Deutschland</a>',
  minZoom: 6,
  defaultVisible: false,
  geojson: {
    url: '/data/d-netz.geojson',
    lineColor: '#e11d48',
    lineWidth: 2.5,
    lineOpacity: 0.85,
    minZoom: 6,
  },
};
