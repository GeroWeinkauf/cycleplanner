import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useWaypointStore } from '../store/useWaypointStore';
import { decodePolyline, nearestPointOnLine } from '../lib/polyline';
import { LAYERS } from '../layers/registry';
import { getBasemap, expandTileUrls, DEFAULT_BASEMAP_ID } from '../layers/basemaps';
import { POI_CATEGORIES } from '@cycleplanner/shared';
import type { MapViewProps, MapFitBoundsFn } from './mapTypes';
import type { Poi } from '@cycleplanner/shared';

/**
 * Leaflet compatibility renderer.
 *
 * MapLibre GL requires WebGL; environments without working WebGL (VMs,
 * Remote Desktop, disabled GPU acceleration) fall back to this Canvas-2D
 * renderer, which covers all core features: basemap switching, raster &
 * GeoJSON overlays, routes, waypoints, POIs, blocked segments, tracks.
 * WebGL-only features (3D terrain, rain radar, wind overlay) are skipped.
 */

// Fix Leaflet default icon paths
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const SAXONY_BOUNDARY = {
  type: 'Feature',
  properties: { name: 'Sachsen + Sachsen-Anhalt' },
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [10.5, 53.0], [13.5, 53.0], [13.5, 50.2], [10.5, 50.2], [10.5, 53.0],
    ]],
  },
};

/** Marker style per POI category (mirrors Map.tsx) */
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

function toLatLngs(coords: Array<[number, number]>): Array<[number, number]> {
  return coords.map(([lng, lat]) => [lat, lng] as [number, number]);
}

/**
 * Tile layer for WMS-style raster URLs that use the {bbox-epsg-3857}
 * placeholder (e.g. the Esri Land Cover exportImage service). Leaflet only
 * expands {z}/{x}/{y}/{s}, so the bbox is computed per tile here.
 */
const BboxTileLayer = L.TileLayer.extend({
  getTileUrl(this: L.TileLayer & { _url: string }, coords: { z: number; x: number; y: number }): string {
    const n = Math.pow(2, coords.z);
    const R = 6378137;
    const minLng = (coords.x / n) * 360 - 180;
    const maxLng = ((coords.x + 1) / n) * 360 - 180;
    const yMin = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * (coords.y + 1) / n)));
    const yMax = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * coords.y / n)));
    const minX = (minLng * Math.PI) / 180 * R;
    const maxX = (maxLng * Math.PI) / 180 * R;
    const minY = R * Math.log(Math.tan(Math.PI / 4 + yMin * Math.PI / 360));
    const maxY = R * Math.log(Math.tan(Math.PI / 4 + yMax * Math.PI / 360));
    return this._url.replace('{bbox-epsg-3857}', `${minX.toFixed(2)},${minY.toFixed(2)},${maxX.toFixed(2)},${maxY.toFixed(2)}`);
  },
}) as unknown as typeof L.TileLayer;

export default function LeafletMap(props: MapViewProps) {
  const {
    route, routeB, showRoute, highlightDistance, activeLayers, basemapId,
    poiMarkers, onMapFlyTo, onBboxChange, onScaleChange, onPoiRightClick, onPoiClick,
  } = props;
  const { onMapFitBounds } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const routeBLineRef = useRef<L.Polyline | null>(null);
  const wpMarkersRef = useRef<L.Marker[]>([]);
  const blockedLineRef = useRef<L.Polyline | null>(null);
  const highlightMarkerRef = useRef<L.CircleMarker | null>(null);
  const trackLinesRef = useRef<Record<string, L.Polyline>>({});
  const routeCoordsRef = useRef<Array<[number, number]>>([]);
  const basemapLayerRef = useRef<L.TileLayer | null>(null);
  const overlayLayersRef = useRef<Record<string, L.Layer>>({});
  const poiMarkersRef = useRef<L.Marker[]>([]);
  const geoJsonLinesRef = useRef<Record<string, L.GeoJSON>>({});

  const { waypoints, addWaypoint, moveWaypoint, removeWaypoint, blockedSegment, setBlockedSegment, importedTracks } = useWaypointStore();
  const showTracks = activeLayers?.has('tracks');

  // ── Init map ──────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [51.3397, 12.3731],
      zoom: 12,
      attributionControl: false,
      zoomControl: true,
    });

    // Left click = add waypoint
    map.on('click', (e: L.LeafletMouseEvent) => {
      const target = (e.originalEvent as MouseEvent).target as HTMLElement;
      if (target && (target.closest('.poi-marker') || target.closest('.wp-div-icon'))) {
        return;
      }
      addWaypoint(e.latlng.lat, e.latlng.lng);
    });

    const reportBbox = () => {
      const b = map.getBounds();
      onBboxChange?.([b.getSouth().toFixed(4), b.getWest().toFixed(4), b.getNorth().toFixed(4), b.getEast().toFixed(4)].join(','));
      const p1 = map.containerPointToLatLng([0, 0]);
      const p2 = map.containerPointToLatLng([120, 0]);
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
      map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 0.8 });
    });

    onMapFitBounds?.(((pts, opts) => {
      if (pts.length === 0) return;
      const bounds = L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds, {
        padding: opts?.padding ?? [30, 30],
        maxZoom: opts?.maxZoom ?? 15,
        animate: opts?.animate ?? false,
      });
    }) as MapFitBoundsFn);

    L.geoJSON(SAXONY_BOUNDARY as never, {
      style: { color: '#f97316', weight: 2, opacity: 0.6, fillColor: '#f97316', fillOpacity: 0.05, dashArray: '8,4' },
      interactive: false,
    } as never).addTo(map);

    L.control.scale({ position: 'bottomright', metric: true, imperial: false, maxWidth: 120 }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Basemap switching ─────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const bm = getBasemap(basemapId ?? DEFAULT_BASEMAP_ID);
    if (basemapLayerRef.current) {
      map.removeLayer(basemapLayerRef.current);
    }
    const urls = expandTileUrls(bm.url, bm.subdomains);
    basemapLayerRef.current = L.tileLayer(urls[0], {
      maxZoom: bm.maxZoom ?? 19,
      tileSize: bm.tileSize ?? 256,
      attribution: bm.attribution,
    }).addTo(map);
  }, [basemapId]);

  // ── Overlay toggles (registry-driven, XYZ raster + GeoJSON) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const layer of LAYERS) {
      const id = layer.id;
      const shouldShow = activeLayers?.has(id);

      // Raster overlays (XYZ + WMS-style bbox templates)
      if (layer.raster && layer.raster.kind !== 'rainviewer' && layer.raster.kind !== 'terrain') {
        const exists = overlayLayersRef.current[id];
        if (shouldShow && !exists) {
          const cfg = layer.raster;
          const tile = cfg.kind === 'wms'
            ? new BboxTileLayer(cfg.url, {
                minZoom: cfg.minZoom ?? layer.minZoom,
                maxZoom: cfg.maxZoom ?? 19,
                opacity: cfg.opacity ?? 1,
                attribution: layer.attribution,
              })
            : L.tileLayer(expandTileUrls(cfg.url, cfg.subdomains)[0], {
                minZoom: cfg.minZoom ?? layer.minZoom,
                maxZoom: cfg.maxZoom ?? 19,
                opacity: cfg.opacity ?? 1,
                attribution: layer.attribution,
              });
          tile.addTo(map);
          overlayLayersRef.current[id] = tile;
        } else if (!shouldShow && exists) {
          map.removeLayer(exists);
          delete overlayLayersRef.current[id];
        }
      }

      // GeoJSON overlays (D-Netz, EuroVelo)
      if (layer.geojson) {
        const exists = geoJsonLinesRef.current[id];
        if (shouldShow && !exists) {
          fetch(layer.geojson.url)
            .then((r) => r.json())
            .then((fc) => {
              if (activeLayers?.has(id) && map.hasLayer(geoJsonLinesRef.current[id] as L.Layer)) return;
              const gj = L.geoJSON(fc as never, {
                style: {
                  color: layer.geojson?.lineColor ?? '#0891b2',
                  weight: layer.geojson?.lineWidth ?? 2.5,
                  opacity: layer.geojson?.lineOpacity ?? 0.85,
                },
              });
              gj.addTo(map);
              geoJsonLinesRef.current[id] = gj;
            })
            .catch(() => { /* network data missing */ });
        } else if (!shouldShow && exists) {
          map.removeLayer(exists);
          delete geoJsonLinesRef.current[id];
        }
      }
    }
  }, [activeLayers]);

  // ── POI markers ───────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    poiMarkersRef.current.forEach((m) => map.removeLayer(m));
    poiMarkersRef.current = [];
    if (!poiMarkers || poiMarkers.length === 0) return;

    for (const poi of poiMarkers) {
      const meta = POI_CATEGORIES.find((c) => c.key === poi.category);
      const style = POI_MARKER_STYLES[poi.category] ?? { bg: '#22c55e', title: poi.category };
      const icon = meta?.icon ?? '📍';
      const div = document.createElement('div');
      div.innerHTML = `<div style="
        width:26px;height:26px;background:${style.bg};border:2px solid white;
        border-radius:${style.radius ?? '6px'};display:flex;align-items:center;justify-content:center;
        font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.5);">${icon}</div>`;
      const marker = L.marker([poi.lat, poi.lng], {
        icon: L.divIcon({
          className: 'poi-marker',
          html: div.innerHTML,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
        zIndexOffset: 1000,
      });
      marker.bindTooltip(poi.name || style.title, { direction: 'top', offset: [0, -14] });
      marker.on('contextmenu', (e: L.LeafletMouseEvent) => {
        e.originalEvent.preventDefault();
        onPoiRightClick?.(poi);
      });
      marker.on('click', (e: L.LeafletMouseEvent) => {
        e.originalEvent.stopPropagation();
        onPoiClick?.(poi);
      });
      marker.addTo(map);
      poiMarkersRef.current.push(marker);
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

      const marker = L.marker([wp.lat, wp.lng], {
        draggable: true,
        icon: L.divIcon({
          className: 'wp-div-icon',
          html: iconHtml,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      });

      const popupHtml = `<div style="font-size:11px;font-family:system-ui,sans-serif;min-width:100px">
        <div style="font-weight:600;margin-bottom:4px;color:#374151">${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}</div>
        <button class="wp-popup-del-btn" data-wpid="${wp.id}" style="width:100%;padding:3px 6px;border:1px solid #fca5a5;border-radius:4px;background:#fef2f2;color:#dc2626;font-size:11px;cursor:pointer">✕ Entfernen</button>
      </div>`;
      marker.bindPopup(popupHtml, { closeButton: true, className: 'wp-popup', offset: [0, -8] });
      marker.on('click', () => {
        setTimeout(() => {
          document.querySelectorAll('.wp-popup-del-btn').forEach((btn) => {
            const el = btn as HTMLElement;
            const wpid = el.dataset.wpid;
            el.onclick = (ev) => {
              ev.stopPropagation();
              if (wpid) removeWaypoint(wpid);
              marker.closePopup();
            };
          });
        }, 50);
      });
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        moveWaypoint(wp.id, pos.lat, pos.lng);
      });

      marker.addTo(map);
      wpMarkersRef.current.push(marker);
    });
  }, [waypoints, moveWaypoint, removeWaypoint]);

  // ── Route line ────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (routeLineRef.current) { routeLineRef.current.remove(); routeLineRef.current = null; }

    if (route?.geometry && showRoute) {
      const coords = decodePolyline(route.geometry);
      routeCoordsRef.current = coords;
      const line = L.polyline(toLatLngs(coords), { color: '#dc2626', weight: 4, opacity: 0.85 }).addTo(map);
      line.on('click', (e: L.LeafletMouseEvent) => {
        if (!(e.originalEvent as MouseEvent).shiftKey) return;
        if (routeCoordsRef.current.length < 2) return;
        const nearest = nearestPointOnLine([e.latlng.lng, e.latlng.lat], routeCoordsRef.current);
        const start = Math.max(0, nearest.index - 5);
        const end = Math.min(routeCoordsRef.current.length - 1, nearest.index + 5);
        setBlockedSegment(routeCoordsRef.current.slice(start, end + 1));
      });
      routeLineRef.current = line;
      map.fitBounds(line.getBounds().pad(0.1));
    }
  }, [route, showRoute, setBlockedSegment]);

  // ── Route B ───────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (routeBLineRef.current) { routeBLineRef.current.remove(); routeBLineRef.current = null; }
    if (routeB?.geometry) {
      routeBLineRef.current = L.polyline(toLatLngs(decodePolyline(routeB.geometry)), {
        color: '#7c3aed', weight: 3, opacity: 0.6, dashArray: '8,4',
      }).addTo(map);
    }
  }, [routeB]);

  // ── Blocked segment ───────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (blockedLineRef.current) { blockedLineRef.current.remove(); blockedLineRef.current = null; }
    if (blockedSegment && blockedSegment.length >= 2) {
      blockedLineRef.current = L.polyline(toLatLngs(blockedSegment), {
        color: '#f59e0b', weight: 6, opacity: 0.7, dashArray: '6,3',
      }).addTo(map);
    }
  }, [blockedSegment]);

  // ── Imported tracks ───────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    Object.values(trackLinesRef.current).forEach((l) => l.remove());
    trackLinesRef.current = {};
    if (!showTracks) return;
    for (const [filename, geometry] of Object.entries(importedTracks)) {
      trackLinesRef.current[filename] = L.polyline(toLatLngs(decodePolyline(geometry)), {
        color: '#0891b2', weight: 4, opacity: 0.75,
      }).addTo(map);
    }
  }, [importedTracks, showTracks]);

  // ── Elevation highlight marker ────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (highlightMarkerRef.current) { highlightMarkerRef.current.remove(); highlightMarkerRef.current = null; }
    if (highlightDistance != null && route?.geometry && route.summary.distanceKm > 0) {
      const fraction = Math.max(0, Math.min(1, highlightDistance / route.summary.distanceKm));
      const coords = routeCoordsRef.current;
      if (coords.length > 0) {
        const idx = Math.round(fraction * (coords.length - 1));
        const [lng, lat] = coords[Math.min(idx, coords.length - 1)];
        highlightMarkerRef.current = L.circleMarker([lat, lng], {
          radius: 9, fillColor: '#ef4444', color: '#fff', weight: 2, fillOpacity: 0.9,
        }).addTo(map);
      }
    }
  }, [highlightDistance, route]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
