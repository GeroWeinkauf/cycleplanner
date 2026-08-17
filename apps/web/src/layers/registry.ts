import type { LayerDefinition } from './types';
import { reliefLayer } from './relief';
import { cycleroutesLayer } from './cycleroutes';
import { tracksLayer } from './tracks';
import { mtbLayer } from './mtb';
import { hillshadeLayer, hillshadeDarkLayer } from './hillshade';
import { surfaceLayer } from './surface';
import { railwayLayer } from './railway';
import { transitLayer } from './transit';
import { seamapLayer } from './seamap';
import { landcoverLayer } from './landcover';
import { snowLayer } from './snow';
import { rainviewerLayer } from './rainviewer';
import { terrainLayer } from './terrain';
import { dnetzLayer } from './dnetz';
import { euroveloLayer } from './eurovelo';

/**
 * Layer Registry — toggleable overlays shown in the layer panel.
 * Basemaps live in basemaps.ts (exclusive choice, always exactly one active).
 * Satellite imagery is intentionally reduced to the single Esri basemap
 * to keep the bundle lean (no WMS satellite overlays for now).
 *
 * All entries are data-driven: the MapView renders `raster` (XYZ/WMS/
 * rain radar/terrain) and `geojson` overlays directly from these definitions.
 * The panel groups them by `group`.
 */
export const LAYERS: LayerDefinition[] = [
  // Fahrradinfrastruktur
  cycleroutesLayer,
  mtbLayer,
  dnetzLayer,
  euroveloLayer,
  // Höhen & Steigung
  reliefLayer,
  hillshadeLayer,
  hillshadeDarkLayer,
  terrainLayer,
  // Oberfläche & Belag
  surfaceLayer,
  // POI & ÖPNV
  railwayLayer,
  transitLayer,
  seamapLayer,
  // Natur & Landschaft
  landcoverLayer,
  snowLayer,
  // Wetter
  rainviewerLayer,
  // Sonstiges
  tracksLayer,
];

/** Look up a layer by id */
export function getLayer(id: string): LayerDefinition | undefined {
  return LAYERS.find((l) => l.id === id);
}
