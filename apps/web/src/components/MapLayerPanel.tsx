import { useState } from 'react';
import { LAYERS } from '../layers/registry';

interface Props {
  activeLayers: Set<string>;
  onToggle: (layerId: string) => void;
}

export default function MapLayerPanel({ activeLayers, onToggle }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute bottom-3 left-3 z-10">
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-md hover:bg-gray-50 border border-gray-200"
          title="Layer einblenden"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          Layer
        </button>
      )}

      {open && (
        <div className="rounded-lg bg-white shadow-lg border border-gray-200 p-2 min-w-[160px]">
          <div className="flex items-center justify-between mb-1 px-1">
            <span className="text-xs font-semibold text-gray-600">Layer</span>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-600 p-0.5"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {LAYERS.map((layer) => {
            const isActive = activeLayers.has(layer.id);
            return (
              <label
                key={layer.id}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-gray-50 text-xs"
              >
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={() => onToggle(layer.id)}
                  className="h-3 w-3 accent-blue-600"
                />
                <span className="text-gray-700">{layer.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
