import type { LayerDefinition } from './types';
import { reliefLayer } from './relief';
import { cycleroutesLayer } from './cycleroutes';
import { tracksLayer } from './tracks';

/**
 * Layer Registry
 *
 * Only layers with actual Leaflet implementations (Map.tsx).
 * Basiskarte (OSM) is always on, no toggle needed.
 * EuroVelo & POIs removed – no working data source.
 */
export const LAYERS: LayerDefinition[] = [
  reliefLayer,
  cycleroutesLayer,
  tracksLayer,
];

/** Look up a layer by id */
export function getLayer(id: string): LayerDefinition | undefined {
  return LAYERS.find((l) => l.id === id);
}