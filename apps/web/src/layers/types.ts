import type { Map } from 'maplibre-gl';

/**
 * A layer that can be registered in the LayerRegistry.
 *
 * To add a new layer to the map, create an object satisfying this interface
 * and add it to the LAYERS array in registry.ts. No other code changes needed.
 */
export interface LayerDefinition {
  /** Unique identifier, used as map layer prefix */
  id: string;
  /** Human-readable label shown in the layer panel */
  label: string;
  /** Short description shown below the label in the panel */
  legend?: string;
  /** Attribution text (HTML allowed). Shown permanently when layer is active. */
  attribution: string;
  /** Minimum zoom level at which this layer is visible */
  minZoom?: number;
  /** Whether the layer is visible on initial load */
  defaultVisible: boolean;
  /** Called when the layer is activated. Add sources and style layers here. */
  setup(map: Map): void;
  /** Called when the layer is deactivated. Remove style layers and sources here. */
  teardown(map: Map): void;
}
