import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App.js';

// MapLibre GL requires WebGL — mock it for jsdom
vi.mock('maplibre-gl', () => {
  const lngLat = { lat: 51, lng: 12, distanceTo: vi.fn(() => 100) };

  const makeMap = () => ({
    setStyle: vi.fn(),
    getSource: vi.fn().mockReturnValue(undefined),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getLayer: vi.fn().mockReturnValue(undefined),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    isStyleLoaded: vi.fn().mockReturnValue(true),
    once: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    remove: vi.fn(),
    getCanvas: vi.fn().mockReturnValue({ style: {} }),
    queryRenderedFeatures: vi.fn().mockReturnValue([]),
    addControl: vi.fn(),
    setTerrain: vi.fn(),
    flyTo: vi.fn(),
    fitBounds: vi.fn(),
    unproject: vi.fn().mockReturnValue(lngLat),
    getBounds: vi.fn().mockReturnValue({
      getSouth: () => 50, getWest: () => 11, getNorth: () => 52, getEast: () => 13,
    }),
    getZoom: vi.fn().mockReturnValue(12),
    getStyle: vi.fn().mockReturnValue({ layers: [] }),
  });

  const makeMarker = () => {
    const m: Record<string, unknown> = {};
    m.setLngLat = vi.fn().mockReturnValue(m);
    m.addTo = vi.fn().mockReturnValue(m);
    m.remove = vi.fn();
    m.setDraggable = vi.fn();
    m.on = vi.fn();
    m.getLngLat = vi.fn().mockReturnValue(lngLat);
    m.getElement = vi.fn().mockReturnValue(document.createElement('div'));
    return m;
  };

  const makePopup = () => {
    const p: Record<string, unknown> = {};
    p.setLngLat = vi.fn().mockReturnValue(p);
    p.setHTML = vi.fn().mockReturnValue(p);
    p.addTo = vi.fn().mockReturnValue(p);
    p.remove = vi.fn();
    p.on = vi.fn();
    p.getElement = vi.fn().mockReturnValue(null);
    return p;
  };

  return {
    Map: vi.fn().mockImplementation(makeMap),
    Marker: vi.fn().mockImplementation(makeMarker),
    Popup: vi.fn().mockImplementation(makePopup),
    NavigationControl: vi.fn(),
    ScaleControl: vi.fn(),
    LngLatBounds: vi.fn().mockImplementation(() => ({ extend: vi.fn() })),
    default: {
      Map: vi.fn().mockImplementation(makeMap),
      Marker: vi.fn().mockImplementation(makeMarker),
      Popup: vi.fn().mockImplementation(makePopup),
      NavigationControl: vi.fn(),
      ScaleControl: vi.fn(),
      LngLatBounds: vi.fn().mockImplementation(() => ({ extend: vi.fn() })),
    },
  };
});

// Mock TanStack Query to avoid async issues
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn().mockReturnValue({ data: undefined, isFetching: false }),
  };
});

describe('App', () => {
  it('renders the sidebar with title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /Cycle\s*Planner/ })).toBeDefined();
  });

  it('renders the layer section with basemaps', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Ebenen'));
    expect(screen.getByText('Basiskarte')).toBeDefined();
    expect(screen.getByText('OSM Standard')).toBeDefined();
    expect(screen.getByText('CyclOSM (Fahrrad)')).toBeDefined();
    expect(screen.getByText('OSM DE (deutsch)')).toBeDefined();
    expect(screen.getByText('CARTO Positron (hell)')).toBeDefined();
  });

  it('renders the overlay layers grouped by theme', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Ebenen'));
    expect(screen.getByText('Fahrradinfrastruktur')).toBeDefined();
    expect(screen.getByText('Höhen & Steigung')).toBeDefined();
    expect(screen.getByText('Wetter')).toBeDefined();
    expect(screen.getByText('Relief (OpenTopoMap)')).toBeDefined();
    expect(screen.getByText('Radroutennetz')).toBeDefined();
    expect(screen.getByText('MTB-Routen')).toBeDefined();
    expect(screen.getByText('3D-Gelände')).toBeDefined();
    expect(screen.getByText('Regenradar (RainViewer)')).toBeDefined();
    expect(screen.getByText('GPX Tracks')).toBeDefined();
  });

  it('renders the POI toggles', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Ebenen'));
    expect(screen.getByText(/Supermärkte/)).toBeDefined();
    expect(screen.getByText(/Badeseen/)).toBeDefined();
    expect(screen.getAllByText(/Trinkwasser/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Aussichtspunkte/).length).toBeGreaterThan(0);
  });

  it('renders the ride settings panel', () => {
    render(<App />);
    expect(screen.getByText('Ø Geschwindigkeit')).toBeDefined();
    expect(screen.getByText('Startzeit')).toBeDefined();
  });

  it('shows empty waypoint hint', () => {
    render(<App />);
    expect(screen.getByText(/Klick auf die Karte/)).toBeDefined();
  });
});
