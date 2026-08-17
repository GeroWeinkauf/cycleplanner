/** A single radar frame as delivered by the RainViewer API */
export interface RadarFrame {
  time: number;   // unix seconds
  path: string;   // e.g. '/v2/radar/1690000000'
}

/**
 * Pick the radar frame closest to the target time (unix ms).
 * Prefers frames before the target over frames after it when both are
 * equally close (a forecast for a past point is more reliable than a
 * stale past frame for a future point is useless — so for future
 * targets the nowcast frames naturally win because past frames end "now").
 */
export function pickRadarFrame(frames: RadarFrame[], targetMs: number): RadarFrame | null {
  if (frames.length === 0) return null;
  const targetSec = targetMs / 1000;
  let best = frames[0];
  let bestDiff = Math.abs(best.time - targetSec);
  for (const f of frames) {
    const diff = Math.abs(f.time - targetSec);
    if (diff < bestDiff) {
      best = f;
      bestDiff = diff;
    }
  }
  return best;
}

/** Build the XYZ tile URL template for a RainViewer frame */
export function radarTileUrl(host: string, framePath: string): string {
  return host + framePath + '/256/{z}/{x}/{y}/2/1_1.png';
}
