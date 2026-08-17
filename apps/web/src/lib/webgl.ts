/**
 * WebGL capability detection.
 *
 * MapLibre GL requires WebGL; Leaflet (Canvas 2D) does not. Some
 * environments (VMs, Remote Desktop, disabled GPU acceleration) only offer
 * software WebGL or none at all — there the app falls back to Leaflet.
 */
export function detectWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return !!gl;
  } catch {
    return false;
  }
}

/** Same probe with the context attributes MapLibre GL requests */
export function detectWebGLForMapLibre(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const attrs: WebGLContextAttributes = {
      antialias: true,
      preserveDrawingBuffer: true,
      failIfMajorPerformanceCaveat: false,
    };
    const gl =
      canvas.getContext('webgl2', attrs) ||
      canvas.getContext('webgl', attrs) ||
      canvas.getContext('experimental-webgl', attrs);
    return !!gl;
  } catch {
    return false;
  }
}
