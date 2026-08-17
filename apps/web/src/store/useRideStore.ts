import { create } from 'zustand';

/**
 * Ride settings: average speed for time estimates and an optional
 * start time used for the weather overlay (defaults to "now").
 */
interface RideSettingsState {
  /** Average speed in km/h used for duration estimates */
  avgSpeedKmh: number;
  /** Optional start time as datetime-local string (YYYY-MM-DDTHH:mm), null = now */
  startTime: string | null;
  setAvgSpeedKmh: (v: number) => void;
  setStartTime: (v: string | null) => void;
}

export const useRideStore = create<RideSettingsState>((set) => ({
  avgSpeedKmh: 18,
  startTime: null,
  setAvgSpeedKmh: (v) => set({ avgSpeedKmh: Math.max(5, Math.min(40, v)) }),
  setStartTime: (v) => set({ startTime: v }),
}));
