import { describe, it, expect } from 'vitest';
import { expandTileUrls, getBasemap } from './basemaps';

describe('expandTileUrls', () => {
  it('expands {s} into one URL per subdomain', () => {
    expect(expandTileUrls('https://{s}.example.com/{z}/{x}/{y}.png', ['a', 'b', 'c'])).toEqual([
      'https://a.example.com/{z}/{x}/{y}.png',
      'https://b.example.com/{z}/{x}/{y}.png',
      'https://c.example.com/{z}/{x}/{y}.png',
    ]);
  });

  it('keeps the URL as-is when there is no {s} placeholder', () => {
    expect(expandTileUrls('https://example.com/{z}/{x}/{y}.png', ['a', 'b'])).toEqual([
      'https://example.com/{z}/{x}/{y}.png',
    ]);
  });

  it('keeps the URL as-is when no subdomains are given', () => {
    expect(expandTileUrls('https://{s}.example.com/{z}/{x}/{y}.png')).toEqual([
      'https://{s}.example.com/{z}/{x}/{y}.png',
    ]);
  });
});

describe('getBasemap', () => {
  it('returns the default basemap for unknown ids', () => {
    expect(getBasemap('does-not-exist').id).toBe('osm');
  });

  it('finds basemaps by id', () => {
    expect(getBasemap('cyclosm').id).toBe('cyclosm');
  });
});
