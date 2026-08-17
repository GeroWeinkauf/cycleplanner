import type { LayerDefinition } from './types';

/** OpenSnowMap — winter pistes/trails */
export const snowLayer: LayerDefinition = {
  id: 'snow',
  label: 'Winterkarte (OpenSnowMap)',
  legend: 'Pisten, Loipen und Lifte',
  group: 'natur',
  attribution:
    '&copy; <a href="https://www.opensnowmap.org/">OpenSnowMap</a> · <a href="https://www.openstreetmap.org/copyright">OSM</a>',
  minZoom: 4,
  defaultVisible: false,
  raster: {
    url: 'https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png',
    minZoom: 4,
    maxZoom: 16,
    opacity: 0.7,
  },
};
