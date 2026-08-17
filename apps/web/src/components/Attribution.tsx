import { LAYERS } from '../layers/registry';
import { getBasemap } from '../layers/basemaps';

interface AttributionProps {
  activeLayers: Set<string>;
  basemapId: string;
}

export default function Attribution({ activeLayers, basemapId }: AttributionProps) {
  const basemap = getBasemap(basemapId);
  const attributions = [
    basemap.attribution,
    ...LAYERS.filter((l) => activeLayers.has(l.id)).map((l) => l.attribution),
  ];

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
