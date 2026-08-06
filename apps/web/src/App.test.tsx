import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App.js';

// MapLibre GL requires WebGL — mock it for jsdom
vi.mock('maplibre-gl', () => ({
  Map: vi.fn().mockImplementation(() => ({
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
  })),
}));

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
    expect(screen.getByText('CyclePlanner')).toBeDefined();
  });

  it('renders the layer section', () => {
    render(<App />);
    expect(screen.getByText('Layer')).toBeDefined();
    expect(screen.getByText('Basiskarte')).toBeDefined();
    expect(screen.getByText('Relief')).toBeDefined();
    expect(screen.getByText('Radroutennetz')).toBeDefined();
  });

  it('shows empty waypoint hint', () => {
    render(<App />);
    expect(screen.getByText(/Klick auf die Karte/)).toBeDefined();
  });
});
