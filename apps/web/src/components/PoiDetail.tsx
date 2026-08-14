import { useState, useEffect } from 'react';
import { POI_CATEGORIES } from '@cycleplanner/shared';
import type { Poi } from '@cycleplanner/shared';

interface Props {
  poi: Poi | null;
  onClose: () => void;
  onFlyTo?: (lng: number, lat: number) => void;
  onGoogleMaps?: (poi: Poi) => void;
}

interface GooglePlaceData {
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
 * POI Detail Popup with Google Places enrichment (P4-2)
 *
 * Shows OSM + Google Places information about a selected POI.
 * Fetches live Google details for supermarkets, cafes, restaurants.
 */
export default function PoiDetail({ poi, onClose, onFlyTo, onGoogleMaps }: Props) {
  const [googlePlace, setGooglePlace] = useState<GooglePlaceData | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState(false);

  // Fetch Google Places details when a relevant POI is selected
  useEffect(() => {
    setGooglePlace(null);
    setGoogleError(false);
    if (!poi) return;

    const fetchGoogle = ['supermarket', 'restaurant', 'cafe', 'bakery'].includes(poi.category);
    if (!fetchGoogle) return;

    setGoogleLoading(true);
    fetch('/api/pois/google-place', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: poi.name,
        lat: poi.lat,
        lng: poi.lng,
        category: poi.category,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.place) {
          setGooglePlace(data.place as GooglePlaceData);
        }
        setGoogleLoading(false);
      })
      .catch(() => {
        setGoogleError(true);
        setGoogleLoading(false);
      });
  }, [poi]);

  if (!poi) return null;

  const meta = POI_CATEGORIES.find((c) => c.key === poi.category);
  const hasGoogle = googlePlace && !googleError;

  // Extract useful OSM tags
  const address = [
    poi.tags['addr:street'],
    poi.tags['addr:housenumber'],
    poi.tags['addr:city'],
    poi.tags['addr:postcode'],
  ]
    .filter(Boolean)
    .join(' ');

  const website = poi.tags.website || poi.tags['contact:website'];
  const phone = poi.tags.phone || poi.tags['contact:phone'];
  const openingHoursOsm = poi.tags.opening_hours;

  // Price level emojis
  const priceIcons = ['', '💰', '💰💰', '💰💰💰', '💰💰💰💰'];

  return (
    <div className="absolute left-1/2 top-1/2 z-[1100] w-80 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-200 bg-white shadow-xl max-h-[80%] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-lg bg-indigo-50 px-3 py-2 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="text-lg">{meta?.icon || '📍'}</span>
          <div>
            <div className="text-sm font-semibold text-gray-900">
              {googlePlace?.name || poi.name || meta?.label || poi.category}
            </div>
            <div className="text-[10px] text-gray-500">{meta?.label}</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-gray-400 hover:text-gray-600"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Google loading indicator */}
      {googleLoading && (
        <div className="px-3 py-1 text-[10px] text-gray-400 bg-blue-50 text-center">
          🔍 Google-Daten werden geladen...
        </div>
      )}

      {/* Details */}
      <div className="px-3 py-2">
        {/* ── Google Places Data ── */}
        {hasGoogle && (
          <div className="mb-2 rounded bg-amber-50/50 p-2 border border-amber-100">
            <div className="text-[10px] text-amber-700 font-medium mb-1 flex items-center gap-1">
              <span>📍</span> Google Maps
            </div>

            {/* Rating */}
            {googlePlace.rating != null && (
              <div className="flex items-center gap-2 text-xs mb-1">
                <span className="text-amber-500 font-bold text-sm">
                  {'★'.repeat(Math.round(googlePlace.rating))}
                  {'☆'.repeat(5 - Math.round(googlePlace.rating))}
                </span>
                <span className="text-gray-700 font-semibold">{googlePlace.rating}</span>
                {googlePlace.user_ratings_total != null && (
                  <span className="text-gray-400">({googlePlace.user_ratings_total})</span>
                )}
              </div>
            )}

            {/* Opening Status */}
            {googlePlace.opening_hours && (
              <div className="text-xs">
                <span className={googlePlace.opening_hours.open_now ? 'text-green-600' : 'text-red-500'}>
                  {googlePlace.opening_hours.open_now ? '🟢 Jetzt geöffnet' : '🔴 Geschlossen'}
                </span>
              </div>
            )}

            {/* Opening Hours List */}
            {googlePlace.opening_hours?.weekday_text && googlePlace.opening_hours.weekday_text.length > 0 && (
              <details className="mt-1">
                <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-700">
                  Öffnungszeiten anzeigen
                </summary>
                <div className="mt-1 text-[10px] text-gray-600 space-y-0.5 max-h-24 overflow-y-auto">
                  {googlePlace.opening_hours.weekday_text.map((line, i) => (
                    <div key={i} className="flex justify-between">
                      <span>{line.split(':')[0]}</span>
                      <span className="tabular-nums">{line.split(':').slice(1).join(':').trim()}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Address (Google) */}
            {googlePlace.formatted_address && (
              <div className="text-[10px] text-gray-600 mt-1">
                📍 {googlePlace.formatted_address}
              </div>
            )}

            {/* Phone (Google) */}
            {googlePlace.formatted_phone_number && (
              <div className="text-[10px] text-gray-600 mt-0.5">
                📞 {googlePlace.formatted_phone_number}
              </div>
            )}

            {/* Website (Google) */}
            {googlePlace.website && (
              <div className="text-[10px] mt-0.5">
                <a href={googlePlace.website} target="_blank" rel="noopener noreferrer"
                   className="text-blue-600 hover:underline break-all">
                  🌐 {googlePlace.website.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}

            {/* Price level */}
            {googlePlace.price_level != null && (
              <div className="text-[10px] text-gray-500 mt-0.5">
                {priceIcons[Math.min(googlePlace.price_level, 4)]} 
                {googlePlace.price_level === 0 ? 'Kostenlos' :
                 googlePlace.price_level === 1 ? 'Günstig' :
                 googlePlace.price_level === 2 ? 'Moderat' :
                 googlePlace.price_level === 3 ? 'Gehoben' :
                 googlePlace.price_level === 4 ? 'Luxus' : ''}
              </div>
            )}

            {/* Business status */}
            {googlePlace.business_status && googlePlace.business_status !== 'OPERATIONAL' && (
              <div className="text-[10px] text-red-500 mt-0.5">⚠️ {googlePlace.business_status}</div>
            )}
          </div>
        )}

        {/* ── OSM Data (fallback + supplementary) ── */}
        {/* Only show OSM section if no Google data or as supplement */}
        {!hasGoogle && openingHoursOsm && (
          <div className="text-xs text-gray-600 mb-1">
            🕐 OSM: {openingHoursOsm}
          </div>
        )}

        {address && !googlePlace?.formatted_address && (
          <div className="text-xs text-gray-600 mb-1">📍 {address}</div>
        )}
        {phone && !googlePlace?.formatted_phone_number && (
          <div className="text-xs text-gray-600 mb-1">📞 {phone}</div>
        )}
        {website && !googlePlace?.website && (
          <div className="text-xs mb-1">
            <a href={website} target="_blank" rel="noopener noreferrer"
               className="text-blue-600 hover:underline break-all">
              🌐 {website.replace(/^https?:\/\//, '')}
            </a>
          </div>
        )}

        {/* Empty state: no details at all */}
        {!hasGoogle && !address && !phone && !website && !openingHoursOsm && (
          <div className="text-xs text-gray-400 mb-2">Keine Details verfügbar.</div>
        )}

        {/* Coordinates + source */}
        <div className="mt-2 flex items-center justify-between text-[10px] text-gray-400">
          <span>
            {poi.lat.toFixed(5)}, {poi.lng.toFixed(5)}
          </span>
          <span className="flex items-center gap-1">
            {hasGoogle && <span className="text-amber-600">Google</span>}
            <span>
              Daten: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" className="hover:underline">OSM</a>
            </span>
          </span>
        </div>

        {/* Actions */}
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => onGoogleMaps?.(poi)}
            className="flex-1 rounded bg-amber-600 px-2 py-1 text-xs text-white hover:bg-amber-700"
          >
            Google Maps Route
          </button>

          <button
            onClick={() => onFlyTo?.(poi.lng, poi.lat)}
            className="flex-1 rounded bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-700"
          >
            Auf Karte zeigen
          </button>
          <button
            onClick={onClose}
            className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
          >
            Schließen
          </button>
        </div>

        {/* Google attribution (required by ToS) */}
        {hasGoogle && (
          <div className="mt-1 text-[9px] text-gray-400 text-center">
            <img src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png"
                 alt="Powered by Google" className="h-3 inline-block mr-1" />
          </div>
        )}
      </div>
    </div>
  );
}