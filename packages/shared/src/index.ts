// Shared types for CyclePlanner — imported by both web and api

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

/** Supported routing profiles */
export type Profile = 'Rennrad' | 'Trekking' | 'Gravel' | 'MTB';

/** Costing options passed through to Valhalla */
export interface CostingOptions {
  bicycle_type?: string;
  use_hills?: number;
  use_ferry?: number;
  avoid_bad_surfaces?: number;
  use_living_streets?: number;
  use_trails?: number;
  service_penalty?: number;
  exclude_ferries?: boolean;
  exclude_highways?: boolean;
  [key: string]: unknown;
}

/** Request body for POST /api/route */
export interface RouteRequest {
  waypoints: Waypoint[];
  profile: Profile;
  costingOptions?: CostingOptions;
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
