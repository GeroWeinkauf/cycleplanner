/**
 * Layer definitions for the MapLibre-based MapView.
 *
 * To add a new layer: create a definition and register it in registry.ts.
 * No other code changes needed — the MapView renders raster / WMS /
 * rain-radar / terrain / GeoJSON layers directly from these definitions.
 */

/** How a raster-ish layer is rendered */
export type RasterKind =
  | 'xyz'          // standard XYZ tile template (supports {s} subdomains)
  | 'wms'          // WMS GetMap URL with {bbox-epsg-3857} placeholder
  | 'rainviewer'   // RainViewer radar: url = weather-maps.json API endpoint
  | 'terrain';     // raster-dem used for 3D terrain (map.setTerrain)

export interface RasterTileConfig {
  kind?: RasterKind; // default 'xyz'
  /** XYZ template / WMS GetMap URL / RainViewer API endpoint */
  url: string;
  /** Subdomain letters to expand {s} into (MapLibre has no {s} support) */
  subdomains?: string[];
  minZoom?: number;
  maxZoom?: number;
  /** 0–1, default 1 */
  opacity?: number;
  /** Tile size in pixels, default 256 */
  tileSize?: number;
  /** Encoding for terrain/raster-dem sources */
  encoding?: 'terrarium' | 'mapbox';
  /** Terrain exaggeration (only for kind 'terrain') */
  exaggeration?: number;
  /** Shown in the attribution bar when the layer is active */
  attribution?: string;
}

/** Thematic group shown as a section in the layer panel */
export type LayerGroup =
  | 'infrastruktur'
  | 'hoehe'
  | 'oberflaeche'
  | 'poi'
  | 'natur'
  | 'wetter'
  | 'sonstiges';

/** Ordered group display metadata */
export const LAYER_GROUPS: Array<{ id: LayerGroup; label: string }> = [
  { id: 'infrastruktur', label: 'Fahrradinfrastruktur' },
  { id: 'hoehe', label: 'Höhen & Steigung' },
  { id: 'oberflaeche', label: 'Oberfläche & Belag' },
  { id: 'poi', label: 'POI & ÖPNV' },
  { id: 'natur', label: 'Natur & Landschaft' },
  { id: 'wetter', label: 'Wetter' },
  { id: 'sonstiges', label: 'Sonstiges' },
];

/** GeoJSON overlay fetched from a URL (e.g. bundled network data) */
export interface GeoJsonOverlayConfig {
  /** URL to fetch, e.g. '/data/d-netz.geojson' */
  url: string;
  lineColor?: string;
  lineWidth?: number;
  lineOpacity?: number;
  minZoom?: number;
}

export interface LayerDefinition {
  /** Unique identifier */
  id: string;
  /** Human-readable label shown in the layer panel */
  label: string;
  /** Short description shown below the label in the panel */
  legend?: string;
  /** Thematic group for the layer panel */
  group: LayerGroup;
  /** Attribution text (HTML allowed). Shown permanently when layer is active. */
  attribution: string;
  /** Minimum zoom level at which this layer is visible */
  minZoom?: number;
  /** Whether the layer is visible on initial load */
  defaultVisible: boolean;
  /** Optional raster/WMS/radar/terrain configuration */
  raster?: RasterTileConfig;
  /** Optional GeoJSON overlay configuration */
  geojson?: GeoJsonOverlayConfig;
}
