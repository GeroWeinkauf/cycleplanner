/**
 * Elevation tile cache.
 *
 * Caches decoded elevation values from Terrarium tiles.
 * Runs in-memory with an LRU eviction policy.
 *
 * When better-sqlite3 is available, tiles are also persisted to disk,
 * surviving restarts and reducing S3 requests across sessions.
 */

/** An elevation tile — 256×256 array of float elevation values */
export interface ElevationTile {
  /** Tile x coordinate (Web Mercator) */
  x: number;
  /** Tile y coordinate (Web Mercator) */
  y: number;
  /** Tile zoom level */
  zoom: number;
  /** 256×256 elevation values in meters, row-major */
  elevations: Float32Array;
  /** When this tile was fetched/created */
  fetchedAt: number;
}

const MAX_MEMORY_TILES = 200;
const TILE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Simple LRU eviction tracking */
interface CacheEntry {
  tile: ElevationTile;
  lastAccess: number;
}

let dbModule: unknown = null;
let dbInstance: unknown = null;
let dbInitAttempted = false;

/** Try to load better-sqlite3. Returns true if successful. */
function tryInitDb(): boolean {
  if (dbInitAttempted) return dbModule !== null;
  dbInitAttempted = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3');
    const db = new (Database as any)('data/elevation_cache.db') as any;
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS elevation_cache (
        tile_key TEXT PRIMARY KEY,
        data BLOB NOT NULL,
        fetched_at INTEGER NOT NULL
      )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_fetched_at ON elevation_cache(fetched_at)');
    dbModule = Database;
    dbInstance = db;
    return true;
  } catch {
    dbModule = null;
    dbInstance = null;
    return false;
  }
}

function getDb(): any | null {
  if (!dbInstance && !dbInitAttempted) tryInitDb();
  return dbInstance as any | null;
}

function tileKey(x: number, y: number, zoom: number): string {
  return `${zoom}/${x}/${y}`;
}

export class TileCache {
  private cache = new Map<string, CacheEntry>();

  /** Look up a tile from cache */
  get(x: number, y: number, zoom: number): ElevationTile | null {
    const key = tileKey(x, y, zoom);

    // Check memory cache first
    const entry = this.cache.get(key);
    if (entry) {
      entry.lastAccess = Date.now();
      if (Date.now() - entry.tile.fetchedAt > TILE_EXPIRY_MS) {
        this.cache.delete(key);
      } else {
        return entry.tile;
      }
    }

    // Try persistent DB
    const db = getDb();
    if (db) {
      try {
        const row = db.prepare('SELECT data, fetched_at FROM elevation_cache WHERE tile_key = ?').get(key) as
          | { data: Buffer; fetched_at: number }
          | undefined;
        if (row) {
          if (Date.now() - row.fetched_at > TILE_EXPIRY_MS) {
            db.prepare('DELETE FROM elevation_cache WHERE tile_key = ?').run(key);
            return null;
          }
          const elevations = new Float32Array(
            new Uint8Array(row.data.buffer, row.data.byteOffset, row.data.byteLength).buffer,
          );
          const tile: ElevationTile = { x, y, zoom, elevations, fetchedAt: row.fetched_at };
          this.cache.set(key, { tile, lastAccess: Date.now() });
          return tile;
        }
      } catch {
        // DB read error — tile not cached
      }
    }

    return null;
  }

  /** Store a tile in cache */
  set(tile: ElevationTile): void {
    const key = tileKey(tile.x, tile.y, tile.zoom);

    this.cache.set(key, { tile, lastAccess: Date.now() });

    if (this.cache.size > MAX_MEMORY_TILES) {
      this.evictOldest();
    }

    const db = getDb();
    if (db) {
      try {
        const buffer = Buffer.from(tile.elevations.buffer);
        db.prepare(
          'INSERT OR REPLACE INTO elevation_cache (tile_key, data, fetched_at) VALUES (?, ?, ?)',
        ).run(key, buffer, tile.fetchedAt);
      } catch {
        // DB write error — cache is still valid in memory
      }
    }
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [k, e] of this.cache) {
      if (e.lastAccess < oldestTime) {
        oldestTime = e.lastAccess;
        oldestKey = k;
      }
    }
    if (oldestKey) this.cache.delete(oldestKey);
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
    const db = getDb();
    if (db) {
      try {
        db.exec('DELETE FROM elevation_cache');
      } catch {
        // ignore
      }
    }
  }
}

/** Singleton cache instance */
export const tileCache = new TileCache();
