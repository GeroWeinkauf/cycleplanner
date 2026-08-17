import type { LayerDefinition } from './types';

/**
 * AWS Terrain Tiles (Terrarium encoding) — DEM for true 3D terrain
 * (map.setTerrain). Open elevation data from the Mapzen Terrain project.
 */
export const terrainLayer: LayerDefinition = {
  id: 'terrain',
  label: '3D-Gelände',
  legend: 'Höhenmodell für 3D-Relief (AWS Terrain Tiles)',
  group: 'hoehe',
  attribution:
    'Höhendaten: <a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a>',
  minZoom: 3,
  defaultVisible: false,
  raster: {
    kind: 'terrain',
    url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    encoding: 'terrarium',
    minZoom: 3,
    maxZoom: 15,
    exaggeration: 1.2,
  },
};
