import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectWebGL } from './webgl';

describe('detectWebGL', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns true when a webgl2 context is available', () => {
    vi.spyOn(document, 'createElement').mockReturnValue({
      getContext: vi.fn().mockImplementation((type: string) =>
        type === 'webgl2' ? ({ isWebGL2: true } as unknown as WebGLRenderingContext) : null,
      ),
    } as unknown as HTMLCanvasElement);
    expect(detectWebGL()).toBe(true);
  });

  it('returns true when only webgl1 is available', () => {
    vi.spyOn(document, 'createElement').mockReturnValue({
      getContext: vi.fn().mockImplementation((type: string) =>
        type === 'webgl2' ? null : type === 'webgl' ? ({} as WebGLRenderingContext) : null,
      ),
    } as unknown as HTMLCanvasElement);
    expect(detectWebGL()).toBe(true);
  });

  it('returns false when no WebGL context can be created', () => {
    vi.spyOn(document, 'createElement').mockReturnValue({
      getContext: vi.fn().mockReturnValue(null),
    } as unknown as HTMLCanvasElement);
    expect(detectWebGL()).toBe(false);
  });

  it('returns false when getContext throws', () => {
    vi.spyOn(document, 'createElement').mockReturnValue({
      getContext: vi.fn().mockImplementation(() => {
        throw new Error('no canvas');
      }),
    } as unknown as HTMLCanvasElement);
    expect(detectWebGL()).toBe(false);
  });
});
