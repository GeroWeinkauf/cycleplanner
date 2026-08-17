import type { LayerDefinition } from './types';

const ATTRIBUTION =
  '&copy; <a href="https://www.esri.com/">Esri</a> · Quellen: Esri, USGS, NOAA';

/** Esri World Hillshade — terrain shading as overlay on any basemap */
export const hillshadeLayer: LayerDefinition = {
  id: 'hillshade',
  label: 'Hillshade (Esri)',
  legend: 'Gelände-Schummerung als Overlay (hell)',
  group: 'hoehe',
  attribution: ATTRIBUTION,
  minZoom: 3,
  defaultVisible: false,
  raster: {
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
    minZoom: 3,
    maxZoom: 23,
    opacity: 0.55,
  },
};

/** Esri World Hillshade Dark — dark terrain shading */
export const hillshadeDarkLayer: LayerDefinition = {
  id: 'hillshade-dark',
  label: 'Hillshade dunkel (Esri)',
  legend: 'Gelände-Schummerung als Overlay (dunkle Variante)',
  group: 'hoehe',
  attribution: ATTRIBUTION,
  minZoom: 3,
  defaultVisible: false,
  raster: {
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade_Dark/MapServer/tile/{z}/{y}/{x}',
    minZoom: 3,
    maxZoom: 23,
    opacity: 0.55,
  },
};
