/**
 * Basemap registry — selectable base maps (exclusive choice in the layer panel).
 * The OSM standard map remains the default.
 */

export interface BasemapDefinition {
  id: string;
  label: string;
  /** Attribution text (HTML allowed), shown permanently */
  attribution: string;
  /** XYZ tile URL template, may contain {s} for subdomains */
  url: string;
  subdomains?: string[];
  maxZoom?: number;
  tileSize?: number;
}

export const DEFAULT_BASEMAP_ID = 'osm';

export const BASEMAPS: BasemapDefinition[] = [
  {
    id: 'osm',
    label: 'OSM Standard',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
  },
  {
    id: 'cyclosm',
    label: 'CyclOSM (Fahrrad)',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://www.cyclosm.org/">CyclOSM</a> (CC-BY-SA)',
    url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    maxZoom: 20,
  },
  {
    id: 'osm-de',
    label: 'OSM DE (deutsch)',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://www.openstreetmap.de/">OpenStreetMap DE</a>',
    url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
    maxZoom: 19,
  },
  {
    id: 'opentopomap',
    label: 'OpenTopoMap',
    attribution:
      'Kartendaten © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende, SRTM | Stil © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    maxZoom: 17,
  },
  {
    id: 'carto',
    label: 'CARTO Positron (hell)',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c', 'd'],
    maxZoom: 20,
  },
  {
    id: 'esri-imagery',
    label: 'Esri Satellit',
    attribution:
      '&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics, and the GIS User Community',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 23,
  },
];

export function getBasemap(id: string): BasemapDefinition {
  return BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0];
}

/** Expand {s} into concrete subdomain URLs (MapLibre does not support {s}) */
export function expandTileUrls(template: string, subdomains?: string[]): string[] {
  if (!subdomains || subdomains.length === 0 || !template.includes('{s}')) return [template];
  return subdomains.map((s) => template.replaceAll('{s}', s));
}
