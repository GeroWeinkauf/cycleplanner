import { useState, useEffect, useCallback } from 'react';
import { useProfileStore, DEFAULT_PROFILES } from '../store/useProfileStore';
import type { ProfileId, CostingOverrides, TuningPreset } from '@cycleplanner/shared';

const API_BASE = '/api';

// All tuning sliders with their specs
interface SliderSpec {
  key: keyof CostingOverrides;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Transform the stored value for display */
  display?: (v: number) => string;
  /** Which profiles have this at a different base value */
  perProfile?: boolean;
}

const ALL_SLIDERS: SliderSpec[] = [
  { key: 'cycling_speed', label: 'Reisegeschwindigkeit', min: 8, max: 40, step: 1, display: (v) => v.toFixed(0) + ' km/h' },
  { key: 'use_hills', label: 'Steigungsbereitschaft', min: 0, max: 1, step: 0.05, display: (v) => (v * 100).toFixed(0) + '%' },
  { key: 'street_avoidance', label: 'Straßenmeidung', min: 0, max: 1, step: 0.05, display: (v) => (v * 100).toFixed(0) + '%' },
  { key: 'avoid_bad_surfaces', label: 'Oberflächenstrenge', min: 0, max: 1, step: 0.05, display: (v) => (v * 100).toFixed(0) + '%' },
  { key: 'use_ferry', label: 'Fähren-Präferenz', min: 0, max: 1, step: 0.05, display: (v) => (v * 100).toFixed(0) + '%' },
  { key: 'use_living_streets', label: 'Wohnstraßen-Präferenz', min: 0, max: 1, step: 0.05, display: (v) => (v * 100).toFixed(0) + '%' },
  { key: 'use_trails', label: 'Trail-Präferenz', min: 0, max: 1, step: 0.05, display: (v) => (v * 100).toFixed(0) + '%' },
  { key: 'service_penalty', label: 'Service-Wege Strafe', min: 0, max: 200, step: 5, display: (v) => v.toFixed(0) },
  { key: 'maneuver_penalty', label: 'Abzweig-Strafe', min: 0, max: 50, step: 1, display: (v) => v.toFixed(0) },
  { key: 'gate_penalty', label: 'Tor-Strafe', min: 0, max: 1000, step: 10, display: (v) => v.toFixed(0) },
  { key: 'driveway_penalty', label: 'Einfahrt-Strafe', min: 0, max: 1000, step: 10, display: (v) => v.toFixed(0) },
  { key: 'alley_factor', label: 'Gassen-Faktor', min: 0.1, max: 3, step: 0.1, display: (v) => v.toFixed(1) },
  { key: 'country_crossing_penalty', label: 'Grenzübertritt-Strafe', min: 0, max: 500, step: 10, display: (v) => v.toFixed(0) },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function TuningPanel({ isOpen, onClose }: Props) {
  const { profile, overrides, setProfile, setOverride, resetOverrides, exclusionFlags, setExclusion } =
    useProfileStore();

  // ── Comparison mode ────────────────────────
  const [compareMode, setCompareMode] = useState(false);
  const [sideB, setSideB] = useState<{
    profile: ProfileId;
    overrides: CostingOverrides;
    exclusionFlags: typeof exclusionFlags;
  }>({ profile, overrides: {}, exclusionFlags: {} });
  const [activeSide, setActiveSide] = useState<'A' | 'B'>('A');

  // ── Presets ────────────────────────────────
  const [presets, setPresets] = useState<TuningPreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [showPresetInput, setShowPresetInput] = useState(false);

  // Load presets on mount
  useEffect(() => {
    fetch(API_BASE + '/tuning/presets')
      .then((r) => r.json())
      .then((d) => setPresets(d.presets || []))
      .catch(() => {});
  }, [isOpen]);

  // ── Slider helpers ─────────────────────────
  const getSliderValue = useCallback(
    (key: keyof CostingOverrides): number => {
      // In compare mode, show the active side's values
      if (compareMode && activeSide === 'B' && sideB.overrides[key] !== undefined) {
        return sideB.overrides[key] as number;
      }
      if (overrides[key] !== undefined) return overrides[key] as number;

      const baseCosting = DEFAULT_PROFILES[
        compareMode && activeSide === 'B' ? sideB.profile : profile
      ].costing;
      const baseImpl = DEFAULT_PROFILES[
        compareMode && activeSide === 'B' ? sideB.profile : profile
      ].implications;

      if (key === 'street_avoidance') return baseImpl.street_avoidance / 100;
      if (key === 'avoid_bad_surfaces') return baseImpl.surface_strictness / 100;
      return (baseCosting as Record<string, number>)[key] ?? 0;
    },
    [overrides, profile, compareMode, activeSide, sideB],
  );

  const isOverridden = useCallback(
    (key: keyof CostingOverrides): boolean => {
      if (compareMode && activeSide === 'B') return sideB.overrides[key] !== undefined;
      return overrides[key] !== undefined;
    },
    [overrides, compareMode, activeSide, sideB],
  );

  // ── Preset actions ─────────────────────────
  const handleLoadPreset = useCallback(
    (preset: TuningPreset) => {
      setProfile(preset.profile);
      for (const [k, v] of Object.entries(preset.overrides)) {
        setOverride(k as keyof CostingOverrides, v as number | undefined);
      }
      for (const [k, v] of Object.entries(preset.exclusionFlags)) {
        setExclusion(k as keyof typeof exclusionFlags, v as boolean);
      }
    },
    [setProfile, setOverride, setExclusion],
  );

  const handleSavePreset = useCallback(async () => {
    if (!presetName.trim()) return;
    const res = await fetch(API_BASE + '/tuning/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: presetName.trim(),
        profile,
        overrides,
        exclusionFlags,
      }),
    });
    if (res.ok) {
      const created = (await res.json()) as TuningPreset;
      setPresets((prev) => [created, ...prev]);
      setPresetName('');
      setShowPresetInput(false);
    }
  }, [presetName, profile, overrides, exclusionFlags]);

  const handleDeletePreset = useCallback(async (id: string) => {
    await fetch(API_BASE + '/tuning/presets/' + id, { method: 'DELETE' });
    setPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // ── Compare mode snapshot ──────────────────
  const handleToggleCompare = useCallback(() => {
    if (!compareMode) {
      // Enter compare mode: snapshot current state as B
      setSideB({
        profile,
        overrides: { ...overrides },
        exclusionFlags: { ...exclusionFlags },
      });
    }
    setCompareMode(!compareMode);
  }, [compareMode, profile, overrides, exclusionFlags]);

  // Handle Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-16 backdrop-blur-sm">
      <div className="max-h-[85vh] w-[480px] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
          <h2 className="text-sm font-bold text-gray-900">Tuning-Werkzeug</h2>
          <div className="flex items-center gap-2">
            {/* Compare toggle */}
            <button
              onClick={handleToggleCompare}
              className={
                'rounded px-2 py-1 text-xs font-medium ' +
                (compareMode
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200')
              }
            >
              {compareMode ? 'A/B aktiv' : 'A/B Vergleich'}
            </button>
            <button
              onClick={onClose}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* A/B tabs (compare mode) */}
        {compareMode && (
          <div className="flex border-b border-gray-200 bg-gray-50 px-4 py-1">
            <button
              onClick={() => setActiveSide('A')}
              className={
                'rounded px-3 py-1 text-xs font-medium ' +
                (activeSide === 'A' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500')
              }
            >
              Seite A
            </button>
            <button
              onClick={() => setActiveSide('B')}
              className={
                'rounded px-3 py-1 text-xs font-medium ' +
                (activeSide === 'B' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500')
              }
            >
              Seite B
            </button>
          </div>
        )}

        {/* Profile selector */}
        <div className="border-b border-gray-100 px-4 py-3">
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">Profil</label>
          <select
            value={compareMode && activeSide === 'B' ? sideB.profile : profile}
            onChange={(e) => {
              if (compareMode && activeSide === 'B') {
                setSideB((s) => ({ ...s, profile: e.target.value as ProfileId }));
              } else {
                setProfile(e.target.value as ProfileId);
              }
            }}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            {(['Tourenrad', 'Rennrad', 'Gravel', 'MTB'] as ProfileId[]).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Sliders */}
        <div className="flex flex-col gap-2 px-4 py-3">
          <label className="text-xs font-semibold uppercase text-gray-500">
            Kostenparameter
          </label>
          {ALL_SLIDERS.map((spec) => {
            const val = getSliderValue(spec.key);
            const overridden = isOverridden(spec.key);
            return (
              <div key={spec.key} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-xs text-gray-700">{spec.label}</span>
                <input
                  type="range"
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  value={val}
                  onChange={(e) => {
                    const num = parseFloat(e.target.value);
                    if (compareMode && activeSide === 'B') {
                      setSideB((s) => ({
                        ...s,
                        overrides: { ...s.overrides, [spec.key]: num },
                      }));
                    } else {
                      setOverride(spec.key, num);
                    }
                  }}
                  className={
                    'h-1.5 flex-1 cursor-pointer appearance-none rounded-full ' +
                    (overridden ? 'bg-blue-400' : 'bg-gray-200') +
                    ' [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:ring-1 [&::-webkit-slider-thumb]:ring-gray-300'
                  }
                />
                <span className="w-14 text-right text-xs tabular-nums text-gray-500">
                  {spec.display ? spec.display(val) : val.toFixed(1)}
                </span>
                {/* Reset to base button */}
                {overridden && (
                  <button
                    onClick={() => {
                      if (compareMode && activeSide === 'B') {
                        const newOverrides = { ...sideB.overrides };
                        delete newOverrides[spec.key];
                        setSideB((s) => ({ ...s, overrides: newOverrides }));
                      } else {
                        setOverride(spec.key, undefined);
                      }
                    }}
                    className="shrink-0 rounded p-0.5 text-gray-300 hover:text-gray-500"
                    title="Auf Basiswert zurücksetzen"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}

          {/* Hierarchy pruning toggle */}
          <div className="flex items-center gap-3 border-t border-gray-100 pt-2">
            <span className="w-40 shrink-0 text-xs text-gray-700">Hierarchiebeschneidung</span>
            <input
              type="checkbox"
              checked={!overrides.disable_hierarchy_pruning}
              onChange={(e) => setOverride('disable_hierarchy_pruning', !e.target.checked ? true : undefined)}
              className="h-3.5 w-3.5 accent-blue-600"
            />
            <span className="text-xs text-gray-400">
              {overrides.disable_hierarchy_pruning ? 'Aus (vollst. Suche)' : 'Ein'}
            </span>
          </div>

          {Object.keys(overrides).length > 0 && (
            <button
              onClick={resetOverrides}
              className="mt-1 text-xs text-blue-600 hover:text-blue-800"
            >
              Alle Regler auf Profil-Standard
            </button>
          )}
        </div>

        {/* Presets section */}
        <div className="border-t border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase text-gray-500">
              Voreinstellungen
            </label>
            <button
              onClick={() => setShowPresetInput(!showPresetInput)}
              className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-100"
            >
              + Speichern
            </button>
          </div>

          {showPresetInput && (
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Name der Voreinstellung"
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
              />
              <button
                onClick={handleSavePreset}
                className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
              >
                OK
              </button>
            </div>
          )}

          {/* Preset list */}
          {presets.length > 0 && (
            <div className="mt-2 max-h-32 overflow-y-auto">
              {presets.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-gray-50"
                >
                  <button
                    onClick={() => handleLoadPreset(p)}
                    className="flex-1 text-left text-gray-700 hover:text-blue-600"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="ml-1.5 text-gray-400">
                      ({p.profile}{p.builtin ? ' · Standard' : ''})
                    </span>
                  </button>
                  {!p.builtin && (
                    <button
                      onClick={() => handleDeletePreset(p.id)}
                      className="shrink-0 p-0.5 text-gray-300 hover:text-red-500"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
