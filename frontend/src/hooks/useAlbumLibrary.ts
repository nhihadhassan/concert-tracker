import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAlbums } from '../lib/api'
import { supabase } from '../lib/supabase'

const ALBUMS_KEY = ['album-library'] as const

export function useAlbumLibrary(accessToken: string) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ALBUMS_KEY,
    queryFn: () => fetchAlbums(accessToken),
  })

  useEffect(() => {
    const client = supabase
    if (!client) return
    const channel = client
      .channel('album-library')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'albums' }, () => {
        void queryClient.invalidateQueries({ queryKey: ALBUMS_KEY })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'album_tracks' }, () => {
        void queryClient.invalidateQueries({ queryKey: ALBUMS_KEY })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'album_reviews' }, () => {
        void queryClient.invalidateQueries({ queryKey: ALBUMS_KEY })
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'album_track_reviews' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ALBUMS_KEY })
        },
      )
      .subscribe()
    return () => {
      void client.removeChannel(channel)
    }
  }, [queryClient])

  return {
    albums: query.data?.albums ?? [],
    error: query.error instanceof Error ? query.error.message : '',
    loading: query.isLoading,
    refetch: query.refetch,
  }
}
