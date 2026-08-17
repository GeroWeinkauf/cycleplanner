import type { LayerDefinition } from '../types';

/**
 * GPX tracks overlay: user-imported GPX tracks are drawn by the MapView
 * (see importedTracks in the waypoint store). This registry entry only
 * provides the panel toggle.
 */
export const tracksLayer: LayerDefinition = {
  id: 'tracks',
  label: 'GPX Tracks',
  legend: 'Importierte GPX-Spuren als Overlay',
  group: 'sonstiges',
  attribution: 'Importierte GPX-Daten',
  minZoom: 5,
  defaultVisible: true,
};
