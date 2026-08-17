import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SavedSegment } from '@cycleplanner/shared';

const API_BASE = '/api';

/**
 * Segment library: saved favorite route parts (SQLite-backed via the API).
 */
export function useSegments() {
  const queryClient = useQueryClient();

  const query = useQuery<{ segments: SavedSegment[] }>({
    queryKey: ['segments'],
    queryFn: async () => {
      const res = await fetch(API_BASE + '/segments');
      if (!res.ok) throw new Error('Segments fetch failed: ' + res.status);
      return res.json() as Promise<{ segments: SavedSegment[] }>;
    },
    staleTime: 30 * 1000,
    retry: 1,
  });

  const saveSegment = async (name: string, geometry: Array<[number, number]>): Promise<boolean> => {
    try {
      const res = await fetch(API_BASE + '/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, geometry }),
      });
      if (!res.ok) return false;
      await queryClient.invalidateQueries({ queryKey: ['segments'] });
      return true;
    } catch {
      return false;
    }
  };

  const deleteSegment = async (id: number): Promise<void> => {
    try {
      await fetch(API_BASE + '/segments/' + id, { method: 'DELETE' });
      await queryClient.invalidateQueries({ queryKey: ['segments'] });
    } catch { /* ignore */ }
  };

  return {
    segments: query.data?.segments ?? [],
    isLoading: query.isLoading,
    saveSegment,
    deleteSegment,
  };
}
