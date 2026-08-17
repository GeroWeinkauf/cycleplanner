import { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import type {
  Map as MlMap,
  Marker,
  Popup,
  LngLatBounds,
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
import { POI_CATEGORIES } from '@cycleplanner/shared';
import type { MapViewProps } from './mapTypes';

// Runtime values from the default namespace — works across MapLibre versions
// (v6 named exports, v3 CJS/AMD interop where LngLatBounds lacks a named export).
const {
  Map: MlMapCtor,
  Marker: MarkerCtor,
  Popup: PopupCtor,
  NavigationControl,
  ScaleControl,
  LngLatBounds: LngLatBoundsCtor,
} = maplibregl;

interface MapProps extends MapViewProps {
  /** Called when MapLibre cannot render (WebGL unavailable) — switch to Leaflet fallback */
  onWebGLFallback?: () => void;
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
  const bounds = new LngLatBoundsCtor();
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
    // MapLibre validates source specs strictly — only include defined values
    ...(cfg.minZoom !== undefined ? { minzoom: cfg.minZoom } : {}),
    ...(cfg.maxZoom !== undefined ? { maxzoom: cfg.maxZoom } : {}),
  });
}

/** Marker style per POI category (icon comes from POI_CATEGORIES metadata) */
const POI_MARKER_STYLES: Record<string, { bg: string; radius?: string; title: string }> = {
  supermarket: { bg: '#22c55e', title: 'Supermarkt' },
  lake: { bg: '#0ea5e9', radius: '50%', title: 'Badesee' },
  water: { bg: '#0284c7', radius: '50%', title: 'Trinkwasser' },
  toilets: { bg: '#64748b', title: 'WC' },
  bench: { bg: '#b45309', title: 'Bank' },
  picnic: { bg: '#65a30d', title: 'Picknickplatz' },
  bikeShop: { bg: '#7c3aed', title: 'Fahrradladen' },
  bikeRepair: { bg: '#7c3aed', title: 'Reparaturstation' },
  campsite: { bg: '#16a34a', title: 'Campingplatz' },
  trainStation: { bg: '#dc2626', title: 'Bahnhof' },
  viewpoint: { bg: '#d97706', title: 'Aussichtspunkt' },
};

/** Color for the wind overlay: red = headwind, green = tailwind, amber = neutral */
function windColor(headwindKmh: number): string {
  if (headwindKmh > 10) return '#dc2626';
  if (headwindKmh > 3) return '#f97316';
  if (headwindKmh < -10) return '#16a34a';
  if (headwindKmh < -3) return '#84cc16';
  return '#eab308';
}

export default function MapView(props: MapProps) {
  const { route, routeB, showRoute, isFetching, highlightDistance, activeLayers, basemapId,
    poiMarkers, weatherStartTimeMs, weatherSegments, onWebGLFallback, onMapFlyTo, onBboxChange, onScaleChange, onPoiRightClick, onPoiClick } = props;
  const { onMapFitBounds } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const wpMarkersRef = useRef<Marker[]>([]);
  const supermarketMarkersRef = useRef<Marker[]>([]);
  const routeCoordsRef = useRef<Array<[number, number]>>([]);
  const geoJsonCacheRef = useRef<Record<string, FeatureCollection>>({});
  /** True once the current map's style has loaded (reset on unmount/remount) */
  const styleLoadedRef = useRef(false);
  /** Style-dependent operations queued until the map style is loaded */
  const pendingStyleOpsRef = useRef<Array<() => void>>([]);

  const { waypoints, addWaypoint, moveWaypoint, removeWaypoint, blockedSegment, setBlockedSegment, importedTracks } = useWaypointStore();
  const showTracks = activeLayers?.has('tracks');

  /**
   * MapLibre throws "Style is not done loading" for any style-dependent
   * call (addSource/addLayer/getLayer/...) before the style has loaded.
   * Style ops are queued and flushed exactly once when the current map
   * fires `load` — robust against React StrictMode's double mount.
   */
  const whenStyleReady = useCallback((map: MlMap, fn: () => void) => {
    const runSafe = () => {
      try {
        fn();
      } catch (e) {
        console.error('[map] style op failed', e);
      }
    };
    if (mapRef.current !== map) {
      // stale map instance (e.g. StrictMode's removed first mount) — drop
      return;
    }
    if (styleLoadedRef.current) {
      runSafe();
      return;
    }
    // Style may already be loaded synchronously (e.g. inline style)
    if (map.isStyleLoaded()) {
      styleLoadedRef.current = true;
      runSafe();
      return;
    }
    pendingStyleOpsRef.current.push(runSafe);
  }, []);

  // ── Init map ──────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // The initial basemap is part of the constructor style so MapLibre loads
    // and renders it automatically — independent of the style-op queue.
    const initialBm = getBasemap(basemapId ?? DEFAULT_BASEMAP_ID);

    const map = new MlMapCtor({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          basemap: {
            type: 'raster',
            tiles: expandTileUrls(initialBm.url, initialBm.subdomains),
            tileSize: initialBm.tileSize ?? 256,
            maxzoom: initialBm.maxZoom ?? 19,
          },
        },
        layers: [
          // neutral background while tiles load
          { id: 'background', type: 'background', paint: { 'background-color': '#e5e7eb' } },
          { id: 'basemap', type: 'raster', source: 'basemap' },
        ],
      },
      center: [12.3731, 51.3397],
      zoom: 12,
      attributionControl: false,
      // Needed for the pixel probe (watchdog) — the drawing buffer must
      // survive compositing so readPixels can verify tiles were drawn.
      preserveDrawingBuffer: true,
    });

    map.addControl(new NavigationControl(), 'top-left');
    map.addControl(new ScaleControl({ maxWidth: 120 }), 'bottom-right');

    // If WebGL is unavailable, MapLibre stays blank — hand over to the
    // Leaflet compatibility renderer instead of showing an empty map.
    const webglFailedRef = { failed: false };
    const failToLeaflet = () => {
      if (webglFailedRef.failed) return;
      if (mapRef.current !== map) return; // stale map (StrictMode first mount)
      webglFailedRef.failed = true;
      console.warn('[map] WebGL-Rendering nicht verfügbar — wechsle zum Leaflet-Kompatibilitätsmodus');
      onWebGLFallback?.();
    };
    map.on('webglcontextcreationerror', failToLeaflet);
    map.on('error', (e) => {
      const msg = (e?.error as Error | undefined)?.message ?? '';
      if (/webgl/i.test(msg)) failToLeaflet();
    });

    // Render watchdog: a working map MUST fire 'render' shortly after
    // 'load' (even just the background frame). If no frame renders within
    // 8 s — or the rendered pixels stay uniform background (no tiles drawn,
    // broken software rasterizer) — fall back to Leaflet so the app stays
    // usable.
    let renderedFrame = false;
    let tilesArrived = false;
    map.once('render', () => { renderedFrame = true; });
    map.on('data', (e) => {
      const sourceId = (e as unknown as { sourceId?: string }).sourceId;
      if (e.dataType === 'source' && sourceId === 'basemap') tilesArrived = true;
    });

    const BACKGROUND_RGB: [number, number, number] = [229, 231, 235]; // #e5e7eb
    const checkPixels = () => {
      if (mapRef.current !== map || webglFailedRef.failed) return;
      try {
        const canvas = map.getCanvas();
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) {
          failToLeaflet();
          return;
        }
        map.triggerRepaint();
        map.once('render', () => {
          if (mapRef.current !== map || webglFailedRef.failed) return;
          try {
            const w = canvas.width;
            const h = canvas.height;
            const points: Array<[number, number]> = [
              [Math.floor(w / 2), Math.floor(h / 2)],
              [Math.floor(w * 0.1), Math.floor(h * 0.1)],
              [Math.floor(w * 0.9), Math.floor(h * 0.1)],
              [Math.floor(w * 0.1), Math.floor(h * 0.9)],
              [Math.floor(w * 0.9), Math.floor(h * 0.9)],
            ];
            const pixel = new Uint8Array(4);
            let allBackground = true;
            for (const [x, y] of points) {
              gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
              const same =
                Math.abs(pixel[0] - BACKGROUND_RGB[0]) <= 2 &&
                Math.abs(pixel[1] - BACKGROUND_RGB[1]) <= 2 &&
                Math.abs(pixel[2] - BACKGROUND_RGB[2]) <= 2;
              if (!same) allBackground = false;
            }
            console.warn('[map] Pixel-Probe:', { renderedFrame, tilesArrived, allBackground });
            if (allBackground && !tilesArrived) {
              failToLeaflet();
            }
          } catch {
            failToLeaflet();
          }
        });
      } catch {
        failToLeaflet();
      }
    };

    map.once('load', () => {
      const armWatchdog = () => {
        window.setTimeout(() => {
          if (webglFailedRef.failed) return;
          if (!renderedFrame) {
            failToLeaflet();
            return;
          }
          if (!tilesArrived) {
            // no basemap tiles arrived at all — something is broken
            failToLeaflet();
            return;
          }
          checkPixels();
        }, 6000);
      };
      if (document.visibilityState === 'visible') {
        armWatchdog();
      } else {
        const onVis = () => {
          if (document.visibilityState === 'visible') {
            document.removeEventListener('visibilitychange', onVis);
            armWatchdog();
          }
        };
        document.addEventListener('visibilitychange', onVis);
      }
    });

    // Saxony boundary outline (style must be loaded first)
    whenStyleReady(map, () => {
      map.addSource('saxony', { type: 'geojson', data: SAXONY_BOUNDARY });
      map.addLayer({
        id: 'saxony-boundary',
        type: 'line',
        source: 'saxony',
        paint: { 'line-color': '#f97316', 'line-width': 2, 'line-opacity': 0.6, 'line-dasharray': [2, 1] },
      });
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
      const bounds = new LngLatBoundsCtor();
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
    styleLoadedRef.current = false;
    pendingStyleOpsRef.current = [];

    // Flush all queued style operations exactly once when the style is ready.
    // Registered right after map creation — safe even if 'load' fires early.
    // One failing op must not block the rest (e.g. the basemap).
    map.once('load', () => {
      styleLoadedRef.current = true;
      const ops = pendingStyleOpsRef.current;
      pendingStyleOpsRef.current = [];
      for (const op of ops) {
        try {
          op();
        } catch (e) {
          console.error('[map] style op failed', e);
        }
      }
    });

    return () => {
      styleLoadedRef.current = false;
      pendingStyleOpsRef.current = [];
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
    whenStyleReady(map, () => {
      // Remove layer first, then source (order-independent of MapLibre's
      // removeSource-in-use behavior), then re-add. The basemap must sit
      // ABOVE the opaque background layer but BELOW everything else —
      // the background layer is excluded from the move target.
      if (map.getLayer('basemap')) map.removeLayer('basemap');
      if (map.getSource('basemap')) map.removeSource('basemap');
      map.addSource('basemap', {
        type: 'raster',
        tiles: expandTileUrls(bm.url, bm.subdomains),
        tileSize: bm.tileSize ?? 256,
        maxzoom: bm.maxZoom ?? 19,
      });
      map.addLayer({ id: 'basemap', type: 'raster', source: 'basemap' });
      const aboveId = map
        .getStyle()
        .layers.find((l) => l.id !== 'basemap' && l.id !== 'background');
      if (aboveId) map.moveLayer('basemap', aboveId.id);
      console.info('[map] basemap ready:', bm.id);
    });
  }, [basemapId]);

  // ── Raster overlay toggling (driven by the layer registry) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    whenStyleReady(map, () => {
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
    });
  }, [activeLayers]);

  // ── 3D terrain (raster-dem + setTerrain) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layer = LAYERS.find((l) => l.id === 'terrain');
    const cfg = layer?.raster;
    if (!cfg) return;
    const active = activeLayers?.has('terrain');

    whenStyleReady(map, () => {
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
    });
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
      whenStyleReady(map, () => {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      });
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
          whenStyleReady(map, () => {
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
          });
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

    whenStyleReady(map, () => {
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
    });

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
      const meta = POI_CATEGORIES.find((c) => c.key === poi.category);
      const style = POI_MARKER_STYLES[poi.category] ?? { bg: '#22c55e', title: poi.category };
      const icon = meta?.icon ?? '📍';
      const el = document.createElement('div');
      el.className = 'poi-marker';
      el.style.cursor = 'pointer';
      el.style.pointerEvents = 'auto';
      el.innerHTML = `<div style="
        width:26px;height:26px;background:${style.bg};border:2px solid white;
        border-radius:${style.radius ?? '6px'};display:flex;align-items:center;justify-content:center;
        font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.5);">
        ${icon}
      </div>`;
      el.title = poi.name || style.title;

      const marker = new MarkerCtor({ element: el, anchor: 'center' })
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

      const marker = new MarkerCtor({ element: el, anchor: 'center', draggable: true })
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
        const popup = new PopupCtor({ offset: [0, -14], closeButton: true, className: 'wp-popup' })
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
      whenStyleReady(map, () => {
        if (map.getLayer(lyrId)) map.removeLayer(lyrId);
        if (map.getSource(srcId)) map.removeSource(srcId);
      });
      routeCoordsRef.current = [];
      return;
    }

    const coords = decodePolyline(route.geometry);
    routeCoordsRef.current = coords;
    const fc = lineFeatureCollection(coords);

    whenStyleReady(map, () => {
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
    });
  }, [route, showRoute]);

  // ── Wind overlay (colored underlay: green = tailwind, red = headwind) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const srcId = 'route-wind';
    const lyrId = 'route-wind';

    if (!weatherSegments || weatherSegments.length === 0 || !route?.geometry) {
      whenStyleReady(map, () => {
        if (map.getLayer(lyrId)) map.removeLayer(lyrId);
        if (map.getSource(srcId)) map.removeSource(srcId);
      });
      return;
    }

    const coords = routeCoordsRef.current;
    const totalKm = route.summary.distanceKm;
    if (coords.length < 2 || totalKm <= 0) return;

    const features = weatherSegments.map((seg) => {
      const fromIdx = Math.max(0, Math.min(coords.length - 1, Math.round((seg.fromKm / totalKm) * (coords.length - 1))));
      const toIdx = Math.max(fromIdx + 1, Math.min(coords.length - 1, Math.round((seg.toKm / totalKm) * (coords.length - 1))));
      return {
        type: 'Feature' as const,
        properties: { color: windColor(seg.headwindKmh) },
        geometry: { type: 'LineString' as const, coordinates: coords.slice(fromIdx, toIdx + 1) },
      };
    });

    const fc: FeatureCollection = { type: 'FeatureCollection', features };
    whenStyleReady(map, () => {
      if (map.getSource(srcId)) {
        (map.getSource(srcId) as GeoJSONSource).setData(fc);
      } else {
        map.addSource(srcId, { type: 'geojson', data: fc });
        map.addLayer({
          id: lyrId,
          type: 'line',
          source: srcId,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 7,
            'line-opacity': 0.45,
          },
        }, map.getLayer('route-line') ? 'route-line' : undefined);
      }
    });
  }, [weatherSegments, route]);

  // ── Imported GPX tracks ───────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const srcId = 'tracks';
    const lyrId = 'tracks-lines';

    if (!showTracks || Object.keys(importedTracks).length === 0) {
      whenStyleReady(map, () => {
        if (map.getLayer(lyrId)) map.removeLayer(lyrId);
        if (map.getSource(srcId)) map.removeSource(srcId);
      });
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

    whenStyleReady(map, () => {
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
    });
  }, [importedTracks, showTracks]);

  // ── Comparison route B ────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const srcId = 'route-b';
    const lyrId = 'route-b';

    if (!routeB?.geometry) {
      whenStyleReady(map, () => {
        if (map.getLayer(lyrId)) map.removeLayer(lyrId);
        if (map.getSource(srcId)) map.removeSource(srcId);
      });
      return;
    }

    const fc = lineFeatureCollection(decodePolyline(routeB.geometry));
    whenStyleReady(map, () => {
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
    });
  }, [routeB]);

  // ── Blocked segment ───────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const srcId = 'blocked';
    const lyrId = 'blocked-line';

    if (!blockedSegment || blockedSegment.length < 2) {
      whenStyleReady(map, () => {
        if (map.getLayer(lyrId)) map.removeLayer(lyrId);
        if (map.getSource(srcId)) map.removeSource(srcId);
      });
      return;
    }

    const fc = lineFeatureCollection(blockedSegment);
    whenStyleReady(map, () => {
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
    });
  }, [blockedSegment]);

  // ── Elevation highlight marker ─────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const srcId = 'highlight';
    const lyrId = 'highlight-dot';

    if (highlightDistance == null || !route?.geometry || route.summary.distanceKm <= 0) {
      whenStyleReady(map, () => {
        if (map.getLayer(lyrId)) map.removeLayer(lyrId);
        if (map.getSource(srcId)) map.removeSource(srcId);
      });
      return;
    }

    const fraction = Math.max(0, Math.min(1, highlightDistance / route.summary.distanceKm));
    const coords = routeCoordsRef.current;
    if (coords.length === 0) return;
    const idx = Math.min(Math.round(fraction * (coords.length - 1)), coords.length - 1);
    const [lng, lat] = coords[idx];
    const fc = pointFeatureCollection(lng, lat);

    whenStyleReady(map, () => {
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
    });
  }, [highlightDistance, route]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
