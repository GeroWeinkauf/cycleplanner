/**
 * Tuning Presets CRUD
 *
 * Operates on the tuning_presets table managed by the database module.
 * Built-in presets (builtin=1) cannot be deleted, only duplicated.
 */
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import type {
  TuningPreset,
  TuningPresetCreateRequest,
  TuningPresetUpdateRequest,
  TuningPresetListResponse,
  ProfileId,
  CostingOverrides,
  ExclusionFlags,
} from '@cycleplanner/shared';

/** Row as stored in the database */
interface PresetRow {
  id: string;
  name: string;
  profile: string;
  overrides: string;
  exclusion_flags: string;
  builtin: number;
  created_at: string;
  updated_at: string;
}

/** Parse a JSON text field, returning the default if invalid */
function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** Convert a database row to the API response type */
function rowToPreset(row: PresetRow): TuningPreset {
  return {
    id: row.id,
    name: row.name,
    profile: row.profile as ProfileId,
    overrides: parseJson<CostingOverrides>(row.overrides, {}),
    exclusionFlags: parseJson<ExclusionFlags>(row.exclusion_flags, {}),
    builtin: row.builtin === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** List all presets, newest first */
export function listPresets(): TuningPresetListResponse {
  const rows = db.all<PresetRow>(
    'SELECT * FROM tuning_presets ORDER BY builtin ASC, updated_at DESC',
  );
  return { presets: rows.map(rowToPreset) };
}

/** Get a single preset by ID */
export function getPreset(id: string): TuningPreset | null {
  const row = db.get<PresetRow>('SELECT * FROM tuning_presets WHERE id = ?', [id]);
  if (!row) return null;
  return rowToPreset(row);
}

/** Create a new preset */
export function createPreset(req: TuningPresetCreateRequest): TuningPreset {
  const id = randomUUID();
  const now = new Date().toISOString();

  db.run(
    'INSERT INTO tuning_presets (id, name, profile, overrides, exclusion_flags, builtin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
    [
      id,
      req.name,
      req.profile,
      JSON.stringify(req.overrides),
      JSON.stringify(req.exclusionFlags),
      now,
      now,
    ],
  );

  return {
    id,
    name: req.name,
    profile: req.profile,
    overrides: req.overrides,
    exclusionFlags: req.exclusionFlags,
    builtin: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** Update an existing preset. Returns null if not found or if it's builtin. */
export function updatePreset(id: string, req: TuningPresetUpdateRequest): TuningPreset | null {
  const existing = db.get<PresetRow>('SELECT * FROM tuning_presets WHERE id = ?', [id]);
  if (!existing) return null;

  const preset = rowToPreset(existing);
  const now = new Date().toISOString();

  const name = req.name ?? preset.name;
  const profile = req.profile ?? preset.profile;
  const overrides = req.overrides ?? preset.overrides;
  const exclusionFlags = req.exclusionFlags ?? preset.exclusionFlags;

  db.run(
    'UPDATE tuning_presets SET name = ?, profile = ?, overrides = ?, exclusion_flags = ?, updated_at = ? WHERE id = ?',
    [
      name,
      profile,
      JSON.stringify(overrides),
      JSON.stringify(exclusionFlags),
      now,
      id,
    ],
  );

  return {
    id,
    name,
    profile,
    overrides,
    exclusionFlags,
    builtin: preset.builtin,
    createdAt: preset.createdAt,
    updatedAt: now,
  };
}

/** Delete a preset. Returns false if not found or if it's builtin. */
export function deletePreset(id: string): boolean {
  const existing = db.get<PresetRow>('SELECT * FROM tuning_presets WHERE id = ?', [id]);
  if (!existing) return false;
  if (existing.builtin === 1) return false; // Cannot delete built-in presets

  db.run('DELETE FROM tuning_presets WHERE id = ?', [id]);
  return true;
}

