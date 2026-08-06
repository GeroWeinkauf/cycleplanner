import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    remove: vi.fn(),
  })),
}));

describe('App', () => {
  it('renders the layer panel', () => {
    render(<App />);
    expect(screen.getByText('Layer')).toBeDefined();
    expect(screen.getByText('Basiskarte')).toBeDefined();
    expect(screen.getByText('Relief')).toBeDefined();
    expect(screen.getByText('Radroutennetz')).toBeDefined();
  });

  it('toggles a layer on click', () => {
    render(<App />);
    const reliefCheckbox = screen.getAllByRole('checkbox')[1]; // Relief is index 1
    expect((reliefCheckbox as HTMLInputElement).checked).toBe(true); // defaultVisible
    fireEvent.click(reliefCheckbox);
    expect((reliefCheckbox as HTMLInputElement).checked).toBe(false);
  });

  it('shows attributions for active layers', () => {
    render(<App />);
    // Basemap and Relief are defaultVisible, so attributions appear
    const osmRefs = screen.getAllByText(/OpenStreetMap/);
    expect(osmRefs.length).toBeGreaterThanOrEqual(1);
  });
});
