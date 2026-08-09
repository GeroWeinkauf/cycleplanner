/**
 * Database module for CyclePlanner.
 *
 * Uses better-sqlite3 if available, otherwise falls back to a
 * simple JSON-file store. Both implement the same Database interface.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

// ── Database interface ──────────────────────

export interface Database {
  /** Execute a SELECT query and return all matching rows */
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
  /** Execute a SELECT query and return the first matching row */
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined;
  /** Execute an INSERT/UPDATE/DELETE and return info */
  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  /** Execute raw SQL without returning rows */
  exec(sql: string): void;
  /** Begin a transaction */
  transaction<T>(fn: () => T): T;
  /** Close the database connection */
  close(): void;
}

// ── Try to load better-sqlite3 ──────────────

let db: Database;

function loadSqlite(): Database | null {
  try {
    const require = createRequire(import.meta.url);
    const BetterSqlite3 = require('better-sqlite3');
    const sqlite = new BetterSqlite3('data/cycleplanner.db');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    return {
      all<T>(sql: string, params?: unknown[]): T[] {
        const stmt = sqlite.prepare(sql);
        if (params) return stmt.all(...params) as T[];
        return stmt.all() as T[];
      },
      get<T>(sql: string, params?: unknown[]): T | undefined {
        const stmt = sqlite.prepare(sql);
        if (params) return stmt.get(...params) as T | undefined;
        return stmt.get() as T | undefined;
      },
      run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
        const stmt = sqlite.prepare(sql);
        if (params) return stmt.run(...params);
        return stmt.run();
      },
      exec(sql: string): void {
        sqlite.exec(sql);
      },
      transaction<T>(fn: () => T): T {
        const tx = sqlite.transaction(fn);
        return tx();
      },
      close(): void {
        sqlite.close();
      },
    };
  } catch {
    return null;
  }
}

// ── JSON file fallback ──────────────────────

function loadJsonDb(): Database {
  const dbPath = resolve(process.cwd(), 'data/cycleplanner.json');

  // Ensure data directory exists
  const dataDir = resolve(process.cwd(), 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  let tables: Record<string, Record<string, unknown>[]> = {};
  let autoIncrement: Record<string, number> = {};

  // Load existing data
  if (existsSync(dbPath)) {
    try {
      const raw = readFileSync(dbPath, 'utf-8');
      const data = JSON.parse(raw);
      tables = data.tables || {};
      autoIncrement = data.autoIncrement || {};
    } catch {
      // Start fresh
    }
  }

  function save(): void {
    writeFileSync(dbPath, JSON.stringify({ tables, autoIncrement }, null, 2));
  }

  function parseJsonSql(sql: string): {
    action: 'select' | 'insert' | 'update' | 'delete' | 'exec';
  } {
    const upper = sql.trim().toUpperCase();
    if (upper.startsWith('SELECT')) return { action: 'select' };
    if (upper.startsWith('INSERT')) return { action: 'insert' };
    if (upper.startsWith('UPDATE')) return { action: 'update' };
    if (upper.startsWith('DELETE')) return { action: 'delete' };
    return { action: 'exec' };
  }

  // Simple SQL parser for our limited use cases
  function query(sql: string, params?: unknown[]): Record<string, unknown>[] {
    const tableMatch = sql.match(/FROM\s+(\w+)/i);
    if (!tableMatch) return [];
    const tableName = tableMatch[1];
    const rows = tables[tableName] || [];

    // For INSERT: parse columns and values
    if (sql.trim().toUpperCase().startsWith('INSERT')) {
      const colMatch = sql.match(/\(([^)]+)\)/);
      if (!colMatch) return [];
      const cols = colMatch[1].split(',').map((c) => c.trim());

      const row: Record<string, unknown> = {};
      if (params) {
        for (let i = 0; i < cols.length; i++) {
          row[cols[i]] = params[i] ?? null;
        }
      } else {
        const valuesMatch = sql.match(/VALUES\s*\(([^)]+)\)/);
        if (valuesMatch) {
          const vals = valuesMatch[1].split(',').map((v) => {
            const trimmed = v.trim();
            if (trimmed.startsWith("'") || trimmed.startsWith('"'))
              return trimmed.slice(1, -1);
            if (trimmed === 'NULL') return null;
            const num = Number(trimmed);
            return isNaN(num) ? trimmed : num;
          });
          for (let i = 0; i < cols.length; i++) {
            row[cols[i]] = vals[i] ?? null;
          }
        }
      }

      // Auto-increment ID
      if (!row.id) {
        if (!autoIncrement[tableName]) autoIncrement[tableName] = 0;
        row.id = 'json-' + (++autoIncrement[tableName]);
      }

      // Handle ON CONFLICT / REPLACE
      const conflictMatch = sql.match(/ON\s+CONFLICT\s*\(([^)]+)\)/i);
      if (conflictMatch) {
        const conflictCol = conflictMatch[1].trim();
        const existingIdx = rows.findIndex((r) => r[conflictCol] === row[conflictCol]);
        if (existingIdx >= 0) {
          rows[existingIdx] = { ...rows[existingIdx], ...row };
        } else {
          rows.push(row);
        }
      } else {
        rows.push(row);
      }

      tables[tableName] = rows;
      save();
      return [row];
    }

    // For UPDATE
    if (sql.trim().toUpperCase().startsWith('UPDATE')) {
      const setMatch = sql.match(/SET\s+(.+?)(?:\s+WHERE|$)/i);
      const whereMatch = sql.match(/WHERE\s+(.+?)$/i);

      if (setMatch && params) {
        const setClause = setMatch[1];
        const setCols = setClause.split(',').map((c) => c.trim().split('=')[0].trim());
        const whereCol = whereMatch ? whereMatch[1].split('=')[0].trim() : 'id';

        for (let i = 0; i < rows.length; i++) {
          // Simple where matching
          const whereVal = params[setCols.length];
          if (String(rows[i][whereCol]) === String(whereVal)) {
            const updated = { ...rows[i] };
            for (let j = 0; j < setCols.length; j++) {
              updated[setCols[j]] = params[j] ?? null;
            }
            updated.updatedAt = new Date().toISOString();
            rows[i] = updated;
            tables[tableName] = rows;
            save();
            return [updated];
          }
        }
      }
      return [];
    }

    // For DELETE
    if (sql.trim().toUpperCase().startsWith('DELETE')) {
      const whereMatch = sql.match(/WHERE\s+(.+?)$/i);
      if (whereMatch && params) {
        const whereCol = whereMatch[1].split('=')[0].trim();
        const filtered = rows.filter((r) => String(r[whereCol]) !== String(params[0]));
        tables[tableName] = filtered;
        save();
      }
      return [];
    }

    // For SELECT
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s*$)/i);
    const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)\s*(ASC|DESC)?/i);
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);

    let result = [...rows];

    if (whereMatch && params && params.length > 0) {
      const whereClause = whereMatch[1];
      // Simple equality: col = ?
      const eqMatch = whereClause.match(/(\w+)\s*=\s*\?/);
      if (eqMatch) {
        const col = eqMatch[1];
        result = result.filter((r) => String(r[col]) === String(params[0]));
      }
    }

    if (orderMatch) {
      const orderCol = orderMatch[1];
      const orderDir = orderMatch[2] === 'DESC' ? -1 : 1;
      result.sort((a, b) => {
        const va = String(a[orderCol] || '');
        const vb = String(b[orderCol] || '');
        return va.localeCompare(vb) * orderDir;
      });
    }

    if (limitMatch) {
      const limit = parseInt(limitMatch[1]);
      result = result.slice(0, limit);
    }

    return result;
  }

  return {
    all<T>(sql: string, params?: unknown[]): T[] {
      return query(sql, params) as T[];
    },
    get<T>(sql: string, params?: unknown[]): T | undefined {
      const rows = query(sql, params);
      return rows.length > 0 ? (rows[0] as T) : undefined;
    },
    run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
      const before = query('SELECT COUNT(*) as cnt FROM ' + (sql.match(/FROM\s+(\w+)/i)?.[1] || 'unknown'));
      query(sql, params);
      const after = query('SELECT COUNT(*) as cnt FROM ' + (sql.match(/FROM\s+(\w+)/i)?.[1] || 'unknown'));
      return {
        changes: Math.abs((after[0]?.cnt as number || 0) - (before[0]?.cnt as number || 0)),
        lastInsertRowid: 0n,
      };
    },
    exec(sql: string): void {
      // Parse CREATE TABLE statements
      const createMatch = sql.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)\s*\(([\s\S]*?)\);?/i);
      if (createMatch) {
        const tableName = createMatch[1];
        if (!tables[tableName]) {
          tables[tableName] = [];
          save();
        }
      }
    },
    transaction<T>(fn: () => T): T {
      return fn();
    },
    close(): void {
      // no-op
    },
  };
}

// ── Initialize ──────────────────────────────

const sqliteDb = loadSqlite();
if (sqliteDb) {
  db = sqliteDb;
} else {
  console.warn('better-sqlite3 not available, using JSON file fallback');
  db = loadJsonDb();
}

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS tuning_presets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    profile TEXT NOT NULL,
    overrides TEXT NOT NULL DEFAULT '{}',
    exclusion_flags TEXT NOT NULL DEFAULT '{}',
    builtin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

// Seed built-in presets if empty
const count = db.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM tuning_presets');
if (count && count.cnt === 0) {
  const now = new Date().toISOString();
  const builtins = [
    { id: 'builtin-tourenrad', name: 'Tourenrad (Standard)', profile: 'Tourenrad', overrides: '{}', exclusion_flags: '{}' },
    { id: 'builtin-rennrad', name: 'Rennrad (Standard)', profile: 'Rennrad', overrides: '{}', exclusion_flags: '{}' },
    { id: 'builtin-gravel', name: 'Gravel (Standard)', profile: 'Gravel', overrides: '{}', exclusion_flags: '{}' },
    { id: 'builtin-mtb', name: 'MTB (Standard)', profile: 'MTB', overrides: '{}', exclusion_flags: '{}' },
  ];
  const insert = db.transaction(() => {
    for (const p of builtins) {
      db.run(
        'INSERT INTO tuning_presets (id, name, profile, overrides, exclusion_flags, builtin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
        [p.id, p.name, p.profile, p.overrides, p.exclusion_flags, now, now],
      );
    }
  });
  insert();
}

export { db };
