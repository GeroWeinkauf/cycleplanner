import { LAYERS } from '../layers/registry';

interface LayerPanelProps {
  activeLayers: Set<string>;
  onToggle: (layerId: string) => void;
}

export default function LayerPanel({ activeLayers, onToggle }: LayerPanelProps) {
  return (
    <div>
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Layer
      </div>
      {LAYERS.map((layer) => {
        const isActive = activeLayers.has(layer.id);
        return (
          <label
            key={layer.id}
            className="flex cursor-pointer items-start gap-2 px-3 py-1.5 hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={isActive}
              onChange={() => onToggle(layer.id)}
              className="mt-0.5 h-3.5 w-3.5 accent-blue-600"
            />
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-800">{layer.label}</div>
              {layer.legend && (
                <div className="text-xs text-gray-500">{layer.legend}</div>
              )}
            </div>
          </label>
        );
      })}
    </div>
  );
}
