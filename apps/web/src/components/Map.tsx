import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useWaypointStore } from '../store/useWaypointStore';
import { decodePolyline, nearestPointOnLine } from '../lib/polyline';
import type { RouteResponse } from '@cycleplanner/shared';

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
  isFetching: boolean;
  highlightDistance?: number | null;
  onMapFlyTo?: (fn: (lng: number, lat: number) => void) => void;
  onMapFitBounds?: (fn: (points: Array<{ lat: number; lng: number }>) => void) => void;
  onBboxChange?: (bbox: string) => void;
  pois?: Array<{ lat: number; lng: number; name: string; category: string; id: string }> | null;
}

// POI category colors
const POI_COLORS: Record<string, string> = {
  water: '#3b82f6', toilets: '#6366f1', restaurant: '#f97316', cafe: '#a855f7',
  bakery: '#d97706', supermarket: '#22c55e', bikeShop: '#06b6d4', bikeRepair: '#0891b2',
  shelter: '#78716c', campsite: '#84cc16', hotel: '#e11d48', trainStation: '#ef4444',
  viewpoint: '#14b8a6', picnic: '#65a30d',
};

// Simplified Sachsen boundary (approximate Valhalla coverage area)
const SACHSEN_BOUNDARY = {
  type: 'Feature',
  properties: { name: 'Sachsen' },
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [12.06, 51.62], [12.22, 51.67], [12.38, 51.61], [12.60, 51.55],
      [12.81, 51.42], [13.05, 51.35], [13.20, 51.18], [13.39, 51.02],
      [13.62, 50.93], [13.95, 50.79], [14.30, 50.57], [14.60, 50.44],
      [14.86, 50.45], [15.02, 50.32], [14.90, 50.22], [14.70, 50.20],
      [14.55, 50.25], [14.42, 50.35], [14.20, 50.32], [13.98, 50.38],
      [13.80, 50.48], [13.62, 50.55], [13.40, 50.59], [13.18, 50.55],
      [12.92, 50.52], [12.70, 50.60], [12.52, 50.68], [12.35, 50.72],
      [12.22, 50.65], [12.10, 50.52], [12.08, 50.42], [12.14, 50.35],
      [12.00, 50.28], [11.88, 50.28], [11.78, 50.35], [11.72, 50.45],
      [11.78, 50.60], [11.92, 50.72], [12.00, 50.88], [12.02, 51.05],
      [12.00, 51.22], [11.98, 51.38], [12.02, 51.52], [12.06, 51.62],
    ]],
  },
};

export default function MapView(props: MapProps) {
  const { route, routeB, isFetching, highlightDistance, onMapFlyTo, onBboxChange, pois } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const routeBLineRef = useRef<L.Polyline | null>(null);
  const wpMarkersRef = useRef<L.Marker[]>([]);
  const poiLayerRef = useRef<L.GeoJSON | null>(null);
  const blockedLineRef = useRef<L.Polyline | null>(null);
  const highlightMarkerRef = useRef<L.CircleMarker | null>(null);
  const routeCoordsRef = useRef<Array<[number, number]>>([]);

  const { waypoints, addWaypoint, moveWaypoint, blockedSegment, setBlockedSegment } = useWaypointStore();
  const { onMapFitBounds } = props;

  // ── Init map ──────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [51.3397, 12.3731],   // Leipzig (Sachsen)
      zoom: 12,
      attributionControl: false,
      zoomControl: true,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    // Click to add waypoint
    map.on('click', (e: L.LeafletMouseEvent) => {
      addWaypoint(e.latlng.lat, e.latlng.lng);
    });

    // Bbox change reporting
    const reportBbox = () => {
      const b = map.getBounds();
      onBboxChange?.([b.getSouth().toFixed(4), b.getWest().toFixed(4), b.getNorth().toFixed(4), b.getEast().toFixed(4)].join(','));
    };
    map.on('moveend', reportBbox);
    reportBbox();

    // Register fly-to callback
    onMapFlyTo?.((lng: number, lat: number) => {
      map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 0.8 });
    });

    // Register fit-bounds callback
    onMapFitBounds?.((pts: Array<{ lat: number; lng: number }>) => {
      if (pts.length === 0) return;
      const bounds = L.latLngBounds(pts.map(p => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    });

    mapRef.current = map;

    // Add Sachsen boundary overlay (non-interactive, clicks pass through)
    const sachsenStyle = {
      color: '#f97316',
      weight: 2,
      opacity: 0.6,
      fillColor: '#f97316',
      fillOpacity: 0.05,
      dashArray: '8,4',
    };
    L.geoJSON(SACHSEN_BOUNDARY as any, {
      style: sachsenStyle,
      interactive: false,
    } as any).addTo(map);

    // Scale bar (bottom-right)
    L.control.scale({ position: 'bottomright', metric: true, imperial: false, maxWidth: 120 }).addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        moveWaypoint(wp.id, pos.lat, pos.lng);
      });

      marker.addTo(map);
      wpMarkersRef.current.push(marker);
    });
  }, [waypoints, moveWaypoint]);

  // ── Route line ────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (routeLineRef.current) { routeLineRef.current.remove(); routeLineRef.current = null; }

    if (route?.geometry) {
      const coords = decodePolyline(route.geometry);
      routeCoordsRef.current = coords;
      const latlngs = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
      const line = L.polyline(latlngs, {
        color: '#dc2626', weight: 4, opacity: 0.85,
      }).addTo(map);

      // Shift+click → block segment
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
  }, [route, setBlockedSegment]);

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

  // ── POI markers ───────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (poiLayerRef.current) { poiLayerRef.current.remove(); poiLayerRef.current = null; }

    if (pois && pois.length > 0) {
      poiLayerRef.current = L.geoJSON(
        {
          type: 'FeatureCollection',
          features: pois.map((p) => ({
            type: 'Feature' as const,
            properties: { name: p.name, category: p.category },
            geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
          })),
        },
        {
          pointToLayer: (_feature, latlng) => {
            const cat = (_feature.properties?.category as string) || '';
            return L.circleMarker(latlng, {
              radius: 6, fillColor: POI_COLORS[cat] || '#9ca3af',
              color: '#fff', weight: 1.5, fillOpacity: 0.85,
            });
          },
        },
      ).addTo(map);
    }
  }, [pois]);

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
