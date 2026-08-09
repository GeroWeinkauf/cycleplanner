import { describe, it, expect } from 'vitest';
import { buildApp } from './index.js';

describe('GET /api/health', () => {
  it('returns status ok', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});

describe('POST /api/export/gpx', () => {
  it('generates valid GPX track XML', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/export/gpx',
      payload: {
        geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@', // small encoded polyline
        waypoints: [{ lat: 51.0, lng: 12.0, label: 'Start' }],
        name: 'Test Tour',
        mode: 'track',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { gpx: string; filename: string };
    expect(body.gpx).toContain('<?xml');
    expect(body.gpx).toContain('<gpx');
    expect(body.gpx).toContain('<trk>');
    expect(body.gpx).toContain('<wpt');
    expect(body.gpx).toContain('Test Tour');
    expect(body.filename).toContain('.gpx');
  });

  it('generates valid GPX route XML', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/export/gpx',
      payload: {
        geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
        waypoints: [{ lat: 51.0, lng: 12.0 }],
        mode: 'route',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { gpx: string; filename: string };
    expect(body.gpx).toContain('<rte>');
    expect(body.gpx).toContain('<rtept');
  });

  it('generates valid GPX waypoint-only export', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/export/gpx',
      payload: {
        geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
        waypoints: [{ lat: 51.0, lng: 12.0, label: 'A' }, { lat: 52.0, lng: 13.0, label: 'B' }],
        mode: 'waypoints',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { gpx: string; filename: string };
    expect(body.gpx).toContain('<wpt lat="51');
    expect(body.gpx).toContain('<wpt lat="52');
  });

  it('escapes XML special characters in names', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/export/gpx',
      payload: {
        geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
        waypoints: [],
        name: 'Test & <Tour> "Fun"',
        mode: 'track',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { gpx: string; filename: string };
    expect(body.gpx).not.toContain('Test & <Tour>');
    expect(body.gpx).toContain('&amp;');
    expect(body.gpx).toContain('&lt;');
    expect(body.gpx).toContain('&gt;');
    expect(body.gpx).toContain('&quot;');
  });
});

describe('POST /api/import/gpx', () => {
  it('parses waypoints from GPX', async () => {
    const app = buildApp();
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">
  <wpt lat="51.1234" lon="12.5678">
    <name>Startpunkt</name>
  </wpt>
  <wpt lat="52.0000" lon="13.0000">
    <name>Endpunkt</name>
  </wpt>
</gpx>`;

    const res = await app.inject({
      method: 'POST',
      url: '/api/import/gpx',
      payload: { gpx },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { waypoints: Array<{ lat: number; lng: number; label?: string }> };
    expect(body.waypoints).toHaveLength(2);
    expect(body.waypoints[0].lat).toBeCloseTo(51.1234, 4);
    expect(body.waypoints[0].lng).toBeCloseTo(12.5678, 4);
    expect(body.waypoints[0].label).toBe('Startpunkt');
  });

  it('parses track points from GPX', async () => {
    const app = buildApp();
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">
  <trk>
    <trkseg>
      <trkpt lat="51.0" lon="12.0"></trkpt>
      <trkpt lat="52.0" lon="13.0"></trkpt>
      <trkpt lat="53.0" lon="14.0"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

    const res = await app.inject({
      method: 'POST',
      url: '/api/import/gpx',
      payload: { gpx },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { waypoints: Array<{ lat: number; lng: number; label?: string }> };
    expect(body.waypoints.length).toBeGreaterThan(0);
    expect(body.waypoints[0].lat).toBeCloseTo(51.0, 4);
  });

  it('returns empty for invalid GPX', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/import/gpx',
      payload: { gpx: 'not valid gpx at all' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as { waypoints: Array<{ lat: number; lng: number; label?: string }> };
    expect(body.waypoints).toHaveLength(0);
  });
});
