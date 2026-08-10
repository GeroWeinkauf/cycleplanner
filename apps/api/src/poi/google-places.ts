/**
 * Google Places API integration
 *
 * Fetches place details (opening hours, ratings, etc.) from Google Places API.
 * Results are NOT cached per Google's Terms (must be refreshed live).
 * Includes usage tracking with a 20,000 calls/month limit.
 *
 * API key is read from a file specified by GOOGLE_API_KEY_FILE env var,
 * defaulting to /auth/google-api-key.txt (mounted via Docker volume).
 * This file is .gitignore'd and never committed.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Poi } from '@cycleplanner/shared';

// Load .env manually since tsx doesn't auto-load it
function loadEnvFile(): void {
  try {
    const envPath = resolve(process.cwd(), '.env');
    if (existsSync(envPath)) {
      const lines = readFileSync(envPath, 'utf-8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch { /* ignore */ }
}
loadEnvFile();

const KEY_FILE = resolve(process.cwd(), process.env.GOOGLE_API_KEY_FILE || 'auth/google-api-key.txt');
const USAGE_FILE = process.env.GOOGLE_USAGE_FILE || resolve(process.cwd(), 'data/usage/google-places-usage.json');
const MONTHLY_LIMIT = 20000;

// ── API Key ─────────────────────────────────

function loadApiKey(): string {
  try {
    if (existsSync(KEY_FILE)) {
      return readFileSync(KEY_FILE, 'utf-8').trim();
    }
  } catch { /* fall through */ }
  return '';
}

// ── Usage tracking ──────────────────────────

interface MonthUsage {
  year: number;
  month: number; // 1-12
  calls: number;
  lastCall: string; // ISO timestamp
}

interface UsageData {
  currentMonth: MonthUsage;
  history: MonthUsage[];
}

function loadUsage(): UsageData {
  try {
    if (existsSync(USAGE_FILE)) {
      return JSON.parse(readFileSync(USAGE_FILE, 'utf-8'));
    }
  } catch { /* fall through */ }
  return { currentMonth: { year: 0, month: 0, calls: 0, lastCall: '' }, history: [] };
}

function saveUsage(data: UsageData): void {
  try {
    const dir = resolve(USAGE_FILE, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch { /* silently fail, usage tracking is best-effort */ }
}

function getCurrentMonthKey(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function rotateMonthIfNeeded(data: UsageData): UsageData {
  const now = getCurrentMonthKey();
  if (data.currentMonth.year === now.year && data.currentMonth.month === now.month) {
    return data;
  }
  // Push old month to history, start fresh
  if (data.currentMonth.calls > 0) {
    data.history.push({ ...data.currentMonth });
    // Keep only last 12 months
    if (data.history.length > 12) {
      data.history = data.history.slice(-12);
    }
  }
  data.currentMonth = { year: now.year, month: now.month, calls: 0, lastCall: new Date().toISOString() };
  return data;
}

function trackUsage(data: UsageData): { allowed: boolean; callsThisMonth: number } {
  data = rotateMonthIfNeeded(data);
  data.currentMonth.calls++;
  data.currentMonth.lastCall = new Date().toISOString();
  saveUsage(data);
  return {
    allowed: data.currentMonth.calls <= MONTHLY_LIMIT,
    callsThisMonth: data.currentMonth.calls,
  };
}

export function getUsageStats(): UsageData {
  return loadUsage();
}

export interface GooglePlaceDetails {
  place_id: string;
  name: string;
  formatted_address: string;
  rating?: number;
  user_ratings_total?: number;
  opening_hours?: {
    open_now: boolean;
    weekday_text: string[];
  };
  formatted_phone_number?: string;
  website?: string;
  types: string[];
  business_status?: string;
  price_level?: number;
}

/**
 * Find a Google Place near a POI by name and location.
 * Aborts if monthly call limit (20k) is reached.
 */
export async function findGooglePlace(
  poi: Poi,
): Promise<{ place: GooglePlaceDetails | null; usage: { callsThisMonth: number; limit: number } }> {
  const apiKey = loadApiKey();
  const usageData = loadUsage();

  if (!apiKey) {
    return { place: null, usage: { callsThisMonth: usageData.currentMonth.calls, limit: MONTHLY_LIMIT } };
  }

  const { allowed, callsThisMonth } = trackUsage(usageData);
  if (!allowed) {
    console.warn(`[google-places] Monthly limit of ${MONTHLY_LIMIT} calls reached (${callsThisMonth} this month). Skipping.`);
    return { place: null, usage: { callsThisMonth, limit: MONTHLY_LIMIT } };
  }

  try {
    // Step 1: Search for the place nearby
    const searchUrl = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    searchUrl.searchParams.set('key', apiKey);
    searchUrl.searchParams.set('location', `${poi.lat},${poi.lng}`);
    searchUrl.searchParams.set('radius', '500');
    searchUrl.searchParams.set('keyword', poi.name || 'supermarket');
    searchUrl.searchParams.set('type', 'supermarket');
    searchUrl.searchParams.set('language', 'de');

    const searchRes = await fetch(searchUrl.toString());
    if (!searchRes.ok) return { place: null, usage: { callsThisMonth, limit: MONTHLY_LIMIT } };

    const searchData = await searchRes.json() as {
      results?: Array<{ place_id: string; name: string }>;
      status: string;
    };

    if (searchData.status !== 'OK' || !searchData.results?.length) {
      return { place: null, usage: { callsThisMonth, limit: MONTHLY_LIMIT } };
    }

    const best = searchData.results[0];

    // Step 2: Get details
    const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    detailsUrl.searchParams.set('key', apiKey);
    detailsUrl.searchParams.set('place_id', best.place_id);
    detailsUrl.searchParams.set('language', 'de');
    detailsUrl.searchParams.set('fields', 'name,formatted_address,rating,user_ratings_total,opening_hours,formatted_phone_number,website,types,business_status,price_level');

    const detailsRes = await fetch(detailsUrl.toString());
    if (!detailsRes.ok) return { place: null, usage: { callsThisMonth, limit: MONTHLY_LIMIT } };

    const detailsData = await detailsRes.json() as {
      result?: GooglePlaceDetails;
      status: string;
    };

    if (detailsData.status !== 'OK') {
      return { place: null, usage: { callsThisMonth, limit: MONTHLY_LIMIT } };
    }

    return { place: detailsData.result || null, usage: { callsThisMonth, limit: MONTHLY_LIMIT } };
  } catch {
    return { place: null, usage: { callsThisMonth, limit: MONTHLY_LIMIT } };
  }
}