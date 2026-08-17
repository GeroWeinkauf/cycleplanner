import type { LayerDefinition } from './types';

/**
 * EuroVelo — European long-distance cycle routes,
 * bundled as GeoJSON in public/data (see apps/web/public/data/README.md).
 */
export const euroveloLayer: LayerDefinition = {
  id: 'eurovelo',
  label: 'EuroVelo-Routen',
  legend: 'Europäische Fernradrouten als Linien-Overlay',
  group: 'infrastruktur',
  attribution: '<a href="https://en.eurovelo.com/">EuroVelo</a>',
  minZoom: 4,
  defaultVisible: false,
  geojson: {
    url: '/data/eurovelo.geojson',
    lineColor: '#7c3aed',
    lineWidth: 2.5,
    lineOpacity: 0.85,
    minZoom: 4,
  },
};
