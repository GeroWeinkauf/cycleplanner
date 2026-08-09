import { POI_CATEGORIES } from '@cycleplanner/shared';
import type { Poi } from '@cycleplanner/shared';

interface Props {
  poi: Poi | null;
  onClose: () => void;
  onFlyTo?: (lng: number, lat: number) => void;
}

/**
 * POI Detail Popup (P4-2)
 *
 * Shows detailed information about a selected POI with
 * category, name, address, and source attribution.
 */
export default function PoiDetail({ poi, onClose, onFlyTo }: Props) {
  if (!poi) return null;

  const meta = POI_CATEGORIES.find((c) => c.key === poi.category);

  // Extract useful tags for display
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
  const openingHours = poi.tags.opening_hours;

  const detailRows: Array<{ label: string; value: string }> = [];
  if (address) detailRows.push({ label: 'Adresse', value: address });
  if (phone) detailRows.push({ label: 'Telefon', value: phone });
  if (website) detailRows.push({ label: 'Website', value: website });
  if (openingHours) detailRows.push({ label: 'Öffnungszeiten', value: openingHours });

  return (
    <div className="fixed bottom-16 left-1/2 z-30 w-80 -translate-x-1/2 rounded-lg border border-gray-200 bg-white shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-lg bg-indigo-50 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{meta?.icon || '📍'}</span>
          <div>
            <div className="text-sm font-semibold text-gray-900">
              {poi.name || meta?.label || poi.category}
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

      {/* Details */}
      <div className="px-3 py-2">
        {detailRows.length > 0 ? (
          <div className="flex flex-col gap-1">
            {detailRows.map((row, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium text-gray-700">{row.label}: </span>
                <span className="text-gray-600 break-all">
                  {row.value.startsWith('http') ? (
                    <a
                      href={row.value}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {row.value.replace(/^https?:\/\//, '')}
                    </a>
                  ) : (
                    row.value
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-400">Keine Details verfügbar.</div>
        )}

        {/* Coordinates + source */}
        <div className="mt-2 flex items-center justify-between text-[10px] text-gray-400">
          <span>
            {poi.lat.toFixed(5)}, {poi.lng.toFixed(5)}
          </span>
          <span>
            Daten: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" className="hover:underline">OSM</a>
          </span>
        </div>

        {/* Actions */}
        <div className="mt-2 flex gap-2">
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
      </div>
    </div>
  );
}
