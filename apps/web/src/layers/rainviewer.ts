import type { LayerDefinition } from './types';

/**
 * RainViewer — real-time rain radar. The MapView fetches
 * weather-maps.json (url below) and uses the latest nowcast frame.
 */
export const rainviewerLayer: LayerDefinition = {
  id: 'rainviewer',
  label: 'Regenradar (RainViewer)',
  legend: 'Niederschlag als Overlay, abgestimmt auf die Startzeit',
  group: 'wetter',
  attribution:
    '&copy; <a href="https://www.rainviewer.com/">RainViewer</a>',
  minZoom: 3,
  defaultVisible: false,
  raster: {
    kind: 'rainviewer',
    url: 'https://api.rainviewer.com/public/weather-maps.json',
    minZoom: 3,
    maxZoom: 12,
    opacity: 0.6,
  },
};
