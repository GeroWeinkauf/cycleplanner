import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useWaypointStore } from '../store/useWaypointStore';
import { decodePolyline, nearestPointOnLine } from '../lib/polyline';
import type { RouteResponse, Poi } from '@cycleplanner/shared';

// Fix Leaflet default icon paths
delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface MapProps {
  route?: RouteResponse | null;
  routeB?: RouteResponse | null;
  showRoute?: boolean;
  isFetching: boolean;
  highlightDistance?: number | null;
  activeLayers?: Set<string>;
  supermarketPois?: Poi[];
  onMapFlyTo?: (fn: (lng: number, lat: number) => void) => void;
  onMapFitBounds?: (fn: (points: Array<{ lat: number; lng: number }>) => void) => void;
  onBboxChange?: (bbox: string) => void;
  onPoiRightClick?: (poi: Poi) => void;
  onPoiClick?: (poi: Poi) => void;
}

// Simplified Sachsen + Sachsen-Anhalt boundary
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

const LAYER_TILES: Record<string, { url: string; options: L.TileLayerOptions }> = {
  relief: {
    url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 17, opacity: 0.45, attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>' } as L.TileLayerOptions,
  },
  cycleroutes: {
    url: 'https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png',
    options: { maxZoom: 17, opacity: 0.55, minZoom: 7, attribution: '&copy; <a href="https://waymarkedtrails.org/">WaymarkedTrails</a>' } as L.TileLayerOptions,
  },
};

export default function MapView(props: MapProps) {
  const { route, routeB, showRoute, isFetching, highlightDistance, activeLayers, supermarketPois,
    onMapFlyTo, onBboxChange, onPoiRightClick, onPoiClick } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const routeBLineRef = useRef<L.Polyline | null>(null);
  const wpMarkersRef = useRef<L.Marker[]>([]);
  const blockedLineRef = useRef<L.Polyline | null>(null);
  const highlightMarkerRef = useRef<L.CircleMarker | null>(null);
  const trackLinesRef = useRef<Record<string, L.Polyline>>({});
  const routeCoordsRef = useRef<Array<[number, number]>>([]);
  const layerTilesRef = useRef<Record<string, L.TileLayer>>({});
  const supermarketMarkersRef = useRef<L.Marker[]>([]);

  const { waypoints, addWaypoint, moveWaypoint, removeWaypoint, blockedSegment, setBlockedSegment, importedTracks } = useWaypointStore();
  const { onMapFitBounds } = props;
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

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    // Left click = add waypoint for routing
    map.on('click', (e: L.LeafletMouseEvent) => {
      // Don't add waypoint if clicking a supermarket marker
      const target = (e.originalEvent as MouseEvent).target as HTMLElement;
      if (target && (target.closest('.supermarket-marker') || target.closest('.wp-div-icon'))) {
        return;
      }
      addWaypoint(e.latlng.lat, e.latlng.lng);
    });

    // Right click on map: check for nearby supermarket (for future use)
    map.on('contextmenu', () => {
      // No-op: supermarket right-clicks are handled by the markers themselves
    });

    const reportBbox = () => {
      const b = map.getBounds();
      onBboxChange?.([b.getSouth().toFixed(4), b.getWest().toFixed(4), b.getNorth().toFixed(4), b.getEast().toFixed(4)].join(','));
    };
    map.on('moveend', reportBbox);
    reportBbox();

    onMapFlyTo?.((lng: number, lat: number) => {
      map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 0.8 });
    });

    onMapFitBounds?.((pts: Array<{ lat: number; lng: number }>) => {
      if (pts.length === 0) return;
      const bounds = L.latLngBounds(pts.map(p => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    });

    mapRef.current = map;

    const sachsenStyle = {
      color: '#f97316', weight: 2, opacity: 0.6,
      fillColor: '#f97316', fillOpacity: 0.05, dashArray: '8,4',
    };
    L.geoJSON(SAXONY_BOUNDARY as any, { style: sachsenStyle, interactive: false } as any).addTo(map);

    L.control.scale({ position: 'bottomright', metric: true, imperial: false, maxWidth: 120 }).addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Tile layer toggling ───────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const layerId of ['relief', 'cycleroutes']) {
      const shouldShow = activeLayers?.has(layerId);
      const exists = !!layerTilesRef.current[layerId];

      if (shouldShow && !exists) {
        const cfg = LAYER_TILES[layerId];
        layerTilesRef.current[layerId] = L.tileLayer(cfg.url, cfg.options).addTo(map);
      } else if (!shouldShow && exists) {
        map.removeLayer(layerTilesRef.current[layerId]);
        delete layerTilesRef.current[layerId];
      }
    }
  }, [activeLayers]);

  // ── Supermarket markers (right-click for Google details) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old markers
    supermarketMarkersRef.current.forEach(m => map.removeLayer(m));
    supermarketMarkersRef.current = [];

    if (!supermarketPois || supermarketPois.length === 0) return;

    // Always create markers regardless of zoom level.
    // Show/hide based on zoom (≥14 visible) via per-marker addTo/removeLayer.
    for (const poi of supermarketPois) {
      const icon = L.divIcon({
        className: 'supermarket-marker',
        html: `<div style="
          width:28px;height:28px;background:#22c55e;border:2px solid white;
          border-radius:6px;display:flex;align-items:center;justify-content:center;
          font-size:16px;box-shadow:0 2px 6px rgba(0,0,0,0.5);
          cursor:pointer;pointer-events:auto;"
          title="${poi.name || 'Supermarkt'}">
          🛒
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([poi.lat, poi.lng], {
        icon,
        interactive: true,
        zIndexOffset: 1000, // ensure above route line
      });

      // Hover label
      marker.bindTooltip(poi.name || 'Supermarkt', {
        direction: 'top',
        offset: [0, -16],
        className: 'supermarket-tooltip',
        permanent: false,
      });

      // Right-click → Google detail popup
      marker.on('contextmenu', (e: L.LeafletMouseEvent) => {
        e.originalEvent.preventDefault();
        e.originalEvent.stopPropagation();
        onPoiRightClick?.(poi);
      });

      // Left-click opens detail popup
      marker.on('click', (e: L.LeafletMouseEvent) => {
        e.originalEvent.stopPropagation();
        onPoiClick?.(poi);
      });

      // Add to map only if zoom ≥ 14
      if (map.getZoom() >= 14) {
        marker.addTo(map);
      }

      supermarketMarkersRef.current.push(marker);
    }

    // Listen for zoom changes to show/hide markers
    const onZoom = () => {
      const zoom = map.getZoom();
      supermarketMarkersRef.current.forEach(m => {
        if (zoom >= 14) {
          if (!map.hasLayer(m)) m.addTo(map);
        } else {
          if (map.hasLayer(m)) map.removeLayer(m);
        }
      });
    };
    map.on('zoomend', onZoom);

    return () => {
      map.off('zoomend', onZoom);
      supermarketMarkersRef.current.forEach(m => {
        if (map.hasLayer(m)) map.removeLayer(m);
      });
      supermarketMarkersRef.current = [];
    };
  }, [supermarketPois, onPoiRightClick, onPoiClick]);

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
        <div style="font-weight:600;margin-bottom:4px;color:#374151">
          ${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}
        </div>
        <button class="wp-popup-del-btn" data-wpid="${wp.id}" style="width:100%;padding:3px 6px;border:1px solid #fca5a5;border-radius:4px;background:#fef2f2;color:#dc2626;font-size:11px;cursor:pointer">
          ✕ Entfernen
        </button>
      </div>`;

      marker.bindPopup(popupHtml, {
        closeButton: true,
        className: 'wp-popup',
        offset: [0, -8],
      });

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

  // ── Route line (controlled by showRoute) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (routeLineRef.current) { routeLineRef.current.remove(); routeLineRef.current = null; }

    if (route?.geometry && showRoute) {
      const coords = decodePolyline(route.geometry);
      routeCoordsRef.current = coords;
      const latlngs = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
      const line = L.polyline(latlngs, {
        color: '#dc2626', weight: 4, opacity: 0.85,
      }).addTo(map);

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

  // ── Imported GPX tracks ───────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    Object.values(trackLinesRef.current).forEach((l) => l.remove());
    trackLinesRef.current = {};

    if (!showTracks) return;

    for (const [filename, geometry] of Object.entries(importedTracks)) {
      const coords = decodePolyline(geometry);
      const latlngs = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
      trackLinesRef.current[filename] = L.polyline(latlngs, {
        color: '#0891b2', weight: 4, opacity: 0.75,
      }).addTo(map);
    }
  }, [importedTracks, showTracks]);

  // ── Comparison route B ────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (routeBLineRef.current) { routeBLineRef.current.remove(); routeBLineRef.current = null; }

    if (routeB?.geometry) {
      const coords = decodePolyline(routeB.geometry);
      const latlngs = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
      routeBLineRef.current = L.polyline(latlngs, {
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
      const latlngs = blockedSegment.map(([lng, lat]) => [lat, lng] as [number, number]);
      blockedLineRef.current = L.polyline(latlngs, {
        color: '#f59e0b', weight: 6, opacity: 0.7, dashArray: '6,3',
      }).addTo(map);
    }
  }, [blockedSegment]);

  // ── Elevation highlight ───────────────────
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