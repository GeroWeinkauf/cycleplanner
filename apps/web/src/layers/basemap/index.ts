import type { LayerDefinition } from '../types';
import type { Map, StyleSpecification } from 'maplibre-gl';
import style from './style.json';

// ── Color Desaturation ──────────────────────
// Reduce saturation on all paint colors so the basemap sits quietly
// behind route overlays and the hillshade.

function desaturateHex(hex: string, factor: number): string {
  const clean = hex.replace('#', '');
  const len = clean.length === 3 ? 1 : 2;
  const r = parseInt(clean.substring(0, len).padEnd(2, clean[0]), 16) / 255;
  const g = parseInt(clean.substring(len, len * 2).padEnd(2, clean[len]), 16) / 255;
  const b = parseInt(clean.substring(len * 2).padEnd(2, clean[len * 2] || '0'), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  const newS = s * factor;
  const h = max === min ? 0 : (max === r ? (g - b) / (max - min) : max === g ? 2 + (b - r) / (max - min) : 4 + (r - g) / (max - min));
  const hue = ((h * 60 + 360) % 360) / 360;
  return hslToHex(hue, newS, l);
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function desaturateColor(value: unknown, factor: number): unknown {
  if (typeof value !== 'string') return value;

  // hsl / hsla — simple saturation reduction
  const hslMatch = value.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/);
  if (hslMatch) {
    const h = hslMatch[1];
    const newS = parseFloat(hslMatch[2]) * factor;
    const l = hslMatch[3];
    const alpha = value.includes('hsla') ? value.match(/,\s*([\d.]+)\s*\)$/) : null;
    if (alpha) return `hsla(${h},${newS.toFixed(0)}%,${l}%,${alpha[1]})`;
    return `hsl(${h},${newS.toFixed(0)}%,${l}%)`;
  }

  // #hex
  const hexMatch = value.match(/^#[0-9a-fA-F]{3,8}$/);
  if (hexMatch) return desaturateHex(value, factor);

  // rgb / rgba
  const rgbMatch = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]) / 255;
    const g = parseInt(rgbMatch[2]) / 255;
    const b = parseInt(rgbMatch[3]) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
    const newS = s * factor;
    const h = max === min ? 0 : (max === r ? (g - b) / (max - min) : max === g ? 2 + (b - r) / (max - min) : 4 + (r - g) / (max - min));
    const hue = ((h * 60 + 360) % 360) / 360;
    const alpha = value.includes('rgba') ? value.match(/,\s*([\d.]+)\s*\)$/) : null;
    const hex = hslToHex(hue, newS, l);
    if (alpha) {
      const r2 = parseInt(hex.substring(1, 3), 16);
      const g2 = parseInt(hex.substring(3, 5), 16);
      const b2 = parseInt(hex.substring(5, 7), 16);
      return `rgba(${r2},${g2},${b2},${alpha[1]})`;
    }
    return hex;
  }

  return value;
}

function desaturateStyle(s: StyleSpecification, factor: number): StyleSpecification {
  const layers = s.layers.map((layer) => {
    if (!layer.paint) return layer;
    const paint: Record<string, unknown> = { ...layer.paint };
    for (const [key, val] of Object.entries(paint)) {
      if (typeof val === 'string') {
        paint[key] = desaturateColor(val, factor);
      } else if (Array.isArray(val)) {
        // Expression arrays may contain colors — walk recursively
        paint[key] = walkExpression(val, factor);
      }
    }
    return { ...layer, paint };
  });
  return { ...s, layers };
}

function walkExpression(expr: unknown[], factor: number): unknown[] {
  return expr.map((item) => {
    if (typeof item === 'string') return desaturateColor(item, factor);
    if (Array.isArray(item)) return walkExpression(item, factor);
    return item;
  }) as unknown[];
}

// Desaturate to 30% of original saturation
const desaturatedStyle: StyleSpecification = desaturateStyle(style as StyleSpecification, 0.3);

// ── Layer Definition ────────────────────────
export const basemapLayer: LayerDefinition = {
  id: 'basemap',
  label: 'Basiskarte',
  legend: 'OpenStreetMap via OpenFreeMap · Farben entsättigt',
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  minZoom: 0,
  defaultVisible: true,

  setup(map: Map): void {
    // The basemap IS the style — just set it
    map.setStyle(desaturatedStyle);
    // Re-add any overlay layers that might have been active before style change
    // (handled externally by the LayerRegistry)
  },

  teardown(_map: Map): void {
    // Basemap toggle is handled via setStyle in the Map component.
    // In practice the user toggling this off means showing no basemap.
  },
};

export { desaturatedStyle };
