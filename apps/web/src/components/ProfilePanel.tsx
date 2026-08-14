import { useState } from 'react';
import { useProfileStore, DEFAULT_PROFILES } from '../store/useProfileStore';
import type { ProfileId, ExclusionFlags, NumericCostingKey } from '@cycleplanner/shared';

const PROFILE_IDS: ProfileId[] = ['Tourenrad', 'Rennrad', 'Gravel', 'MTB'];

const SLIDER_SPECS: { key: NumericCostingKey; label: string }[] = [
  { key: 'use_hills', label: 'Steigungsbereitschaft' },
  { key: 'street_avoidance', label: 'Straßenmeidung' },
  { key: 'avoid_bad_surfaces', label: 'Oberflächenstrenge' },
];

const EXCLUSION_SPECS: { key: keyof ExclusionFlags; label: string; description: string }[] = [
  { key: 'exclude_unpaved', label: 'Unbefestigte Wege', description: 'Kein Schotter / Naturboden' },
  { key: 'exclude_ferries', label: 'Faehren', description: 'Keine Faehrverbindungen' },
  { key: 'exclude_tunnels', label: 'Tunnel', description: 'Tunnel meiden' },
  { key: 'exclude_bridges', label: 'Bruecken', description: 'Bruecken meiden' },
  { key: 'exclude_highways', label: 'Landstrassen (hart)', description: 'Keine Land-/Bundesstrassen' },
];

export default function ProfilePanel() {
  const [showSettings, setShowSettings] = useState(false);
  const {
    profile, overrides, exclusionFlags, contradictions,
    setProfile, setOverride, setExclusion, resetOverrides,
  } = useProfileStore();

  const impl = DEFAULT_PROFILES[profile].implications;
  const desc = DEFAULT_PROFILES[profile].description;

  const getSliderValue = (key: NumericCostingKey): number => {
    if (overrides[key] !== undefined) return overrides[key];
    if (key === 'use_hills') return DEFAULT_PROFILES[profile].costing.use_hills;
    if (key === 'street_avoidance') return impl.street_avoidance / 100;
    if (key === 'avoid_bad_surfaces') return impl.surface_strictness / 100;
    return 0;
  };
  const isOverridden = (key: NumericCostingKey): boolean => overrides[key] !== undefined;

  return (
    <div className="p-3 text-sm">
      {/* Profile selector + settings toggle */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Profil</label>
          <select
            value={profile}
            onChange={(e) => setProfile(e.target.value as ProfileId)}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800 focus:border-blue-500 focus:outline-none"
          >
            {PROFILE_IDS.map((p) => (<option key={p} value={p}>{p}</option>))}
          </select>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={'shrink-0 rounded p-1.5 ' + (showSettings ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:bg-gray-100')}
          title="Feinregler & Ausschluesse"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
      <p className="mt-0.5 text-xs text-gray-400">{desc}</p>

      {/* Expandable settings */}
      {showSettings && (
        <div className="mt-3 border-t border-gray-100 pt-2">
          {/* Sliders */}
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Feinregler</label>
          {SLIDER_SPECS.map(({ key, label }) => {
            const value = getSliderValue(key);
            return (
              <div key={key} className="mb-2">
                <div className="flex justify-between">
                  <span className="text-xs text-gray-600">{label}</span>
                  <span className="text-xs tabular-nums text-gray-500">{value.toFixed(2)}</span>
                </div>
                <input type="range" min={0} max={1} step={0.05} value={value}
                  onChange={(e) => setOverride(key, parseFloat(e.target.value))}
                  className={'mt-0.5 h-1.5 w-full cursor-pointer appearance-none rounded-full ' + (isOverridden(key) ? 'bg-blue-400' : 'bg-gray-200') + ' [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:ring-1 [&::-webkit-slider-thumb]:ring-gray-300'}
                />
              </div>
            );
          })}
          {Object.keys(overrides).length > 0 && (
            <button onClick={resetOverrides} className="mt-1 text-xs text-blue-600 hover:text-blue-800">Auf Standard</button>
          )}

          {/* Exclusions */}
          <div className="mt-2 border-t border-gray-100 pt-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Ausschluesse</label>
            {EXCLUSION_SPECS.map(({ key, label, description }) => {
              const effective = exclusionFlags[key] !== undefined ? exclusionFlags[key]
                : key === 'exclude_unpaved' ? impl.exclude_unpaved : false;
              return (
                <label key={key} className="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-gray-50 rounded px-1">
                  <input type="checkbox" checked={!!effective}
                    onChange={(e) => setExclusion(key, e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-gray-700">{label}</span>
                    <p className="text-[10px] text-gray-400">{description}</p>
                  </div>
                </label>
              );
            })}
          </div>

          {/* Contradictions */}
          {contradictions.length > 0 && (
            <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-1.5">
              {contradictions.map((c, i) => (
                <div key={i} className="flex items-start gap-1 text-xs text-amber-800">
                  <span className="shrink-0">⚠️</span><span>{c.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
