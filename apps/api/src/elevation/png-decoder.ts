/**
 * Minimal PNG decoder for 8-bit RGB images (Terrarium tiles).
 *
 * This is intentionally kept minimal because our only use case is
 * decoding 256×256 px 8-bit RGB PNGs from the Terrarium S3 bucket.
 * No interlacing, no palette, no alpha, no 16-bit — just the subset
 * we actually need.
 *
 * Uses only built-in Node.js modules (zlib for decompression).
 */
import { inflateSync } from 'node:zlib';

/** PNG signature bytes */
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Raw decoded pixel data with metadata */
export interface DecodedPng {
  width: number;
  height: number;
  /** RGBA pixel data, 4 bytes per pixel */
  data: Buffer;
}

/** PNG chunk header (length + type) */
interface ChunkHeader {
  length: number;
  type: string;
}

/**
 * Decode an 8-bit RGB or RGBA PNG from a Buffer.
 * Only handles color types 2 (RGB) and 6 (RGBA).
 */
export function decodePng(buffer: Buffer): DecodedPng {
  // ── Verify signature ──────────────────────
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Not a valid PNG file (bad signature)');
  }

  let offset = 8;
  const chunks: Map<string, Buffer> = new Map();
  const idatChunks: Buffer[] = [];

  // ── Parse chunks ──────────────────────────
  while (offset < buffer.length) {
    const header = readChunkHeader(buffer, offset);
    offset += 8; // skip length + type
    const data = buffer.subarray(offset, offset + header.length);
    offset += header.length + 4; // skip data + CRC

    if (header.type === 'IHDR') {
      chunks.set('IHDR', data);
    } else if (header.type === 'IDAT') {
      idatChunks.push(data);
    } else if (header.type === 'IEND') {
      break;
    }
  }

  const ihdr = chunks.get('IHDR');
  if (!ihdr) throw new Error('PNG missing IHDR chunk');

  // ── Parse IHDR ────────────────────────────
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr.readUInt8(8);
  const colorType = ihdr.readUInt8(9);
  const compression = ihdr.readUInt8(10);
  const filter = ihdr.readUInt8(11);
  const interlace = ihdr.readUInt8(12);

  if (bitDepth !== 8) {
    throw new Error(`Unsupported bit depth: ${bitDepth} (only 8-bit supported)`);
  }
  if (interlace !== 0) {
    throw new Error('Interlaced PNG not supported');
  }
  if (compression !== 0) {
    throw new Error('Unknown compression method');
  }
  if (filter !== 0) {
    throw new Error('Unknown filter method');
  }

  let bpp: number;
  if (colorType === 2) {
    // RGB
    bpp = 3;
  } else if (colorType === 6) {
    // RGBA
    bpp = 4;
  } else {
    throw new Error(`Unsupported color type: ${colorType} (only RGB=2 and RGBA=6 supported)`);
  }

  // ── Decompress IDAT ───────────────────────
  const compressed = Buffer.concat(idatChunks);
  const decompressed = inflateSync(compressed);

  // ── Unfilter scanlines ────────────────────
  const stride = width * bpp;
  const raw = unfilter(decompressed, width, height, bpp);

  // ── Convert to RGBA ───────────────────────
  const output = Buffer.alloc(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const srcOff = i * bpp;
    const dstOff = i * 4;

    if (bpp >= 3) {
      output[dstOff] = raw[srcOff];       // R
      output[dstOff + 1] = raw[srcOff + 1]; // G
      output[dstOff + 2] = raw[srcOff + 2]; // B
      output[dstOff + 3] = bpp === 4 ? raw[srcOff + 3] : 255; // A
    }
  }

  return { width, height, data: output };
}

function readChunkHeader(buffer: Buffer, offset: number): ChunkHeader {
  const length = buffer.readUInt32BE(offset);
  const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
  return { length, type };
}

/**
 * Apply PNG unfiltering to decompressed scanlines.
 *
 * Each scanline begins with a filter byte (0–4), followed by pixel data.
 * The filter byte tells how to recover the original pixel data.
 *
 * Filter types:
 *   0 = None    (no filtering)
 *   1 = Sub     (difference from left pixel)
 *   2 = Up      (difference from above pixel)
 *   3 = Average (average of left and above)
 *   4 = Paeth   (Paeth predictor)
 */
function unfilter(
  src: Buffer,
  width: number,
  height: number,
  bpp: number,
): Buffer {
  const stride = width * bpp;
  const dst = Buffer.alloc(height * stride);
  const rowLen = 1 + stride; // filter byte + pixels

  for (let y = 0; y < height; y++) {
    const srcOff = y * rowLen;
    const filterType = src[srcOff];
    const srcRow = src.subarray(srcOff + 1, srcOff + rowLen);
    const dstRow = dst.subarray(y * stride, (y + 1) * stride);

    if (filterType === 0) {
      // None
      srcRow.copy(dstRow);
    } else if (filterType === 1) {
      // Sub
      for (let x = 0; x < stride; x++) {
        const left = x >= bpp ? dstRow[x - bpp] : 0;
        dstRow[x] = (srcRow[x] + left) & 0xff;
      }
    } else if (filterType === 2) {
      // Up
      const prevRow = y > 0 ? dst.subarray((y - 1) * stride, y * stride) : null;
      for (let x = 0; x < stride; x++) {
        const up = prevRow ? prevRow[x] : 0;
        dstRow[x] = (srcRow[x] + up) & 0xff;
      }
    } else if (filterType === 3) {
      // Average
      const prevRow = y > 0 ? dst.subarray((y - 1) * stride, y * stride) : null;
      for (let x = 0; x < stride; x++) {
        const left = x >= bpp ? dstRow[x - bpp] : 0;
        const up = prevRow ? prevRow[x] : 0;
        dstRow[x] = (srcRow[x] + Math.floor((left + up) / 2)) & 0xff;
      }
    } else if (filterType === 4) {
      // Paeth
      const prevRow = y > 0 ? dst.subarray((y - 1) * stride, y * stride) : null;
      for (let x = 0; x < stride; x++) {
        const left = x >= bpp ? dstRow[x - bpp] : 0;
        const up = prevRow ? prevRow[x] : 0;
        const upLeft = x >= bpp && prevRow ? prevRow[x - bpp] : 0;
        dstRow[x] = (srcRow[x] + paethPredictor(left, up, upLeft)) & 0xff;
      }
    } else {
      throw new Error(`Unknown PNG filter type: ${filterType}`);
    }
  }

  return dst;
}

/** Paeth predictor for PNG filtering */
function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
