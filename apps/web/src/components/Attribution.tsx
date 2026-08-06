import { LAYERS } from '../layers/registry';

interface AttributionProps {
  activeLayers: Set<string>;
}

export default function Attribution({ activeLayers }: AttributionProps) {
  const attributions = LAYERS.filter((l) => activeLayers.has(l.id)).map((l) => l.attribution);

  if (attributions.length === 0) return null;

  return (
    <div className="absolute bottom-1 right-1 z-10 rounded bg-white/70 px-2 py-0.5 text-[10px] text-gray-600">
      {attributions.map((html, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          <span dangerouslySetInnerHTML={{ __html: html }} />
        </span>
      ))}
    </div>
  );
}
