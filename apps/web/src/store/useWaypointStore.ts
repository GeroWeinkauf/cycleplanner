import { create } from 'zustand';

export interface Waypoint {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  type: 'break' | 'through';
}

interface WaypointState {
  waypoints: Waypoint[];
  /** Segment to block, as [lng, lat][] polyline */
  blockedSegment: Array<[number, number]> | null;
  /** Imported GPX tracks: filename → geometry polyline string */
  importedTracks: Record<string, string>;
  addWaypoint: (lat: number, lng: number, type?: 'break' | 'through') => void;
  insertWaypointAt: (index: number, lat: number, lng: number) => void;
  moveWaypoint: (id: string, lat: number, lng: number) => void;
  setWaypointType: (id: string, type: 'break' | 'through') => void;
  removeWaypoint: (id: string) => void;
  reorderWaypoints: (fromIndex: number, toIndex: number) => void;
  reverseWaypoints: () => void;
  clearWaypoints: () => void;
  setBlockedSegment: (segment: Array<[number, number]> | null) => void;
  addImportedTrack: (filename: string, geometry: string) => void;
  removeImportedTrack: (filename: string) => void;
  clearImportedTracks: () => void;
}

let nextId = 1;
function uid(): string {
  return `wp-${nextId++}-${Date.now().toString(36)}`;
}

export const useWaypointStore = create<WaypointState>((set) => ({
  waypoints: [],
  blockedSegment: null,
  importedTracks: {},

  addWaypoint: (lat, lng, type = 'break') =>
    set((state) => {
      const isFirst = state.waypoints.length === 0;
      const wp: Waypoint = {
        id: uid(),
        lat,
        lng,
        type,
        label: isFirst ? 'Start' : undefined,
      };
      return { waypoints: [...state.waypoints, wp] };
    }),

  insertWaypointAt: (index, lat, lng) =>
    set((state) => {
      const wp = { id: uid(), lat, lng, type: 'through' as const };
      const next = [...state.waypoints];
      next.splice(index, 0, wp);
      return { waypoints: next };
    }),

  moveWaypoint: (id, lat, lng) =>
    set((state) => ({
      waypoints: state.waypoints.map((wp) => (wp.id === id ? { ...wp, lat, lng } : wp)),
    })),

  setWaypointType: (id, type) =>
    set((state) => ({
      waypoints: state.waypoints.map((wp) => (wp.id === id ? { ...wp, type } : wp)),
    })),

  removeWaypoint: (id) =>
    set((state) => ({
      waypoints: state.waypoints.filter((wp) => wp.id !== id),
    })),

  reorderWaypoints: (fromIndex, toIndex) =>
    set((state) => {
      const next = [...state.waypoints];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { waypoints: next };
    }),

  reverseWaypoints: () =>
    set((state) => ({
      waypoints: [...state.waypoints].reverse(),
    })),

  clearWaypoints: () => set({ waypoints: [], blockedSegment: null }),

  setBlockedSegment: (segment) => set({ blockedSegment: segment }),

  addImportedTrack: (filename, geometry) =>
    set((state) => ({
      importedTracks: { ...state.importedTracks, [filename]: geometry },
    })),

  removeImportedTrack: (filename) =>
    set((state) => {
      const next = { ...state.importedTracks };
      delete next[filename];
      return { importedTracks: next };
    }),

  clearImportedTracks: () => set({ importedTracks: {} }),
}));
