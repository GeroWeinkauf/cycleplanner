// ── Shared types for CyclePlanner — imported by both web and api ──

/** A geographic coordinate pair */
export interface LatLng {
  lat: number;
  lng: number;
}

/** A route waypoint (input from the user) */
export interface Waypoint {
  lat: number;
  lng: number;
  label?: string;
}

/** Supported routing profile identifiers */
export type ProfileId = 'Tourenrad' | 'Rennrad' | 'Gravel' | 'MTB';

/**
 * Costing options for a profile — exactly the keys Valhalla understands
 * plus cycling_speed which is consumed by the backend only.
 */
export interface ProfileCosting {
  bicycle_type: string;
  cycling_speed: number;
  use_hills: number;
  use_ferry: number;
  avoid_bad_surfaces: number;
  use_living_streets: number;
  service_penalty: number;
  maneuver_penalty: number;
  gate_penalty: number;
  driveway_penalty: number;
  alley_factor: number;
  country_crossing_penalty: number;
  use_trails: number;
}

/** Profile implications (auto-set exclusions, visible in UI) */
export interface ProfileImplications {
  exclude_unpaved: boolean;
  surface_strictness: number;   // 0–100, mirrored from avoid_bad_surfaces*100
  street_avoidance: number;     // 0–100, mirrored from 0…1 scale
  ferry_allowance: 'low' | 'medium' | 'high';
}

/** Full profile definition as stored in config/profiles.json */
export interface ProfileConfig {
  label: string;
  costing: ProfileCosting;
  implications: ProfileImplications;
  description: string;
}

/**
 * Runtime costing overrides coming from the frontend.
 * Only fields the user explicitly changed are present.
 * Covers ALL Valhalla bicycle cost parameters plus our additions.
 */
export interface CostingOverrides {
  // Slope
  use_hills?: number;
  // Road class avoidance
  street_avoidance?: number;
  // Surface strictness
  avoid_bad_surfaces?: number;
  // Ferry willingness
  use_ferry?: number;
  // Living street preference
  use_living_streets?: number;
  // Service road / driveway / alley penalties
  service_penalty?: number;
  // Trail/off-road willingness
  use_trails?: number;
  // Cycling speed in km/h
  cycling_speed?: number;
  // Turn penalty (maneuver penalty in Valhalla)
  maneuver_penalty?: number;
  // Gates (barriers that must be passed on foot)
  gate_penalty?: number;
  // Private/driveway access
  driveway_penalty?: number;
  // Alley preference
  alley_factor?: number;
  // Country crossing penalty
  country_crossing_penalty?: number;
  // Disable hierarchy pruning (expand search to all road classes)
  disable_hierarchy_pruning?: boolean;
}

/** Hard exclusion flags the user can toggle */
export interface ExclusionFlags {
  exclude_unpaved?: boolean;
  exclude_ferries?: boolean;
  exclude_tunnels?: boolean;
  exclude_bridges?: boolean;
  exclude_highways?: boolean;
}

/**
 * Full costing payload sent to Valhalla.
 * Built by the backend: profile defaults → user overrides → exclusion flags.
 */
export interface CostingOptions {
  bicycle_type: string;
  cycling_speed: number;
  use_hills: number;
  use_ferry: number;
  avoid_bad_surfaces: number;
  use_living_streets: number;
  service_penalty: number;
  maneuver_penalty: number;
  gate_penalty: number;
  driveway_penalty: number;
  alley_factor: number;
  country_crossing_penalty: number;
  use_trails: number;
  disable_hierarchy_pruning?: boolean;
  exclude_unpaved?: boolean;
  exclude_ferries?: boolean;
  exclude_tunnels?: boolean;
  exclude_bridges?: boolean;
  exclude_highways?: boolean;
}

/** Request body for POST /api/route */
export interface RouteRequest {
  waypoints: Waypoint[];
  profile: ProfileId;
  costingOverrides?: CostingOverrides;
  exclusionFlags?: ExclusionFlags;
}

/** Summary of a computed route */
export interface RouteSummary {
  distanceKm: number;
  durationMin: number;
  ascentM: number;
  descentM: number;
}

/** Response body for POST /api/route */
export interface RouteResponse {
  geometry: string; // encoded polyline from Valhalla
  summary: RouteSummary;
}

/** Health check response */
export interface HealthStatus {
  status: string;
}

// ── Elevation Profile ──────────────────────

/** A single elevation sample point */
export interface ElevationPoint {
  /** Distance from route start in km */
  distanceKm: number;
  /** Elevation in meters */
  elevation: number;
  /** Latitude at this sample */
  lat: number;
  /** Longitude at this sample */
  lng: number;
}

/** Slope grade classification */
export type SlopeClass = 'flat' | 'gentle' | 'moderate' | 'steep' | 'extreme';

/** Distribution of route by slope steepness */
export interface SlopeDistribution {
  flat: number;      // 0–2%
  gentle: number;    // 2–5%
  moderate: number;  // 5–10%
  steep: number;     // 10–15%
  extreme: number;   // >15%
}

/** Elevation metrics for a route */
export interface ElevationMetrics {
  /** Total ascent in meters */
  totalAscent: number;
  /** Total descent in meters */
  totalDescent: number;
  /** Minimum elevation in meters */
  minElevation: number;
  /** Maximum elevation in meters */
  maxElevation: number;
  /** Average slope in percent */
  avgSlope: number;
  /** Maximum slope in percent (positive = uphill) */
  maxSlope: number;
  /** Distribution by slope classes */
  slopeDistribution: SlopeDistribution;
}

/** Full elevation profile returned by the API */
export interface ElevationProfile {
  /** Sampled elevation points along the route */
  points: ElevationPoint[];
  /** Computed metrics */
  metrics: ElevationMetrics;
}

/** Request body for POST /api/elevation/profile */
export interface ElevationProfileRequest {
  /** Encoded polyline from Valhalla */
  polyline: string;
}

// ── Round Trip ─────────────────────────────

/** Request body for POST /api/tours/roundtrip */
export interface RoundTripRequest {
  lat: number;
  lng: number;
  targetDistanceKm: number;
  profile: ProfileId;
  costingOverrides?: CostingOverrides;
  exclusionFlags?: ExclusionFlags;
}

/** A single round trip variant */
export interface RoundTripVariant {
  id: string;
  geometry: string;
  summary: RouteSummary;
  /** Absolute deviation from target distance in km */
  deviationKm: number;
}

/** Response for POST /api/tours/roundtrip */
export interface RoundTripResponse {
  variants: RoundTripVariant[];
}

// ── GPX Import/Export ──────────────────────

/** Export mode */
export type GpxExportMode = 'track' | 'route' | 'waypoints';

/** Request body for POST /api/export/gpx */
export interface GpxExportRequest {
  /** Encoded polyline from Valhalla */
  geometry: string;
  /** Waypoints along the route */
  waypoints: Array<{ lat: number; lng: number; label?: string }>;
  /** Route name (optional metadata) */
  name?: string;
  /** Export mode */
  mode: GpxExportMode;
}

/** Response for POST /api/export/gpx */
export interface GpxExportResponse {
  /** GPX XML content as string */
  gpx: string;
  /** Suggested filename */
  filename: string;
}

/** Response for POST /api/import/gpx */
export interface GpxImportResponse {
  /** Matched waypoints snapped to the road network */
  waypoints: Array<{ lat: number; lng: number; label?: string }>;
  /** The matched route geometry (encoded polyline) if trace_route was used */
  geometry?: string;
}

// ── Tuning Presets (P2-1) ───────────────────

/** A saved tuning preset — profile + all overrides + exclusions bundled together */
export interface TuningPreset {
  id: string;
  name: string;
  profile: ProfileId;
  overrides: CostingOverrides;
  exclusionFlags: ExclusionFlags;
  /** Whether this is a built-in preset (profiles from P1-2) */
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Request to create a new tuning preset */
export interface TuningPresetCreateRequest {
  name: string;
  profile: ProfileId;
  overrides: CostingOverrides;
  exclusionFlags: ExclusionFlags;
}

/** Request to update an existing preset */
export interface TuningPresetUpdateRequest {
  name?: string;
  profile?: ProfileId;
  overrides?: CostingOverrides;
  exclusionFlags?: ExclusionFlags;
}

/** List response for presets */
export interface TuningPresetListResponse {
  presets: TuningPreset[];
}

// ── Comparison Mode (P2-1) ──────────────────

/** A full parameter snapshot for comparison mode */
export interface TuningSnapshot {
  id: 'A' | 'B';
  profile: ProfileId;
  overrides: CostingOverrides;
  exclusionFlags: ExclusionFlags;
}

// ── Route Analysis (P3-1) ───────────────────

/** A single edge attribute from Valhalla trace_attributes */
export interface EdgeAttributes {
  /** Edge length in km */
  length: number;
  /** Surface type (asphalt, gravel, dirt, etc.) */
  surface: string;
  /** OpenStreetMap road class */
  roadClass: string;
  /** Bike network tag if present (icn, ncn, rcn, lcn) */
  bikeNetwork: string;
  /** Average speed on this edge in km/h */
  speed: number;
  /** Slope percentage (positive = uphill) */
  slope: number;
}

/** Surface distribution: surface type -> percentage */
export interface SurfaceDistribution {
  asphalt: number;
  gravel: number;
  dirt: number;
  paved: number;
  unknown: number;
}

/** Road class distribution: class -> percentage */
export interface RoadClassDistribution {
  motorway: number;
  trunk: number;
  primary: number;
  secondary: number;
  tertiary: number;
  residential: number;
  service: number;
  track: number;
  path: number;
  cycleway: number;
  footway: number;
  other: number;
}

/** Complete route analysis returned by the backend */
export interface RouteAnalysis {
  totalDistanceKm: number;
  durationMin: number;
  totalAscent: number;
  totalDescent: number;
  surfaceDistribution: SurfaceDistribution;
  roadClassDistribution: RoadClassDistribution;
  /** Percentage of route on designated bike networks (0-100) */
  bikeNetworkPercentage: number;
  /** Number of major road crossings */
  crossingCount: number;
  /** Per-edge breakdown (for coloring) */
  edges: EdgeAttributes[];
}

/** Request body for POST /api/route/analyze */
export interface RouteAnalysisRequest {
  geometry: string;
  profile: ProfileId;
}

// ── Quality Score (P3-3) ────────────────────

/** Weight configuration for quality sub-scores */
export interface ScoreWeights {
  surfaceQuality: number;
  bikeInfrastructure: number;
  trafficExposure: number;
  stopDensity: number;
  elevationComfort: number;
  amenityDensity: number;
}

/** Individual sub-score with label and value */
export interface SubScore {
  key: string;
  label: string;
  value: number;       // 0-100
  weight: number;      // 0-1
  weighted: number;    // value * weight
  icon: string;
}

/** Full quality score for a route */
export interface QualityScore {
  /** Overall score 0-100 */
  total: number;
  /** Breakdown by category */
  subScores: SubScore[];
  /** The profile these weights apply to */
  profile: ProfileId;
}

// ── Candidates (P3-4) ───────────────────────

/** A single candidate route with analysis and score */
export interface CandidateRoute {
  id: string;
  geometry: string;
  summary: RouteSummary;
  analysis: RouteAnalysis;
  score: QualityScore;
  /** How this candidate was generated: 'alternative' | 'sweep' */
  source: 'alternative' | 'sweep';
  /** Parameter values used for this candidate */
  params: Record<string, unknown>;
}

/** Request body for POST /api/route/candidates */
export interface CandidatesRequest {
  waypoints: Waypoint[];
  profile: ProfileId;
  costingOverrides?: CostingOverrides;
  exclusionFlags?: ExclusionFlags;
}

/** Response for POST /api/route/candidates */
export interface CandidatesResponse {
  /** Best candidate first */
  candidates: CandidateRoute[];
}

// ── Points of Interest (P4) ─────────────────

/** POI category constants */
export type PoiCategory =
  | 'water'
  | 'toilets'
  | 'restaurant'
  | 'cafe'
  | 'bakery'
  | 'supermarket'
  | 'bikeShop'
  | 'bikeRepair'
  | 'shelter'
  | 'campsite'
  | 'hotel'
  | 'trainStation'
  | 'viewpoint'
  | 'picnic';

/** Source for POI data enrichment */
export type PoiSource = 'openstreetmap' | 'overpass';

/** A single POI */
export interface Poi {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: PoiCategory;
  /** Distance from route start in km (only in corridor mode) */
  distanceKm?: number;
  /** Additional tags */
  tags: Record<string, string>;
  source: PoiSource;
}

/** POI category metadata for display */
export interface PoiCategoryMeta {
  key: PoiCategory;
  label: string;
  icon: string;
  /** OSM tag queries for this category */
  osmTags: string[];
}

/** All POI category metadata */
export const POI_CATEGORIES: PoiCategoryMeta[] = [
  { key: 'water', label: 'Trinkwasser', icon: '💧', osmTags: ['amenity=drinking_water', 'natural=spring'] },
  { key: 'toilets', label: 'WC', icon: '🚻', osmTags: ['amenity=toilets'] },
  { key: 'restaurant', label: 'Restaurants', icon: '🍽️', osmTags: ['amenity=restaurant', 'amenity=fast_food'] },
  { key: 'cafe', label: 'Cafés', icon: '☕', osmTags: ['amenity=cafe', 'shop=coffee'] },
  { key: 'bakery', label: 'Bäckereien', icon: '🥖', osmTags: ['shop=bakery', 'shop=pastry'] },
  { key: 'supermarket', label: 'Supermärkte', icon: '🛒', osmTags: ['shop=supermarket', 'shop=convenience'] },
  { key: 'bikeShop', label: 'Fahrradläden', icon: '🚲', osmTags: ['shop=bicycle'] },
  { key: 'bikeRepair', label: 'Reparatur', icon: '🔧', osmTags: ['amenity=bicycle_repair_station', 'shop=bicycle:repair'] },
  { key: 'shelter', label: 'Unterstände', icon: '🏠', osmTags: ['amenity=shelter', 'tourism=alpine_hut'] },
  { key: 'campsite', label: 'Campingplätze', icon: '🏕️', osmTags: ['tourism=camp_site', 'tourism=caravan_site'] },
  { key: 'hotel', label: 'Hotels', icon: '🏨', osmTags: ['tourism=hotel', 'tourism=guest_house', 'tourism=hostel'] },
  { key: 'trainStation', label: 'Bahnhöfe', icon: '🚂', osmTags: ['railway=station', 'railway=halt'] },
  { key: 'viewpoint', label: 'Aussichtspunkte', icon: '🏔️', osmTags: ['tourism=viewpoint'] },
  { key: 'picnic', label: 'Picknickplätze', icon: '🧺', osmTags: ['tourism=picnic_site', 'leisure=picnic_table'] },
];

/** Request for POI queries */
export interface PoiQueryRequest {
  /** Bounding box: south,west,north,east */
  bbox?: string;
  /** Categories to query (all if empty) */
  categories?: PoiCategory[];
  /** Corridor geometry for along-route queries */
  corridor?: string;
  /** Maximum POIs to return (default 100) */
  limit?: number;
}

/** Response for POI queries */
export interface PoiQueryResponse {
  pois: Poi[];
  source: PoiSource;
}
