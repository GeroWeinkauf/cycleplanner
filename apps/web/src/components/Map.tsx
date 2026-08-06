import { useEffect, useRef, type MutableRefObject } from 'react';
import { Map as MapLibreMap, type Map, type GeoJSONSource, type MapMouseEvent, type MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { LAYERS } from '../layers/registry';
import { desaturatedStyle } from '../layers/basemap';
import { useWaypointStore } from '../store/useWaypointStore';
import type { RouteResponse } from '@cycleplanner/shared';
import { decodePolyline, nearestPointOnLine } from '../lib/polyline';

const BLANK_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [{ id: 'background', type: 'background' as const, paint: { 'background-color': '#e8e4df' } }],
};

// ── Layer IDs for our overlays ──────────────
const WP_SOURCE = 'waypoints';
const WP_CIRCLE = 'waypoint-circle';
const WP_LABEL = 'waypoint-label';
const ROUTE_SOURCE = 'route-line';
const ROUTE_LAYER = 'route-line-layer';
const ROUTE_HIT = 'route-hit-area';

interface MapProps {
  activeLayers: Set<string>;
  route?: RouteResponse | null;
  isFetching: boolean;
}

export default function MapCanvas({ activeLayers, route, isFetching }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const prevLayersRef = useRef<Set<string>>(new Set());
  const dragRef = useRef<{ wpId: string; startLng: number; startLat: number } | null>(null);
  const routeDragRef = useRef<{ active: boolean }>({ active: false });
  const routeCoordsRef = useRef<Array<[number, number]>>([]);

  const { waypoints, addWaypoint, moveWaypoint, insertWaypointAt } = useWaypointStore();

  // ── Initialize map ──────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialStyle = activeLayers.has('basemap') ? desaturatedStyle : BLANK_STYLE;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: initialStyle,
      center: [12.3731, 51.0397],
      zoom: 9,
      attributionControl: false,
    });

    mapRef.current = map;

    // Click on map → add waypoint (unless clicking on an existing waypoint)
    map.on('click', (e: MapMouseEvent) => {
      // Don't add if we clicked on an existing waypoint or the route hit area
      const features = map.queryRenderedFeatures(e.point, {
        layers: [WP_CIRCLE, ROUTE_HIT],
      });
      if (features.length > 0) return;

      addWaypoint(e.lngLat.lat, e.lngLat.lng);
    });

    // Waypoint drag handling
    map.on('mousedown', WP_CIRCLE, (e: MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return;
      const wpId = e.features[0].properties?.id as string;
      if (!wpId) return;

      dragRef.current = { wpId, startLng: e.lngLat.lng, startLat: e.lngLat.lat };

      const onMove = (ev: MapMouseEvent) => {
        if (!dragRef.current) return;
        moveWaypoint(dragRef.current.wpId, ev.lngLat.lat, ev.lngLat.lng);
      };

      const onUp = () => {
        dragRef.current = null;
        map.off('mousemove', onMove);
        map.off('mouseup', onUp);
      };

      map.on('mousemove', onMove);
      map.once('mouseup', onUp);
    });

    // Route line drag → insert via point
    map.on('mousedown', ROUTE_HIT, (e: MapLayerMouseEvent) => {
      if (isFetching) return;
      routeDragRef.current = { active: false };
      const startLng = e.lngLat.lng;
      const startLat = e.lngLat.lat;

      const onMove = (ev: MapMouseEvent) => {
        if (Math.abs(ev.lngLat.lng - startLng) > 0.001 || Math.abs(ev.lngLat.lat - startLat) > 0.001) {
          routeDragRef.current.active = true;
        }
      };

      const onUp = (ev: MapMouseEvent) => {
        map.off('mousemove', onMove);
        map.off('mouseup', onUp);

        if (!routeDragRef.current.active) return;

        // Find nearest point on the route (stored in ref during route update)
        const line = routeCoordsRef.current;
        if (line.length < 2) return;
        const nearest = nearestPointOnLine([ev.lngLat.lng, ev.lngLat.lat], line);

        // Insert waypoint at the segment index
        insertWaypointAt(nearest.index + 1, nearest.coord[1], nearest.coord[0]);
      };

      map.on('mousemove', onMove);
      map.once('mouseup', onUp);
    });

    // Cursor styles
    map.on('mouseenter', WP_CIRCLE, () => { map.getCanvas().style.cursor = 'grab'; });
    map.on('mouseleave', WP_CIRCLE, () => { map.getCanvas().style.cursor = ''; });
    map.on('mousedown', WP_CIRCLE, () => { map.getCanvas().style.cursor = 'grabbing'; });
    map.on('mouseup', () => { map.getCanvas().style.cursor = ''; });
    map.on('mouseenter', ROUTE_HIT, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', ROUTE_HIT, () => { map.getCanvas().style.cursor = ''; });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Only run on mount — empty deps intentional
  }, []);

  // ── Sync layers on activeLayers change ──────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const prev = prevLayersRef.current;
    const current = activeLayers;

    const basemapWasActive = prev.has('basemap');
    const basemapIsActive = current.has('basemap');
    if (basemapWasActive !== basemapIsActive) {
      const style = basemapIsActive ? desaturatedStyle : BLANK_STYLE;
      map.setStyle(style);
      map.once('style.load', () => {
        for (const layer of LAYERS) {
          if (layer.id !== 'basemap' && current.has(layer.id)) layer.setup(map);
        }
        // Re-add our waypoints and route after style change
        updateWaypointSource(map);
        updateRouteSource(map, undefined, routeCoordsRef);
      });
      prevLayersRef.current = new Set(current);
      return;
    }

    for (const layer of LAYERS) {
      if (layer.id === 'basemap') continue;
      if (!prev.has(layer.id) && current.has(layer.id)) {
        if (map.isStyleLoaded()) layer.setup(map);
        else map.once('style.load', () => layer.setup(map));
      } else if (prev.has(layer.id) && !current.has(layer.id)) {
        layer.teardown(map);
      }
    }

    prevLayersRef.current = new Set(current);
  }, [activeLayers]);

  // ── Update waypoint markers ────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    updateWaypointSource(map);
  }, [waypoints]);

  // ── Update route line ──────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    updateRouteSource(map, route, routeCoordsRef);
  }, [route]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

// ── Helper functions for source/layer management ──

function ensureWaypointLayers(map: Map) {
  if (!map.getSource(WP_SOURCE)) {
    map.addSource(WP_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }
  if (!map.getLayer(WP_CIRCLE)) {
    map.addLayer({
      id: WP_CIRCLE,
      type: 'circle',
      source: WP_SOURCE,
      paint: {
        'circle-radius': 8,
        'circle-color': '#2563eb',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2.5,
        'circle-opacity': 0.9,
      },
    });
  }
  if (!map.getLayer(WP_LABEL)) {
    map.addLayer({
      id: WP_LABEL,
      type: 'symbol',
      source: WP_SOURCE,
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Open Sans Bold'],
        'text-size': 10,
        'text-offset': [0, 0.15],
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#2563eb',
        'text-halo-width': 0.5,
      },
    });
  }
}

function ensureRouteLayers(map: Map) {
  if (!map.getSource(ROUTE_SOURCE)) {
    map.addSource(ROUTE_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!map.getLayer(ROUTE_LAYER)) {
    map.addLayer({
      id: ROUTE_LAYER,
      type: 'line',
      source: ROUTE_SOURCE,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#dc2626',
        'line-width': 3,
        'line-opacity': 0.85,
      },
    });
  }
  // Invisible wide hit area for dragging the route
  if (!map.getLayer(ROUTE_HIT)) {
    map.addLayer({
      id: ROUTE_HIT,
      type: 'line',
      source: ROUTE_SOURCE,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': 'rgba(0,0,0,0)',
        'line-width': 14,
        'line-opacity': 0,
      },
    });
  }
}

function updateWaypointSource(map: Map) {
  const { waypoints } = useWaypointStore.getState();
  const source = map.getSource(WP_SOURCE) as GeoJSONSource | undefined;
  if (!source) {
    ensureWaypointLayers(map);
    // Retry after ensuring layers exist
    const s = map.getSource(WP_SOURCE) as GeoJSONSource | undefined;
    if (!s) return;
    setWaypointData(s, waypoints);
    return;
  }
  setWaypointData(source, waypoints);
}

function setWaypointData(source: GeoJSONSource, waypoints: import('../store/useWaypointStore').Waypoint[]) {
  source.setData({
    type: 'FeatureCollection',
    features: waypoints.map((wp, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [wp.lng, wp.lat] },
      properties: { id: wp.id, label: String(i + 1), type: wp.type },
    })),
  });
}

function updateRouteSource(
  map: Map,
  route?: RouteResponse | null,
  routeCoordsRef?: MutableRefObject<Array<[number, number]>>,
) {
  if (!route?.geometry) {
    if (routeCoordsRef) routeCoordsRef.current = [];
    const source = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
    if (source) source.setData({ type: 'FeatureCollection', features: [] });
    return;
  }
  ensureRouteLayers(map);

  const coords = decodePolyline(route.geometry);
  if (routeCoordsRef) routeCoordsRef.current = coords;

  const source = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
  if (!source) return;

  source.setData({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      },
    ],
  });
}
