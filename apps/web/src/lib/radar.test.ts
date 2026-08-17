import { describe, it, expect } from 'vitest';
import { pickRadarFrame, radarTileUrl, type RadarFrame } from './radar';

const frames: RadarFrame[] = [
  { time: 1000, path: '/v2/radar/1000' },
  { time: 2000, path: '/v2/radar/2000' },
  { time: 3000, path: '/v2/radar/3000' },
];

describe('pickRadarFrame', () => {
  it('picks the closest frame', () => {
    expect(pickRadarFrame(frames, 2100 * 1000)?.time).toBe(2000);
  });

  it('handles a target before the first frame', () => {
    expect(pickRadarFrame(frames, 500 * 1000)?.time).toBe(1000);
  });

  it('handles a target after the last frame (clamps to latest)', () => {
    expect(pickRadarFrame(frames, 9999 * 1000)?.time).toBe(3000);
  });

  it('returns null for an empty frame list', () => {
    expect(pickRadarFrame([], Date.now())).toBeNull();
  });
});

describe('radarTileUrl', () => {
  it('builds the XYZ template from host and frame path', () => {
    expect(radarTileUrl('https://tilecache.rainviewer.com', '/v2/radar/123')).toBe(
      'https://tilecache.rainviewer.com/v2/radar/123/256/{z}/{x}/{y}/2/1_1.png',
    );
  });
});
