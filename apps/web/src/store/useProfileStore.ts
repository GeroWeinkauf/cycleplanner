import { create } from 'zustand';
import type {
  ProfileId,
  ProfileConfig,
  CostingOverrides,
  ExclusionFlags,
  NumericCostingKey,
} from '@cycleplanner/shared';

// ── Default profiles (loaded from config/profiles.json at build time,
//    but we embed the defaults here for the store fallback) ──
const DEFAULT_PROFILES: Record<ProfileId, ProfileConfig> = {
  Tourenrad: {
    label: 'Tourenrad',
    costing: {
      bicycle_type: 'Hybrid',
      cycling_speed: 20,
      use_hills: 0.35,
      use_ferry: 0.5,
      avoid_bad_surfaces: 0.6,
      use_living_streets: 0.6,
      service_penalty: 0,
      maneuver_penalty: 5,
      gate_penalty: 300,
      driveway_penalty: 300,
      alley_factor: 1.0,
      country_crossing_penalty: 0,
      use_trails: 0.5,
    },
    implications: {
      exclude_unpaved: false,
      surface_strictness: 60,
      street_avoidance: 15,
      ferry_allowance: 'medium',
    },
    description: 'Tourenrad – ausgewogen, zieht auf das Radwegenetz.',
  },
  Rennrad: {
    label: 'Rennrad',
    costing: {
      bicycle_type: 'Road',
      cycling_speed: 27,
      use_hills: 0.5,
      use_ferry: 0.3,
      avoid_bad_surfaces: 0.95,
      use_living_streets: 0.4,
      service_penalty: 0,
      maneuver_penalty: 10,
      gate_penalty: 500,
      driveway_penalty: 500,
      alley_factor: 1.0,
      country_crossing_penalty: 0,
      use_trails: 0.3,
    },
    implications: {
      exclude_unpaved: true,
      surface_strictness: 95,
      street_avoidance: 50,
      ferry_allowance: 'low',
    },
    description: 'Rennrad – Schotter per Definition ausgeschlossen.',
  },
  Gravel: {
    label: 'Gravel',
    costing: {
      bicycle_type: 'Cross',
      cycling_speed: 21,
      use_hills: 0.5,
      use_ferry: 0.5,
      avoid_bad_surfaces: 0.15,
      use_living_streets: 0.5,
      service_penalty: 0,
      maneuver_penalty: 3,
      gate_penalty: 100,
      driveway_penalty: 100,
      alley_factor: 1.0,
      country_crossing_penalty: 0,
      use_trails: 0.75,
    },
    implications: {
      exclude_unpaved: false,
      surface_strictness: 15,
      street_avoidance: 20,
      ferry_allowance: 'medium',
    },
    description: 'Gravel – unbefestigte Abschnitte erwünscht.',
  },
  MTB: {
    label: 'MTB',
    costing: {
      bicycle_type: 'Mountain',
      cycling_speed: 16,
      use_hills: 0.8,
      use_ferry: 0.5,
      avoid_bad_surfaces: 0.05,
      use_living_streets: 0.5,
      service_penalty: 0,
      maneuver_penalty: 2,
      gate_penalty: 50,
      driveway_penalty: 50,
      alley_factor: 1.0,
      country_crossing_penalty: 0,
      use_trails: 1,
    },
    implications: {
      exclude_unpaved: false,
      surface_strictness: 5,
      street_avoidance: 10,
      ferry_allowance: 'medium',
    },
    description: 'Mountainbike – alles fahrbar.',
  },
};

// ── Contradiction detection ───
interface Contradiction {
  message: string;
  /** The key of the exclusion or override causing the contradiction */
  source: string;
}

function detectContradictions(
  profile: ProfileId,
  exclusionFlags: ExclusionFlags,
  overrides: CostingOverrides,
): Contradiction[] {
  const contradictions: Contradiction[] = [];
  const impl = DEFAULT_PROFILES[profile].implications;

  // Gravel + unpaved exclusion = contradiction
  if (profile === 'Gravel' && exclusionFlags.exclude_unpaved) {
    contradictions.push({
      message:
        'Gravel-Profil mit Ausschluss unbefestigter Wege – das widerspricht dem Profilzweck.',
      source: 'exclude_unpaved',
    });
  }

  // MTB + surface strictness >= 0.4
  const effectiveSurface = overrides.avoid_bad_surfaces ?? impl.surface_strictness / 100;
  if (profile === 'MTB' && effectiveSurface >= 0.4) {
    contradictions.push({
      message:
        'Mountainbike-Profil mit hoher Oberflächenstrenge – unbefestigte Wege werden gemieden.',
      source: 'avoid_bad_surfaces',
    });
  }

  // Rennrad + trails
  const effectiveTrails = overrides.use_trails ?? DEFAULT_PROFILES[profile].costing.use_trails;
  if (profile === 'Rennrad' && effectiveTrails > 0.5) {
    contradictions.push({
      message: 'Rennrad-Profil mit hoher Trail-Präferenz – ungewöhnliche Kombination.',
      source: 'use_trails',
    });
  }

  return contradictions;
}

// ── Store ────────────────────

interface ProfileState {
  /** Currently selected profile */
  profile: ProfileId;

  /** User overrides for costing sliders (only set if user touched them) */
  overrides: CostingOverrides;

  /** User toggled exclusion flags */
  exclusionFlags: ExclusionFlags;

  /** Active contradiction warnings */
  contradictions: Contradiction[];

  // Actions
  setProfile: (profile: ProfileId) => void;
  setOverride: (key: NumericCostingKey, value: number | undefined) => void;
  setDisableHierarchyPruning: (value: boolean | undefined) => void;
  setExclusion: (key: keyof ExclusionFlags, value: boolean) => void;
  resetOverrides: () => void;

  // Derived helpers
  getEffectiveCosting: () => CostingOverrides & { profile: ProfileId };
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: 'Tourenrad',
  overrides: {},
  exclusionFlags: {},
  contradictions: [],

  setProfile: (profile) => {
    const state = get();
    // Reset overrides when switching profiles; keep exclusion flags
    const newOverrides: CostingOverrides = {};
    const contradictions = detectContradictions(profile, state.exclusionFlags, newOverrides);

    set({
      profile,
      overrides: newOverrides,
      contradictions,
    });
  },

  setOverride: (key, value) => {
    const state = get();
    const baseImpl = DEFAULT_PROFILES[state.profile].implications;
    const baseCosting = DEFAULT_PROFILES[state.profile].costing;

    // Map slider key to the profile base value
    let baseValue: number;
    if (key === 'street_avoidance') {
      baseValue = baseImpl.street_avoidance / 100;
    } else if (key === 'avoid_bad_surfaces') {
      baseValue = baseImpl.surface_strictness / 100;
    } else {
      baseValue = baseCosting[key] ?? 0;
    }

    // If value equals base, remove override; otherwise set it
    const newOverrides: CostingOverrides = { ...state.overrides };
    if (value === undefined || Math.abs(value - baseValue) < 0.001) {
      delete newOverrides[key];
    } else {
      newOverrides[key] = value;
    }

    const contradictions = detectContradictions(
      state.profile,
      state.exclusionFlags,
      newOverrides,
    );

    set({ overrides: newOverrides, contradictions });
  },

  setDisableHierarchyPruning: (value) => {
    const state = get();
    const newOverrides: CostingOverrides = { ...state.overrides };
    if (value === undefined) {
      delete newOverrides.disable_hierarchy_pruning;
    } else {
      newOverrides.disable_hierarchy_pruning = value;
    }
    set({
      overrides: newOverrides,
      contradictions: detectContradictions(state.profile, state.exclusionFlags, newOverrides),
    });
  },

  setExclusion: (key, value) => {
    const state = get();
    const newExclusions: ExclusionFlags = { ...state.exclusionFlags };

    // If value matches auto-implication, remove manual override
    const impl = DEFAULT_PROFILES[state.profile].implications;
    if (key === 'exclude_unpaved' && value === impl.exclude_unpaved) {
      delete newExclusions[key];
    } else {
      newExclusions[key] = value;
    }

    const contradictions = detectContradictions(state.profile, newExclusions, state.overrides);

    set({ exclusionFlags: newExclusions, contradictions });
  },

  resetOverrides: () => {
    const state = get();
    set({
      overrides: {},
      contradictions: detectContradictions(state.profile, state.exclusionFlags, {}),
    });
  },

  getEffectiveCosting: () => {
    const state = get();
    const base = DEFAULT_PROFILES[state.profile];

    return {
      profile: state.profile,
      cycling_speed: state.overrides.cycling_speed ?? base.costing.cycling_speed,
      use_hills: state.overrides.use_hills ?? base.costing.use_hills,
      street_avoidance: state.overrides.street_avoidance ?? base.implications.street_avoidance / 100,
      avoid_bad_surfaces:
        state.overrides.avoid_bad_surfaces ?? base.implications.surface_strictness / 100,
      use_ferry: state.overrides.use_ferry ?? base.costing.use_ferry,
      use_living_streets: state.overrides.use_living_streets ?? base.costing.use_living_streets,
      service_penalty: state.overrides.service_penalty ?? base.costing.service_penalty,
      maneuver_penalty: state.overrides.maneuver_penalty ?? base.costing.maneuver_penalty,
      gate_penalty: state.overrides.gate_penalty ?? base.costing.gate_penalty,
      driveway_penalty: state.overrides.driveway_penalty ?? base.costing.driveway_penalty,
      alley_factor: state.overrides.alley_factor ?? base.costing.alley_factor,
      country_crossing_penalty: state.overrides.country_crossing_penalty ?? base.costing.country_crossing_penalty,
      use_trails: state.overrides.use_trails ?? base.costing.use_trails,
      disable_hierarchy_pruning: state.overrides.disable_hierarchy_pruning,
    };
  },
}));

// Re-export for convenience
export { DEFAULT_PROFILES };
