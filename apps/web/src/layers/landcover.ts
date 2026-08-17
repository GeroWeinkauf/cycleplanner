import type { LayerDefinition } from './types';

/**
 * Esri Sentinel-2 Land Cover (10 m, 2017–2025 time series,
 * Impact Observatory / Microsoft / Esri). Dynamic image service —
 * requested via exportImage with the tile bbox (no tile cache).
 */
export const landcoverLayer: LayerDefinition = {
  id: 'landcover',
  label: 'Landnutzung (Esri)',
  legend: 'Wald, Wasser, Acker, Siedlung (10 m, Sentinel-2 Land Cover)',
  group: 'natur',
  attribution:
    '&copy; <a href="https://livingatlas.arcgis.com/landcover/">Esri Land Cover</a> · Impact Observatory · Microsoft',
  minZoom: 3,
  defaultVisible: false,
  raster: {
    kind: 'wms',
    url: 'https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png&f=image',
    minZoom: 3,
    maxZoom: 15,
    opacity: 0.6,
  },
};
