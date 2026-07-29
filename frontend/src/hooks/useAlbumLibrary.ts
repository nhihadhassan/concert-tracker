import { useQuery } from '@tanstack/react-query'
import { fetchAlbums } from '../lib/api'

const ALBUMS_KEY = ['album-library'] as const
// Realtime needed a signed-in Supabase client; without one the shelf polls instead.
const REFRESH_INTERVAL_MS = 60_000

export function useAlbumLibrary() {
  const query = useQuery({
    queryKey: ALBUMS_KEY,
    queryFn: () => fetchAlbums(),
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true,
  })

  return {
    albums: query.data?.albums ?? [],
    error: query.error instanceof Error ? query.error.message : '',
    loading: query.isLoading,
    refetch: query.refetch,
  }
}
