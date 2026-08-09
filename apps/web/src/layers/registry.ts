import type { LayerDefinition } from './types';
import { basemapLayer } from './basemap';
import { reliefLayer } from './relief';
import { cycleroutesLayer } from './cycleroutes';
import { euroveloLayer } from './eurovelo';
import { poisLayer } from './pois';
import { tracksLayer } from './tracks';

/**
 * Layer Registry
 *
 * Every layer in the application is defined here. To add a new layer,
 * define a LayerDefinition object and add it to this array.
 * The UI (panel, attribution) picks it up automatically.
 */
export const LAYERS: LayerDefinition[] = [
  basemapLayer,
  reliefLayer,
  cycleroutesLayer,
  euroveloLayer,
  poisLayer,
  tracksLayer,
];

/** Look up a layer by id */
export function getLayer(id: string): LayerDefinition | undefined {
  return LAYERS.find((l) => l.id === id);
}
