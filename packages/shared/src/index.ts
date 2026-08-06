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

/** Summary of a computed route */
export interface RouteSummary {
  distanceKm: number;
  durationMin: number;
  ascentM: number;
  descentM: number;
}

/** Health check response */
export interface HealthStatus {
  status: string;
}
