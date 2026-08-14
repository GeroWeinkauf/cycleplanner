import { describe, it, expect } from 'vitest';

// Parse final output without calling the LLM
function parseFinalOutput(content: string): { waypoints: Array<{ lat: number; lng: number; label: string }>; summary: string } | null {
  const jsonMatch = content.match(/\{[\s\S]*"waypoints"[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.waypoints && Array.isArray(parsed.waypoints)) {
      return {
        waypoints: parsed.waypoints.map((wp: Record<string, unknown>) => ({
          lat: wp.lat as number,
          lng: wp.lng as number,
          label: (wp.label as string) || '',
        })),
        summary: (parsed.summary as string) || '',
      };
    }
  } catch {
    // parse failed
  }

  return null;
}

describe('AI Agent output parsing', () => {
  it('parses valid JSON with waypoints', () => {
    const content = `Here is your tour plan:
\`\`\`json
{
  "waypoints": [
    { "lat": 51.34, "lng": 12.37, "label": "Start" },
    { "lat": 51.29, "lng": 12.45, "label": "Kaffeepause" },
    { "lat": 51.34, "lng": 12.37, "label": "Ende" }
  ],
  "summary": "A 45km gravel tour"
}
\`\`\`
`;

    const result = parseFinalOutput(content);
    expect(result).not.toBeNull();
    expect(result!.waypoints).toHaveLength(3);
    expect(result!.waypoints[0].lat).toBe(51.34);
    expect(result!.waypoints[1].label).toBe('Kaffeepause');
    expect(result!.summary).toBe('A 45km gravel tour');
  });

  it('parses JSON without markdown fences', () => {
    const content = '{"waypoints":[{"lat":52.0,"lng":13.0,"label":"Berlin"}],"summary":"City tour"}';
    const result = parseFinalOutput(content);
    expect(result).not.toBeNull();
    expect(result!.waypoints).toHaveLength(1);
  });

  it('returns null for invalid content', () => {
    const content = 'No waypoints here, just text.';
    const result = parseFinalOutput(content);
    expect(result).toBeNull();
  });

  it('returns null for JSON without waypoints array', () => {
    const content = '{"something": "else"}';
    const result = parseFinalOutput(content);
    expect(result).toBeNull();
  });

  it('handles malformed JSON gracefully', () => {
    const content = '{"waypoints": [{"lat": 1, "lng": 2, label: unquoted}]}';
    const result = parseFinalOutput(content);
    expect(result).toBeNull();
  });
});
