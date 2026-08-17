import { useEffect, useRef } from 'react';
import {
  Map as MlMap,
  Marker,
  Popup,
  NavigationControl,
  ScaleControl,
  LngLatBounds,
} from 'maplibre-gl';
import type {
  GeoJSONSource,
  MapMouseEvent,
  MapLayerMouseEvent,
  PointLike,
} from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useWaypointStore } from '../store/useWaypointStore';
import { decodePolyline, nearestPointOnLine } from '../lib/polyline';
import { pickRadarFrame, radarTileUrl } from '../lib/radar';
import { LAYERS } from '../layers/registry';
import { DEFAULT_BASEMAP_ID, expandTileUrls, getBasemap } from '../layers/basemaps';
import type { RasterTileConfig } from '../layers/types';
import type { RouteResponse, Poi } from '@cycleplanner/shared';

interface MapProps {
  route?: RouteResponse | null;
  routeB?: RouteResponse | null;
  showRoute?: boolean;
  isFetching: boolean;
  highlightDistance?: number | null;
  activeLayers?: Set<string>;
  basemapId?: string;
  poiMarkers?: Poi[];
  /** Optional ride start time — the rain radar shows the frame closest to it */
  weatherStartTimeMs?: number | null;
  onMapFlyTo?: (fn: (lng: number, lat: number) => void) => void;
  onMapFitBounds?: (
    fn: (
      points: Array<{ lat: number; lng: number }>,
      opts?: { padding?: [number, number]; maxZoom?: number; animate?: boolean },
    ) => void,
  ) => void;
  onBboxChange?: (bbox: string) => void;
  onScaleChange?: (scaleMeters: number) => void;
  onPoiRightClick?: (poi: Poi) => void;
  onPoiClick?: (poi: Poi) => void;
}

// Simplified Sachsen + Sachsen-Anhalt boundary
const SAXONY_BOUNDARY: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Sachsen + Sachsen-Anhalt' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [10.5, 53.0], [13.5, 53.0], [13.5, 50.2], [10.5, 50.2], [10.5, 53.0],
        ]],
      },
    },
  ],
};

/** Vector layer ids — raster overlays are inserted below these */
const VECTOR_LAYER_IDS = [
  'saxony-boundary',
  'tracks-lines',
  'route-b',
  'route-line',
  'blocked-line',
  'highlight-dot',
  'dnetz-lines',
  'eurovelo-lines',
];

/** First existing vector layer id, used as insertion point for raster overlays */
function firstVectorLayerId(map: MlMap): string | undefined {
  for (const id of VECTOR_LAYER_IDS) {
    if (map.getLayer(id)) return id;
  }
  return undefined;
}

function boundsOf(coords: Array<[number, number]>): LngLatBounds {
  const bounds = new LngLatBounds();
  for (const [lng, lat] of coords) bounds.extend([lng, lat]);
  return bounds;
}

function lineFeatureCollection(coords: Array<[number, number]>): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: coords },
      },
    ],
  };
}

function pointFeatureCollection(lng: number, lat: number): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [lng, lat] },
      },
    ],
  };
}

/** Add a raster source for an XYZ/WMS config */
function addRasterSource(map: MlMap, id: string, cfg: RasterTileConfig) {
  if (map.getSource(id)) return;
  const tiles = cfg.kind === 'wms' ? [cfg.url] : expandTileUrls(cfg.url, cfg.subdomains);
  map.addSource(id, {
    type: 'raster',
    tiles,
    tileSize: cfg.tileSize ?? 256,
    minzoom: cfg.minZoom,
    maxzoom: cfg.maxZoom,
  });
}

export default function MapView(props: MapProps) {
  const { route, routeB, showRoute, isFetching, highlightDistance, activeLayers, basemapId,
    poiMarkers, weatherStartTimeMs, onMapFlyTo, onBboxChange, onScaleChange, onPoiRightClick, onPoiClick } = props;
  const { onMapFitBounds } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const wpMarkersRef = useRef<Marker[]>([]);
  const supermarketMarkersRef = useRef<Marker[]>([]);
  const routeCoordsRef = useRef<Array<[number, number]>>([]);
  const geoJsonCacheRef = useRef<Record<string, FeatureCollection>>({});

  const { waypoints, addWaypoint, moveWaypoint, removeWaypoint, blockedSegment, setBlockedSegment, importedTracks } = useWaypointStore();
  const showTracks = activeLayers?.has('tracks');

  // ── Init map ──────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MlMap({
      container: containerRef.current,
      style: { version: 8, sources: {}, layers: [] },
      center: [12.3731, 51.3397],
      zoom: 12,
      attributionControl: false,
    });

    map.addControl(new NavigationControl(), 'top-left');
    map.addControl(new ScaleControl({ maxWidth: 120 }), 'bottom-right');

    // Saxony boundary outline
    map.addSource('saxony', { type: 'geojson', data: SAXONY_BOUNDARY });
    map.addLayer({
      id: 'saxony-boundary',
      type: 'line',
      source: 'saxony',
      paint: { 'line-color': '#f97316', 'line-width': 2, 'line-opacity': 0.6, 'line-dasharray': [2, 1] },
    });

    // Left click = add waypoint for routing
    map.on('click', (e: MapMouseEvent) => {
      addWaypoint(e.lngLat.lat, e.lngLat.lng);
    });

    // Shift-click on the route line = block a segment
    map.on('click', 'route-line', (e: MapLayerMouseEvent) => {
      const me = e.originalEvent as MouseEvent;
      if (!me.shiftKey) return;
      if (routeCoordsRef.current.length < 2) return;
      const nearest = nearestPointOnLine([e.lngLat.lng, e.lngLat.lat], routeCoordsRef.current);
      const start = Math.max(0, nearest.index - 5);
      const end = Math.min(routeCoordsRef.current.length - 1, nearest.index + 5);
      setBlockedSegment(routeCoordsRef.current.slice(start, end + 1));
    });

    const reportBbox = () => {
      const b = map.getBounds();
      onBboxChange?.([b.getSouth().toFixed(4), b.getWest().toFixed(4), b.getNorth().toFixed(4), b.getEast().toFixed(4)].join(','));
      // Report the scale-bar value (Maßstab) so the parent can gate POI loading on it.
      // Mirrors a scale control with maxWidth 120.
      const p1 = map.unproject([0, 0] as PointLike);
      const p2 = map.unproject([120, 0] as PointLike);
      const maxMeters = p1.distanceTo(p2);
      const pow10 = Math.pow(10, String(Math.floor(maxMeters)).length - 1);
      let d = maxMeters / pow10;
      d = d >= 10 ? 10 : d >= 5 ? 5 : d >= 3 ? 3 : d >= 2 ? 2 : 1;
      onScaleChange?.(pow10 * d);
    };
    map.on('moveend', reportBbox);
    map.on('zoomend', reportBbox);
    reportBbox();

    onMapFlyTo?.((lng: number, lat: number) => {
      map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 14), duration: 800 });
    });

    onMapFitBounds?.((pts, opts) => {
      if (pts.length === 0) return;
      const bounds = new LngLatBounds();
      for (const p of pts) bounds.extend([p.lng, p.lat]);
      map.fitBounds(bounds, {
        padding: opts?.padding
          ? { top: opts.padding[0], bottom: opts.padding[0], left: opts.padding[1], right: opts.padding[1] }
          : 30,
        maxZoom: opts?.maxZoom ?? 15,
        animate: opts?.animate ?? false,
        duration: 600,
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Basemap switching (exclusive, one active) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const bm = getBasemap(basemapId ?? DEFAULT_BASEMAP_ID);
    if (map.getSource('basemap')) map.removeSource('basemap');
    map.addSource('basemap', {
      type: 'raster',
      tiles: expandTileUrls(bm.url, bm.subdomains),
      tileSize: bm.tileSize ?? 256,
      maxzoom: bm.maxZoom ?? 19,
    });
    if (!map.getLayer('basemap')) {
      map.addLayer({ id: 'basemap', type: 'raster', source: 'basemap' });
    }
  }, [basemapId]);

  // ── Raster overlay toggling (driven by the layer registry) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const layer of LAYERS) {
      const cfg = layer.raster;
      if (!cfg || cfg.kind === 'rainviewer') continue; // radar handled separately
      const id = 'overlay-' + layer.id;
      const shouldShow = activeLayers?.has(layer.id);

      if (shouldShow && !map.getSource(id)) {
        addRasterSource(map, id, cfg);
      }
      if (shouldShow && !map.getLayer(id)) {
        map.addLayer({
          id,
          type: 'raster',
          source: id,
          minzoom: cfg.minZoom ?? layer.minZoom,
          maxzoom: cfg.maxZoom,
          paint: {
            'raster-opacity': cfg.opacity ?? 1,
            'raster-fade-duration': 300,
          },
        }, firstVectorLayerId(map));
      } else if (!shouldShow) {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      }
    }
  }, [activeLayers]);

  // ── 3D terrain (raster-dem + setTerrain) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layer = LAYERS.find((l) => l.id === 'terrain');
    const cfg = layer?.raster;
    if (!cfg) return;
    const active = activeLayers?.has('terrain');

    const apply = () => {
      if (active) {
        if (!map.getSource('terrain-dem')) {
          map.addSource('terrain-dem', {
            type: 'raster-dem',
            tiles: [cfg.url],
            tileSize: cfg.tileSize ?? 256,
            encoding: cfg.encoding ?? 'mapbox',
            minzoom: cfg.minZoom,
            maxzoom: cfg.maxZoom,
          });
        }
        map.setTerrain({ source: 'terrain-dem', exaggeration: cfg.exaggeration ?? 1 });
      } else {
        map.setTerrain(null);
        if (map.getSource('terrain-dem')) map.removeSource('terrain-dem');
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [activeLayers]);

  // ── Rain radar (RainViewer) ─────────────────
  // Frame selection follows the ride start time: with an explicit start
  // time the closest forecast/past frame is shown, otherwise "now".
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layer = LAYERS.find((l) => l.id === 'rainviewer');
    const cfg = layer?.raster;
    if (!cfg) return;
    const id = 'overlay-rainviewer';
    const active = activeLayers?.has('rainviewer');
    const targetMs = weatherStartTimeMs ?? Date.now();

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const cleanup = () => {
      if (timer) clearInterval(timer);
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    };

    const load = () => {
      if (cancelled || !mapRef.current) return;
      fetch(cfg.url)
        .then((r) => r.json())
        .then((data: {
          host?: string;
          radar?: {
            past?: Array<{ path: string; time: number }>;
            nowcast?: Array<{ path: string; time: number }>;
          };
        }) => {
          if (cancelled) return;
          const host = data.host;
          const past = data.radar?.past ?? [];
          const nowcast = data.radar?.nowcast ?? [];
          const frames = [...past, ...nowcast];
          if (!host || frames.length === 0) return;
          const frame = pickRadarFrame(frames, targetMs);
          if (!frame) return;
          const url = radarTileUrl(host, frame.path);
          if (map.getSource(id)) map.removeSource(id);
          map.addSource(id, {
            type: 'raster',
            tiles: [url],
            tileSize: 256,
            minzoom: cfg.minZoom,
            maxzoom: cfg.maxZoom,
          });
          if (!map.getLayer(id)) {
            map.addLayer({
              id,
              type: 'raster',
              source: id,
              minzoom: cfg.minZoom,
              maxzoom: cfg.maxZoom,
              paint: { 'raster-opacity': cfg.opacity ?? 0.6, 'raster-fade-duration': 300 },
            }, firstVectorLayerId(map));
          }
        })
        .catch(() => { /* radar unavailable — keep silently inactive */ });
    };

    if (active) {
      load();
      timer = setInterval(load, 10 * 60 * 1000); // refresh every 10 min
    } else {
      cleanup();
    }
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [activeLayers, weatherStartTimeMs]);

  // ── GeoJSON overlays (D-Netz, EuroVelo) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const controllers: AbortController[] = [];

    for (const layer of LAYERS) {
      const cfg = layer.geojson;
      if (!cfg) continue;
      const srcId = layer.id + '-geojson';
      const lyrId = layer.id + '-lines';
      const active = activeLayers?.has(layer.id);

      if (!active) {
        if (map.getLayer(lyrId)) map.removeLayer(lyrId);
        if (map.getSource(srcId)) map.removeSource(srcId);
        continue;
      }

      const addLayerIfMissing = () => {
        if (!map.getLayer(lyrId) && map.getSource(srcId)) {
          map.addLayer({
            id: lyrId,
            type: 'line',
            source: srcId,
            minzoom: cfg.minZoom ?? layer.minZoom,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': cfg.lineColor ?? '#0891b2',
              'line-width': cfg.lineWidth ?? 2.5,
              'line-opacity': cfg.lineOpacity ?? 0.85,
            },
          });
        }
      };

      if (map.getSource(srcId)) {
        addLayerIfMissing();
        continue;
      }

      const cached = geoJsonCacheRef.current[layer.id];
      if (cached) {
        map.addSource(srcId, { type: 'geojson', data: cached });
        addLayerIfMissing();
        continue;
      }

      const ctrl = new AbortController();
      controllers.push(ctrl);
      fetch(cfg.url, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((fc: FeatureCollection) => {
          geoJsonCacheRef.current[layer.id] = fc;
          if (activeLayers?.has(layer.id) && !map.getSource(srcId)) {
            map.addSource(srcId, { type: 'geojson', data: fc });
            addLayerIfMissing();
          }
        })
        .catch(() => { /* network data missing — ignore */ });
    }

    return () => controllers.forEach((c) => c.abort());
  }, [activeLayers]);

  // ── POI markers (supermarkets & lakes) ─────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    supermarketMarkersRef.current.forEach((m) => m.remove());
    supermarketMarkersRef.current = [];

    if (!poiMarkers || poiMarkers.length === 0) return;

    for (const poi of poiMarkers) {
      const isLake = poi.category === 'lake';
      const el = document.createElement('div');
      el.className = 'poi-marker';
      el.style.cursor = 'pointer';
      el.style.pointerEvents = 'auto';
      const icon = isLake ? '🏊' : '🛒';
      const bg = isLake ? '#0ea5e9' : '#22c55e';
      const radius = isLake ? '50%' : '6px';
      el.innerHTML = `<div style="
        width:28px;height:28px;background:${bg};border:2px solid white;
        border-radius:${radius};display:flex;align-items:center;justify-content:center;
        font-size:16px;box-shadow:0 2px 6px rgba(0,0,0,0.5);">
        ${icon}
      </div>`;
      el.title = poi.name || (isLake ? 'Badesee' : 'Supermarkt');

      const marker = new Marker({ element: el, anchor: 'center' })
        .setLngLat([poi.lng, poi.lat])
        .addTo(map);

      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        onPoiRightClick?.(poi);
      });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onPoiClick?.(poi);
      });

      supermarketMarkersRef.current.push(marker);
    }
  }, [poiMarkers, onPoiRightClick, onPoiClick]);

  // ── Waypoint markers ──────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    wpMarkersRef.current.forEach((m) => m.remove());
    wpMarkersRef.current = [];

    waypoints.forEach((wp, i) => {
      const isFirst = i === 0;
      const isLast = waypoints.length > 1 && i === waypoints.length - 1;
      const iconHtml = isFirst
        ? '<div style="background:#16a34a;color:white;border:2px solid white;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;box-shadow:0 1px 3px rgba(0,0,0,0.3)">S</div>'
        : isLast
        ? '<div style="background:#dc2626;color:white;border:2px solid white;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;box-shadow:0 1px 3px rgba(0,0,0,0.3)">E</div>'
        : '<div style="background:#2563eb;color:white;border:2px solid white;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;box-shadow:0 1px 3px rgba(0,0,0,0.3)">' + (i + 1) + '</div>';

      const el = document.createElement('div');
      el.className = 'wp-div-icon';
      el.innerHTML = iconHtml;

      const marker = new Marker({ element: el, anchor: 'center', draggable: true })
        .setLngLat([wp.lng, wp.lat])
        .addTo(map);

      marker.on('dragend', () => {
        const pos = marker.getLngLat();
        moveWaypoint(wp.id, pos.lat, pos.lng);
      });

      marker.on('click', () => {
        const popupHtml = `<div style="font-size:11px;font-family:system-ui,sans-serif;min-width:100px">
          <div style="font-weight:600;margin-bottom:4px;color:#374151">
            ${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}
          </div>
          <button class="wp-popup-del-btn" data-wpid="${wp.id}" style="width:100%;padding:3px 6px;border:1px solid #fca5a5;border-radius:4px;background:#fef2f2;color:#dc2626;font-size:11px;cursor:pointer">
            ✕ Entfernen
          </button>
        </div>`;
        const popup = new Popup({ offset: [0, -14], closeButton: true, className: 'wp-popup' })
          .setLngLat([wp.lng, wp.lat])
          .setHTML(popupHtml)
          .addTo(map);
        popup.on('open', () => {
          const btn = popup.getElement()?.querySelector('.wp-popup-del-btn') as HTMLElement | null;
          btn?.addEventListener('click', (ev) => {
            ev.stopPropagation();
            removeWaypoint(wp.id);
            popup.remove();
          });
        });
      });

      wpMarkersRef.current.push(marker);
    });
  }, [waypoints, moveWaypoint, removeWaypoint]);

  // ── Route line (controlled by showRoute) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const srcId = 'route';
    const lyrId = 'route-line';

    if (!route?.geometry || !showRoute) {
      if (map.getLayer(lyrId)) map.removeLayer(lyrId);
      if (map.getSource(srcId)) map.removeSource(srcId);
      routeCoordsRef.current = [];
      return;
    }

    const coords = decodePolyline(route.geometry);
    routeCoordsRef.current = coords;
    const fc = lineFeatureCollection(coords);

    if (map.getSource(srcId)) {
      (map.getSource(srcId) as GeoJSONSource).setData(fc);
    } else {
      map.addSource(srcId, { type: 'geojson', data: fc });
      map.addLayer({
        id: lyrId,
        type: 'line',
        source: srcId,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#dc2626', 'line-width': 4, 'line-opacity': 0.85 },
      });
    }

    map.fitBounds(boundsOf(coords), { padding: 40, maxZoom: 15 });
  }, [route, showRoute]);

  // ── Imported GPX tracks ───────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const srcId = 'tracks';
    const lyrId = 'tracks-lines';

    if (!showTracks || Object.keys(importedTracks).length === 0) {
      if (map.getLayer(lyrId)) map.removeLayer(lyrId);
      if (map.getSource(srcId)) map.removeSource(srcId);
      return;
    }

    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: Object.entries(importedTracks).map(([filename, geometry]) => ({
        type: 'Feature',
        properties: { name: filename },
        geometry: { type: 'LineString', coordinates: decodePolyline(geometry) },
      })),
    };

    if (map.getSource(srcId)) {
      (map.getSource(srcId) as GeoJSONSource).setData(fc);
    } else {
      map.addSource(srcId, { type: 'geojson', data: fc });
      map.addLayer({
        id: lyrId,
        type: 'line',
        source: srcId,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#0891b2', 'line-width': 4, 'line-opacity': 0.75 },
      });
    }
  }, [importedTracks, showTracks]);

  // ── Comparison route B ────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const srcId = 'route-b';
    const lyrId = 'route-b';

    if (!routeB?.geometry) {
      if (map.getLayer(lyrId)) map.removeLayer(lyrId);
      if (map.getSource(srcId)) map.removeSource(srcId);
      return;
    }

    const fc = lineFeatureCollection(decodePolyline(routeB.geometry));
    if (map.getSource(srcId)) {
      (map.getSource(srcId) as GeoJSONSource).setData(fc);
    } else {
      map.addSource(srcId, { type: 'geojson', data: fc });
      map.addLayer({
        id: lyrId,
        type: 'line',
        source: srcId,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#7c3aed', 'line-width': 3, 'line-opacity': 0.6, 'line-dasharray': [2, 1] },
      });
    }
  }, [routeB]);

  // ── Blocked segment ───────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const srcId = 'blocked';
    const lyrId = 'blocked-line';

    if (!blockedSegment || blockedSegment.length < 2) {
      if (map.getLayer(lyrId)) map.removeLayer(lyrId);
      if (map.getSource(srcId)) map.removeSource(srcId);
      return;
    }

    const fc = lineFeatureCollection(blockedSegment);
    if (map.getSource(srcId)) {
      (map.getSource(srcId) as GeoJSONSource).setData(fc);
    } else {
      map.addSource(srcId, { type: 'geojson', data: fc });
      map.addLayer({
        id: lyrId,
        type: 'line',
        source: srcId,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#f59e0b', 'line-width': 6, 'line-opacity': 0.7, 'line-dasharray': [1.5, 0.75] },
      });
    }
  }, [blockedSegment]);

  // ── Elevation highlight marker ─────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const srcId = 'highlight';
    const lyrId = 'highlight-dot';

    if (highlightDistance == null || !route?.geometry || route.summary.distanceKm <= 0) {
      if (map.getLayer(lyrId)) map.removeLayer(lyrId);
      if (map.getSource(srcId)) map.removeSource(srcId);
      return;
    }

    const fraction = Math.max(0, Math.min(1, highlightDistance / route.summary.distanceKm));
    const coords = routeCoordsRef.current;
    if (coords.length === 0) return;
    const idx = Math.min(Math.round(fraction * (coords.length - 1)), coords.length - 1);
    const [lng, lat] = coords[idx];
    const fc = pointFeatureCollection(lng, lat);

    if (map.getSource(srcId)) {
      (map.getSource(srcId) as GeoJSONSource).setData(fc);
    } else {
      map.addSource(srcId, { type: 'geojson', data: fc });
      map.addLayer({
        id: lyrId,
        type: 'circle',
        source: srcId,
        paint: {
          'circle-radius': 9,
          'circle-color': '#ef4444',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
    }
  }, [highlightDistance, route]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
